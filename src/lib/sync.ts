/**
 * Sincronización en la nube (local-first).
 *
 * - Cada escritura local de un usuario de Supabase queda en `db.outbox` (ver middleware en db.ts).
 * - Sincronizar = subir la cola (agrupada por documento) y luego bajar lo que cambió en el servidor
 *   desde la última vez (`updated_at` lo pone el servidor). Gana la última escritura.
 * - Lo bajado se aplica en una transacción marcada como "remota", así no vuelve a la cola.
 *
 * El motor habla con la nube a través de `Remote`, para poder probarlo con un servidor falso en memoria.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { markRemote, TABLE_OF, type LocalUser, type OutboxEntry, type RachaDB, type SyncKind } from './db'

export interface DocRow {
  kind: SyncKind
  id: string
  data: Record<string, unknown>
  deleted: boolean
}

export interface RemoteDoc extends DocRow {
  /** Hora del servidor de la última escritura (ISO) */
  updated_at: string
}

export interface Remote {
  /** Sube (upsert) documentos. Lanza un error si falla. */
  push(userId: string, rows: DocRow[]): Promise<void>
  /** Documentos con updated_at > since (todos si since es null), ordenados por updated_at. */
  pull(userId: string, since: string | null): Promise<RemoteDoc[]>
}

const PAGE = 500
/** Al bajar repasamos unos segundos antes de la última marca por si una escritura tardó en confirmarse. */
const OVERLAP_MS = 5000

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(userId, rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const chunk = rows.slice(i, i + PAGE).map((r) => ({ user_id: userId, kind: r.kind, id: r.id, data: r.data, deleted: r.deleted }))
        const { error } = await client.from('user_docs').upsert(chunk, { onConflict: 'user_id,kind,id' })
        if (error) throw new Error(error.message)
      }
    },
    async pull(userId, since) {
      const out: RemoteDoc[] = []
      for (let from = 0; ; from += PAGE) {
        let q = client.from('user_docs').select('kind,id,data,deleted,updated_at').eq('user_id', userId)
        if (since) q = q.gt('updated_at', since)
        const { data, error } = await q
          .order('updated_at')
          .order('kind')
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        out.push(...((data ?? []) as RemoteDoc[]))
        if (!data || data.length < PAGE) break
      }
      return out
    },
  }
}

// ---------------------------------------------------------------------------
// Estado guardado en db.meta
// ---------------------------------------------------------------------------

const K = {
  pulled: (u: string) => `pulled:${u}`,
  seeded: (u: string) => `seeded:${u}`,
  lastSync: (u: string) => `lastSync:${u}`,
  imported: (u: string) => `import:${u}`,
}

async function getMeta<T>(db: RachaDB, key: string) {
  return (await db.meta.get(key))?.value as T | undefined
}

export const getLastSyncAt = (db: RachaDB, userId: string) => getMeta<number>(db, K.lastSync(userId))

const docKey = (kind: string, id: string) => `${kind}\u0000${id}`

/** JSON con las llaves ordenadas (jsonb no conserva el orden) para comparar documentos. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val,
  )
}

const syncTables = (db: RachaDB) => [db.profiles, db.accounts, db.transactions, db.debts]

/**
 * La primera vez que un usuario sincroniza en este dispositivo, encolamos todo lo que ya tenía
 * (datos creados antes de que existiera la sincronización).
 */
async function seedOutbox(db: RachaDB, userId: string) {
  if (await getMeta(db, K.seeded(userId))) return
  await db.transaction('rw', [...syncTables(db), db.outbox, db.meta], async () => {
    const ts = Date.now()
    const entries: OutboxEntry[] = []
    const p = await db.profiles.get(userId)
    if (p) entries.push({ kind: 'profile', id: userId, userId, deleted: false, ts })
    for (const [kind, table] of [
      ['account', db.accounts],
      ['transaction', db.transactions],
      ['debt', db.debts],
    ] as const) {
      const keys = (await table.where('userId').equals(userId).primaryKeys()) as string[]
      for (const id of keys) entries.push({ kind, id, userId, deleted: false, ts })
    }
    if (entries.length) await db.outbox.bulkAdd(entries)
    await db.meta.put({ key: K.seeded(userId), value: ts })
  })
}

/** Sube la cola de cambios locales. Devuelve cuántos documentos subió. */
export async function pushOutbox(db: RachaDB, remote: Remote, userId: string) {
  const entries = await db.outbox.where('userId').equals(userId).sortBy('seq')
  if (!entries.length) return 0
  // Varios cambios del mismo documento → solo el último
  const latest = new Map<string, OutboxEntry>()
  for (const e of entries) latest.set(docKey(e.kind, e.id), e)
  const rows: DocRow[] = []
  for (const e of latest.values()) {
    const row = e.deleted ? undefined : ((await db.table(TABLE_OF[e.kind]).get(e.id)) as Record<string, unknown> | undefined)
    if (row && row.userId !== userId) continue
    rows.push(row ? { kind: e.kind, id: e.id, data: row, deleted: false } : { kind: e.kind, id: e.id, data: {}, deleted: true })
  }
  if (rows.length) await remote.push(userId, rows)
  // Solo borramos lo que subimos: lo que se encoló mientras tanto se queda para la próxima
  await db.outbox.bulkDelete(entries.map((e) => e.seq!))
  return rows.length
}

/** Baja y aplica los cambios del servidor. Devuelve cuántos documentos cambiaron localmente. */
export async function pullRemote(db: RachaDB, remote: Remote, userId: string) {
  const last = await getMeta<string>(db, K.pulled(userId))
  const since = last ? new Date(Date.parse(last) - OVERLAP_MS).toISOString() : null
  const docs = await remote.pull(userId, since)
  if (!docs.length) return 0
  let applied = 0
  await db.transaction('rw', [...syncTables(db), db.outbox, db.meta], async (tx) => {
    markRemote(tx.idbtrans)
    // Un cambio local que aún no se sube es más nuevo que lo del servidor: se respeta y se subirá después
    const pending = new Set((await db.outbox.where('userId').equals(userId).toArray()).map((e) => docKey(e.kind, e.id)))
    let max = last
    for (const d of docs) {
      if (!max || Date.parse(d.updated_at) > Date.parse(max)) max = d.updated_at
      if (pending.has(docKey(d.kind, d.id))) continue
      // Documento malformado (tipo desconocido o datos que no son un objeto): se ignora en vez de romper la sincronización
      if (!Object.prototype.hasOwnProperty.call(TABLE_OF, d.kind) || typeof d.id !== 'string') continue
      if (!d.deleted && (!d.data || typeof d.data !== 'object' || Array.isArray(d.data))) continue
      const table = db.table(TABLE_OF[d.kind])
      const local = await table.get(d.id)
      if (d.deleted) {
        if (local) {
          await table.delete(d.id)
          applied++
        }
        continue
      }
      const data = d.kind === 'profile' ? { ...d.data, userId } : { ...d.data, id: d.id, userId }
      if (local && stable(local) === stable(data)) continue
      await table.put(data)
      applied++
    }
    if (max) await db.meta.put({ key: K.pulled(userId), value: max })
  })
  return applied
}

/** Una vuelta completa: encolar lo viejo (una vez), subir, bajar. */
export async function syncOnce(db: RachaDB, remote: Remote, userId: string) {
  await seedOutbox(db, userId)
  const pushed = await pushOutbox(db, remote, userId)
  const pulled = await pullRemote(db, remote, userId)
  await db.meta.put({ key: K.lastSync(userId), value: Date.now() })
  return { pushed, pulled }
}

// ---------------------------------------------------------------------------
// Motor: cuándo sincronizar, reintentos y estado
// ---------------------------------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
export interface SyncState {
  status: SyncStatus
  lastSyncAt: number | null
  error?: string
}

interface EngineOpts {
  /** Espera tras un cambio local antes de subir (agrupa ráfagas de cambios) */
  debounceMs?: number
  isOnline?: () => boolean
}

export class SyncEngine {
  state: SyncState = { status: 'idle', lastSyncAt: null }
  private listeners = new Set<(s: SyncState) => void>()
  private running: Promise<boolean> | null = null
  private again = false
  private debounce?: ReturnType<typeof setTimeout>
  private retry?: ReturnType<typeof setTimeout>
  private attempt = 0
  private stopped = false
  private cleanup: (() => void)[] = []
  private db: RachaDB
  private remote: Remote
  private userId: string
  private opts: EngineOpts

  constructor(db: RachaDB, remote: Remote, userId: string, opts: EngineOpts = {}) {
    this.db = db
    this.remote = remote
    this.userId = userId
    this.opts = opts
  }

  private online() {
    if (this.opts.isOnline) return this.opts.isOnline()
    return typeof navigator === 'undefined' || navigator.onLine !== false
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn(this.state)
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Sincroniza ya. Nunca lanza: devuelve true si terminó bien. */
  syncNow(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false)
    if (this.running) {
      this.again = true
      return this.running
    }
    clearTimeout(this.debounce)
    clearTimeout(this.retry)
    this.running = this.run().finally(() => {
      this.running = null
      if (this.again && !this.stopped) {
        this.again = false
        void this.syncNow()
      }
    })
    return this.running
  }

  /** Sincroniza dentro de un rato (por defecto ~2 s), agrupando cambios seguidos */
  schedule(ms = this.opts.debounceMs ?? 2000) {
    if (this.stopped) return
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.syncNow(), ms)
  }

  private async run() {
    if (!this.online()) {
      this.set({ status: 'offline' })
      return false
    }
    this.set({ status: 'syncing', error: undefined })
    try {
      await syncOnce(this.db, this.remote, this.userId)
      this.attempt = 0
      this.set({ status: 'idle', lastSyncAt: Date.now() })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!this.online()) {
        this.set({ status: 'offline', error: msg })
      } else {
        this.set({ status: 'error', error: msg })
        // Reintento con espera creciente: 2 s, 4 s, 8 s… hasta 1 min
        const wait = Math.min(60_000, 2000 * 2 ** this.attempt++)
        clearTimeout(this.retry)
        this.retry = setTimeout(() => void this.syncNow(), wait)
      }
      return false
    }
  }

  /** Empieza a escuchar: cambios locales, volver a tener internet, volver a la app. */
  async start() {
    const last = await getLastSyncAt(this.db, this.userId)
    if (this.stopped) return
    if (last && !this.state.lastSyncAt) this.set({ lastSyncAt: last })
    this.cleanup.push(this.db.onOutbox(() => this.schedule()))
    if (typeof window !== 'undefined' && window.addEventListener) {
      const now = () => void this.syncNow()
      const offline = () => this.set({ status: 'offline' })
      const visible = () => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.syncNow()
      }
      window.addEventListener('online', now)
      window.addEventListener('offline', offline)
      window.addEventListener('focus', now)
      document.addEventListener('visibilitychange', visible)
      this.cleanup.push(() => {
        window.removeEventListener('online', now)
        window.removeEventListener('offline', offline)
        window.removeEventListener('focus', now)
        document.removeEventListener('visibilitychange', visible)
      })
    }
  }

  stop() {
    this.stopped = true
    clearTimeout(this.debounce)
    clearTimeout(this.retry)
    for (const fn of this.cleanup.splice(0)) fn()
    this.listeners.clear()
  }
}

// ---------------------------------------------------------------------------
// Importar datos del "modo local" a la cuenta de Supabase
// ---------------------------------------------------------------------------

export interface ImportCandidate {
  localUser: LocalUser
  profileName: string
  accounts: number
  transactions: number
  debts: number
}

/** ¿Hay en este dispositivo un usuario local con datos que se puedan pasar a esta cuenta? */
export async function findImportCandidate(db: RachaDB, userId: string): Promise<ImportCandidate | null> {
  if (await getMeta(db, K.imported(userId))) return null
  const users = (await db.localUsers.toArray()).sort((a, b) => b.createdAt - a.createdAt)
  for (const u of users) {
    if (u.id === userId) continue
    const p = await db.profiles.get(u.id)
    if (!p) continue
    const [accounts, transactions, debts] = await Promise.all([
      db.accounts.where('userId').equals(u.id).count(),
      db.transactions.where('userId').equals(u.id).count(),
      db.debts.where('userId').equals(u.id).count(),
    ])
    return { localUser: u, profileName: p.name, accounts, transactions, debts }
  }
  return null
}

/** Recuerda que el usuario eligió "Empezar de cero" para no volver a preguntar. */
export async function skipImport(db: RachaDB, userId: string) {
  await db.meta.put({ key: K.imported(userId), value: 'skipped' })
}

/**
 * Pasa todo lo del usuario local a la cuenta de Supabase cambiando el `userId` de cada fila.
 * Como `db.syncUserId` es la cuenta de Supabase, cada fila reasignada queda en la cola para subir.
 */
export async function importLocalData(db: RachaDB, fromUserId: string, toUserId: string) {
  await db.transaction('rw', [...syncTables(db), db.localUsers, db.outbox, db.meta], async () => {
    const p = await db.profiles.get(fromUserId)
    if (p) {
      await db.profiles.delete(fromUserId)
      await db.profiles.put({ ...p, userId: toUserId })
    }
    await db.accounts.where('userId').equals(fromUserId).modify({ userId: toUserId })
    await db.transactions.where('userId').equals(fromUserId).modify({ userId: toUserId })
    await db.debts.where('userId').equals(fromUserId).modify({ userId: toUserId })
    // Sus datos ya viven en la cuenta: el usuario local queda vacío y se elimina
    await db.localUsers.delete(fromUserId)
    await db.meta.put({ key: K.imported(toUserId), value: 'imported' })
  })
}
