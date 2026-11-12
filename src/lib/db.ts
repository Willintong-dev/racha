import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTransaction, type EntityTable } from 'dexie'

export type AccountType = 'banco' | 'efectivo' | 'ahorro' | 'digital'

export interface Account {
  id: string
  userId: string
  name: string
  type: AccountType
  /** Saldo con el que se creó la cuenta. El saldo actual se calcula sumando los movimientos. */
  initialBalance: number
  isPrimary: boolean
  /** Código ISO de la moneda de la cuenta (COP, USD…). Los montos de sus movimientos están en esta moneda. */
  currency: string
  color: string
  archived: boolean
  createdAt: number
}

/**
 * ingreso / gasto: cambian tu dinero.
 * transferencia: mueve dinero entre tus cuentas, no es ingreso ni gasto.
 * pago_deuda: (Fase 2) sale de una cuenta y baja una deuda.
 * ajuste: corrige el saldo para igualarlo al banco. `amount` puede ser negativo.
 */
export type TxType = 'ingreso' | 'gasto' | 'transferencia' | 'pago_deuda' | 'ajuste'

export interface Transaction {
  id: string
  userId: string
  type: TxType
  /** En la moneda de `accountId` */
  amount: number
  accountId: string
  toAccountId?: string
  /** Transferencia entre monedas distintas: cuánto llegó, en la moneda de `toAccountId` */
  toAmount?: number
  /** pago_deuda: a qué deuda se abonó */
  debtId?: string
  categoryId?: string
  /** Fecha local YYYY-MM-DD */
  date: string
  note?: string
  createdAt: number
}

/** Pago que se repite cada mes (cuota de deuda o gasto fijo), en moneda principal. */
export interface MonthlyItem {
  id: string
  name: string
  emoji: string
  amount: number
  /** Gastos fijos: los gastos de esta categoría no cuentan contra el límite diario (ya están presupuestados). */
  categoryId?: string
}

export interface Profile {
  userId: string
  name: string
  avatar: number
  xp: number
  /** Moneda principal: totales, límite diario, ingreso y estadísticas se expresan en ella */
  currency: string
  /** rates[X] = cuántas unidades de la moneda principal vale 1 X */
  rates?: Record<string, number>
  monthlyIncome?: number
  payday?: number
  /** Suma de `debtItems` (se mantiene por compatibilidad) */
  monthlyDebtPayments?: number
  /** Cuotas mensuales de deudas declaradas en el onboarding. En la Fase 2 se convierten en deudas completas. */
  debtItems?: MonthlyItem[]
  fixedExpenses?: MonthlyItem[]
  savingsPct?: number
  dailyLimit?: number
  /** Plan elegido en el simulador de deudas */
  debtPlan?: { strategy: DebtStrategy; extra: number }
  /** Logros desbloqueados: id → fecha (ms) */
  achievements?: Record<string, number>
  /** Lo que tiene puesto el avatar (ids del catálogo del vestidor) */
  wardrobe?: Wardrobe
  /** Congeladores de racha disponibles. undefined = 1 (regalo de bienvenida) */
  freezes?: number
  /** Días (YYYY-MM-DD) salvados con un congelador */
  frozenDays?: string[]
  onboarded: boolean
}

export interface Debt {
  id: string
  userId: string
  name: string
  emoji: string
  /** Moneda de la deuda = moneda de la cuenta desde la que se paga */
  currency: string
  /** Saldo cuando se registró la deuda (para la barra de progreso) */
  originalBalance: number
  /** Lo que falta pagar hoy. Baja con cada pago; "Ajustar saldo" lo iguala al banco. */
  balance: number
  monthlyPayment: number
  /** Día del mes en que vence la cuota (1-31) */
  dueDay: number
  /** Tasa de interés anual en % (opcional) */
  annualRate?: number
  payFromAccountId: string
  createdAt: number
  paidOffAt?: number
  /** Mes (YYYY-MM) en que ya se dio XP por cuota: borrar y repetir un pago no vuelve a dar XP */
  xpCuotaMonth?: string
  /** Día (YYYY-MM-DD) en que ya se dio XP por pago extra */
  xpExtraDay?: string
  /** Ya se dio el XP por liquidarla */
  xpPayoff?: boolean
}

export type DebtStrategy = 'avalancha' | 'bola'

export interface Wardrobe {
  bg?: string
  hat?: string
  frame?: string
  pet?: string
}

/** Usuarios del "modo local" (cuando no hay Supabase configurado). */
export interface LocalUser {
  id: string
  email: string
  passwordHash: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Sincronización: registro de cambios locales
// ---------------------------------------------------------------------------

export type SyncKind = 'profile' | 'account' | 'transaction' | 'debt'

/** Tabla de Dexie → tipo de documento en la nube (`user_docs.kind`). `localUsers` nunca se sincroniza. */
export const SYNC_TABLES = { profiles: 'profile', accounts: 'account', transactions: 'transaction', debts: 'debt' } as const
export type SyncTable = keyof typeof SYNC_TABLES
export const TABLE_OF: Record<SyncKind, SyncTable> = { profile: 'profiles', account: 'accounts', transaction: 'transactions', debt: 'debts' }

/** Un cambio local pendiente de subir. Varios cambios del mismo documento se agrupan al subir. */
export interface OutboxEntry {
  seq?: number
  kind: SyncKind
  id: string
  userId: string
  /** true = se borró (se sube como lápida) */
  deleted: boolean
  ts: number
}

/** Estado de sincronización (lastPulledAt por usuario, decisiones de importación…) */
export interface MetaEntry {
  key: string
  value: unknown
}

/** Marca de las transacciones que aplican cambios bajados de la nube: no deben volver a la cola. */
const REMOTE_TAG = '__rachaRemote'
export function markRemote(trans: unknown) {
  ;(trans as Record<string, unknown>)[REMOTE_TAG] = true
}

const keyOf = (table: SyncTable, row: { id?: string; userId?: string }) => (table === 'profiles' ? row.userId : row.id) as string

/**
 * Middleware de Dexie que registra en `outbox` cada escritura sobre perfiles, cuentas, movimientos
 * y deudas del usuario que sincroniza (`db.syncUserId`). Va en la MISMA transacción que la escritura,
 * así un cambio nunca queda guardado sin su registro (ni al revés).
 */
function outboxMiddleware(owner: RachaDB) {
  return {
    stack: 'dbcore' as const,
    name: 'racha-outbox',
    create(down: DBCore): DBCore {
      return {
        ...down,
        transaction(stores, mode, options) {
          if (mode === 'readwrite' && stores.some((s) => s in SYNC_TABLES) && !stores.includes('outbox')) {
            stores = [...stores, 'outbox']
          }
          return down.transaction(stores, mode, options)
        },
        table(name) {
          const table = down.table(name)
          if (!(name in SYNC_TABLES)) return table
          const tname = name as SyncTable
          const kind = SYNC_TABLES[tname]
          return {
            ...table,
            async mutate(req: DBCoreMutateRequest) {
              const userId = owner.syncUserId
              const trans = req.trans as DBCoreTransaction & Record<string, unknown>
              if (!userId || trans[REMOTE_TAG]) return table.mutate(req)

              // Para los borrados necesitamos leer antes la fila (¿de quién era?)
              let gone: { id?: string; userId?: string }[] = []
              if (req.type === 'delete') {
                gone = (await table.getMany({ trans: req.trans, keys: req.keys })).filter(Boolean)
              } else if (req.type === 'deleteRange') {
                const r = await table.query({
                  trans: req.trans,
                  values: true,
                  query: { index: table.schema.primaryKey, range: req.range },
                })
                gone = r.result
              }

              const res = await table.mutate(req)

              const ts = Date.now()
              const entries: OutboxEntry[] = []
              if (req.type === 'add' || req.type === 'put') {
                req.values.forEach((v: { id?: string; userId?: string }, i: number) => {
                  if (res.failures?.[i] || v?.userId !== userId) return
                  entries.push({ kind, id: keyOf(tname, v), userId, deleted: false, ts })
                })
              } else {
                for (const v of gone) {
                  if (v.userId === userId) entries.push({ kind, id: keyOf(tname, v), userId, deleted: true, ts })
                }
              }
              if (entries.length) {
                await down.table('outbox').mutate({ type: 'add', trans: req.trans, values: entries })
                // Avisamos cuando la transacción ya se guardó (y no si se deshizo)
                const idb = req.trans as unknown as { addEventListener?: (e: string, f: () => void) => void }
                if (idb.addEventListener) idb.addEventListener('complete', () => owner.notifyOutbox())
                else queueMicrotask(() => owner.notifyOutbox())
              }
              return res
            },
          }
        },
      }
    },
  }
}

export class RachaDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  profiles!: EntityTable<Profile, 'userId'>
  localUsers!: EntityTable<LocalUser, 'id'>
  debts!: EntityTable<Debt, 'id'>
  outbox!: EntityTable<OutboxEntry, 'seq'>
  meta!: EntityTable<MetaEntry, 'key'>

  /**
   * Usuario de Supabase cuyos cambios se registran para subir. null = no se registra nada
   * (modo local o sin sesión): los usuarios locales nunca se sincronizan.
   */
  syncUserId: string | null = null
  private outboxListeners = new Set<() => void>()

  /** Escucha cambios locales nuevos en la cola (para sincronizar un poco después) */
  onOutbox(fn: () => void) {
    this.outboxListeners.add(fn)
    return () => {
      this.outboxListeners.delete(fn)
    }
  }
  notifyOutbox() {
    for (const fn of this.outboxListeners) fn()
  }

  constructor(name = 'racha') {
    super(name)
    this.version(1).stores({
      accounts: 'id, userId',
      transactions: 'id, userId, date, accountId',
      profiles: 'userId',
      localUsers: 'id, &email',
    })
    // v2: cada cuenta tiene su moneda. Las existentes heredan la moneda del perfil.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const profiles: Profile[] = await tx.table('profiles').toArray()
        const cur = new Map(profiles.map((p) => [p.userId, p.currency]))
        await tx
          .table('accounts')
          .toCollection()
          .modify((a: Account) => {
            if (!a.currency) a.currency = cur.get(a.userId) ?? 'COP'
          })
      })
    // v3: deudas
    this.version(3).stores({ debts: 'id, userId' })
    // v4: sincronización en la nube (cola de cambios locales + estado)
    this.version(4).stores({ outbox: '++seq, userId', meta: 'key' })
    this.use(outboxMiddleware(this))
  }
}

export const db = new RachaDB()
