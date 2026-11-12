import Dexie, { type EntityTable } from 'dexie'

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
  onboarded: boolean
}

/** Usuarios del "modo local" (cuando no hay Supabase configurado). */
export interface LocalUser {
  id: string
  email: string
  passwordHash: string
  createdAt: number
}

class RachaDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  profiles!: EntityTable<Profile, 'userId'>
  localUsers!: EntityTable<LocalUser, 'id'>

  constructor() {
    super('racha')
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
  }
}

export const db = new RachaDB()
