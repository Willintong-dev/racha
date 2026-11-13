/**
 * Sincronización en la nube (local-first).
 *
 * - Cada escritura local de un usuario de Supabase queda en `db.outbox` (ver middleware en db.ts).
 * - Sincronizar = subir la cola (agrupada por documento) y luego bajar lo que cambió en el servidor
 *   desde la última vez (`updated_at` lo pone el servidor). Gana la última escritura, salvo en el perfil:
 *   si hay cambios del perfil sin subir y llega uno distinto de la nube, se MEZCLAN (merge.ts) con la
 *   última versión conocida de la nube como base (`profileBase`), y la mezcla se sube.
 * - Se baja en páginas de 500 ordenadas por (updated_at, kind, id), pidiendo cada página "después de la
 *   última fila vista" (keyset, no OFFSET: si otro dispositivo edita algo a mitad de la bajada no se salta
 *   nada). Cada página se aplica en su propia transacción marcada como "remota" (así no vuelve a la cola)
 *   y en esa misma transacción se guarda dónde quedamos: si se corta, la siguiente vez sigue desde ahí.
 *
 * El motor habla con la nube a través de `Remote`, para poder probarlo con un servidor falso en memoria.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { markRemote, TABLE_OF, type LocalUser, type OutboxEntry, type Profile, type RachaDB, type SyncKind } from './db'
import { mergeProfile, stable } from './merge'

export interface DocRow {
  kind: SyncKind
  id: string
  data: Record<string, unknown>
  deleted: boolean
}

export interface RemoteDoc extends DocRow {
  /** Hora del servidor de la última escritura (ISO, tal cual la devuelve el servidor: con microsegundos) */
  updated_at: string
}

/** Posición en el orden (updated_at, kind, id) de la nube. */
export interface PullCursor {
  ts: string
  kind: string
  id: string
}

export interface Remote {
  /** Sube (upsert) documentos. Lanza un error si falla. */
  push(userId: string, rows: DocRow[]): Promise<void>
  /**
   * Hasta `limit` documentos estrictamente después de `after` en el orden (updated_at, kind, id), en ese orden.
   * `after` null = desde el principio. Con `kind` e `id` vacíos significa "updated_at >= after.ts"
   * (comienzo de una bajada incremental). Lanza un error si falla.
   */
  pullPage(userId: string, after: PullCursor | null, limit: number): Promise<RemoteDoc[]>
  /** Cuántos documentos tiene el usuario en total (solo para mostrar el %). Opcional. */
  count?(userId: string): Promise<number>
  /** ¿La nube tiene un perfil (no borrado) de este usuario? Lanza si no se pudo preguntar. */
  hasProfile(userId: string): Promise<boolean>
}

export const PULL_PAGE = 500
/** Al bajar repasamos unos segundos antes de la última marca por si una escritura tardó en confirmarse. */
const OVERLAP_MS = 5000
/** Una petición de lectura que no responde en este tiempo se cancela: la bajada falla y el motor reintenta. */
const READ_TIMEOUT_MS = 30_000

/**
 * Valor entre comillas para los filtros `or=(…)` de PostgREST: así las comas, puntos, dos puntos y
 * paréntesis del valor (p. ej. `2026-01-01T00:00:00.123456+00:00`) no se confunden con la sintaxis.
 * Dentro de las comillas, `\` y `"` se escapan con `\`. (El `+` lo codifica luego URLSearchParams como %2B.)
 */
export function pgQuote(v: string) {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Filtro `or` de PostgREST equivalente a (updated_at, kind, id) > cursor (PostgREST no compara tuplas). */
export function keysetFilter(c: PullCursor) {
  const t = pgQuote(c.ts)
  const k = pgQuote(c.kind)
  const i = pgQuote(c.id)
  return `updated_at.gt.${t},and(updated_at.eq.${t},kind.gt.${k}),and(updated_at.eq.${t},kind.eq.${k},id.gt.${i})`
}

/** Corre una consulta cancelándola si tarda demasiado (una petición colgada no debe bloquear la bajada para siempre). */
async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>, ms = READ_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await run(ctrl.signal)
  } finally {
    clearTimeout(t)
  }
}

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(userId, rows) {
      for (let i = 0; i < rows.length; i += PULL_PAGE) {
        const chunk = rows.slice(i, i + PULL_PAGE).map((r) => ({ user_id: userId, kind: r.kind, id: r.id, data: r.data, deleted: r.deleted }))
        const { error } = await client.from('user_docs').upsert(chunk, { onConflict: 'user_id,kind,id' })
        if (error) throw new Error(error.message)
      }
    },
    async pullPage(userId, after, limit) {
      let q = client.from('user_docs').select('kind,id,data,deleted,updated_at').eq('user_id', userId)
      if (after) {
        // El `gte` es redundante con el `or`, pero deja que Postgres recorra el índice (user_id, updated_at)
        // desde el cursor en vez de revisar todas las filas del usuario en cada página.
        q = q.gte('updated_at', after.ts)
        if (after.kind || after.id) q = q.or(keysetFilter(after))
      }
      const { data, error } = await withTimeout((signal) => q.order('updated_at').order('kind').order('id').limit(limit).abortSignal(signal))
      if (error) throw new Error(error.message)
      return (data ?? []) as RemoteDoc[]
    },
    // Sin reintentos y con poco tiempo: el conteo solo sirve para el %, no debe demorar la bajada si falla
    async count(userId) {
      const { count, error } = await withTimeout((signal) =>
        client.from('user_docs').select('id', { count: 'exact', head: true }).eq('user_id', userId).retry(false).abortSignal(signal),
        10_000,
      )
      if (error || typeof count !== 'number') throw new Error(error?.message ?? 'sin conteo')
      return count
    },
    async hasProfile(userId) {
      const { data, error } = await withTimeout((signal) =>
        client.from('user_docs').select('id').eq('user_id', userId).eq('kind', 'profile').eq('deleted', false).limit(1).abortSignal(signal),
      )
      if (error) throw new Error(error.message)
      return !!data?.length
    },
  }
}

// ---------------------------------------------------------------------------
// Estado guardado en db.meta
// ---------------------------------------------------------------------------

const K = {
  /** updated_at más alto de la última bajada COMPLETA (la siguiente empieza un poco antes) */
  pulled: (u: string) => `pulled:${u}`,
  /** Hora (del dispositivo) en que se encoló por primera vez lo que ya había (= primer intento de sincronizar) */
  seeded: (u: string) => `seeded:${u}`,
  lastSync: (u: string) => `lastSync:${u}`,
  imported: (u: string) => `import:${u}`,
  /** Bajada a medias: cursor de la última página aplicada. Se borra al terminar. */
  pullCursor: (u: string) => `pullCursor:${u}`,
  /** Terminó al menos una bajada completa en este dispositivo (aunque la nube estuviera vacía) */
  pulledOnce: (u: string) => `pulledOnce:${u}`,
  /**
   * Última versión del perfil que sabemos que está en la nube (la que bajamos o la que subimos).
   * Es la base de la mezcla de tres vías del perfil (merge.ts).
   */
  profileBase: (u: string) => `profileBase:${u}`,
}

/** Punto de control de una bajada a medias */
interface PullCheckpoint extends PullCursor {
  /** updated_at más alto visto hasta ahora */
  max?: string
  /** Documentos recibidos hasta ahora en esta bajada (para el progreso) */
  docs: number
}

async function getMeta<T>(db: RachaDB, key: string) {
  return (await db.meta.get(key))?.value as T | undefined
}

export const getLastSyncAt = (db: RachaDB, userId: string) => getMeta<number>(db, K.lastSync(userId))

/** ¿Este dispositivo ya terminó alguna vez una bajada completa de este usuario? */
export async function hasCompletedPull(db: RachaDB, userId: string) {
  return !!(await getMeta(db, K.pulled(userId))) || !!(await getMeta(db, K.pulledOnce(userId)))
}

/** ¿Hay una primera bajada que se cortó a la mitad (datos locales incompletos)? */
export async function firstPullUnfinished(db: RachaDB, userId: string) {
  return !!(await getMeta(db, K.pullCursor(userId))) && !(await hasCompletedPull(db, userId))
}

const docKey = (kind: string, id: string) => `${kind}\u0000${id}`

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
  // Lo que acabamos de subir del perfil es ahora lo que hay en la nube: la base de la próxima mezcla
  const prof = rows.find((r) => r.kind === 'profile' && !r.deleted)
  if (prof) await db.meta.put({ key: K.profileBase(userId), value: prof.data })
  // Solo borramos lo que subimos: lo que se encoló mientras tanto se queda para la próxima
  await db.outbox.bulkDelete(entries.map((e) => e.seq!))
  return rows.length
}

export interface PullProgress {
  /** Páginas recibidas en esta bajada */
  pages: number
  /** Documentos recibidos en esta bajada (incluye los de antes de un corte, si se retomó) */
  docs: number
  /** Total de documentos del usuario en la nube, si se pudo contar (solo en la primera bajada) */
  total: number | null
}

export interface PullOpts {
  onProgress?: (p: PullProgress) => void
}

export interface PullResult {
  /** Documentos que cambiaron localmente */
  applied: number
  /** Documentos recibidos (incluye repetidos por el solape) */
  docs: number
  pages: number
  /** Se descartó un perfil creado aquí sin conexión porque la nube ya tenía uno (ver abajo) */
  replacedLocalProfile: boolean
  /** Se mezcló el perfil local (con cambios sin subir) con uno distinto que llegó de la nube */
  mergedProfile: boolean
}

const sameCursor = (a: PullCursor | null, b: PullCursor | null) => !!a && !!b && a.ts === b.ts && a.kind === b.kind && a.id === b.id

/**
 * Baja y aplica los cambios del servidor, página por página. Cada página se aplica y deja su punto de
 * control en UNA transacción: si la bajada se corta, la próxima sigue desde la última página aplicada.
 */
export async function pullRemote(db: RachaDB, remote: Remote, userId: string, opts: PullOpts = {}): Promise<PullResult> {
  const last = await getMeta<string>(db, K.pulled(userId))
  const completedBefore = await hasCompletedPull(db, userId)
  const seededAt = await getMeta<number>(db, K.seeded(userId))
  const resume = await getMeta<PullCheckpoint>(db, K.pullCursor(userId))

  let after: PullCursor | null = resume
    ? { ts: resume.ts, kind: resume.kind, id: resume.id }
    : last
      ? // Incremental: desde un poco antes de la última marca (lo repetido se reconoce y no cambia nada)
        { ts: new Date(Date.parse(last) - OVERLAP_MS).toISOString(), kind: '', id: '' }
      : null
  let max = resume ? resume.max : last
  let docsSeen = resume?.docs ?? 0
  let pages = 0
  let applied = 0
  let replacedLocalProfile = false
  let mergedProfile = false

  // En la primera bajada contamos cuántos documentos hay para mostrar el %. Si falla, no pasa nada.
  let total: number | null = null
  if (!completedBefore && remote.count) {
    try {
      total = await remote.count(userId)
      opts.onProgress?.({ pages, docs: docsSeen, total })
    } catch {
      /* solo era para el % */
    }
  }

  for (;;) {
    const docs = await remote.pullPage(userId, after, PULL_PAGE)
    const full = docs.length >= PULL_PAGE
    const tail = docs[docs.length - 1]
    const next: PullCursor | null = tail ? { ts: tail.updated_at, kind: tail.kind, id: tail.id } : after
    // Defensa: una página llena que no avanza repetiría la misma página para siempre
    if (full && (!tail || typeof tail.updated_at !== 'string' || sameCursor(next, after))) throw new Error('La nube devolvió una página que no avanza')

    await db.transaction('rw', [...syncTables(db), db.outbox, db.meta], async (tx) => {
      markRemote(tx.idbtrans)
      // Un cambio local que aún no se sube es más nuevo que lo del servidor: se respeta y se subirá después
      const pendingEntries = await db.outbox.where('userId').equals(userId).toArray()
      const pending = new Set(pendingEntries.map((e) => docKey(e.kind, e.id)))
      for (const d of docs) {
        if (typeof d.updated_at === 'string' && (!max || Date.parse(d.updated_at) > Date.parse(max))) max = d.updated_at
        // Documento malformado (tipo desconocido o datos que no son un objeto): se ignora en vez de romper la sincronización
        if (!Object.prototype.hasOwnProperty.call(TABLE_OF, d.kind) || typeof d.id !== 'string') continue
        if (!d.deleted && (!d.data || typeof d.data !== 'object' || Array.isArray(d.data))) continue
        if (pending.has(docKey(d.kind, d.id))) {
          // EXCEPCIÓN (estrecha a propósito): perfil creado en este dispositivo sin haber visto nunca la nube.
          // Si este dispositivo nunca terminó una bajada y TODOS los cambios pendientes del perfil son
          // posteriores a su primer intento de sincronizar (o sea, el perfil lo creó el onboarding aquí,
          // p. ej. sin conexión), y la nube ya tiene un perfil, gana el de la nube: si no, subiríamos el
          // perfil nuevo y reemplazaría el verdadero (XP, logros, tasas, categorías propias…).
          // Un perfil que ya existía antes de sincronizar (encolado por seedOutbox) NO entra aquí.
          const createdHereBlind =
            d.kind === 'profile' &&
            !d.deleted &&
            !completedBefore &&
            seededAt !== undefined &&
            pendingEntries.filter((e) => e.kind === 'profile').every((e) => e.ts > seededAt)
          if (!createdHereBlind) {
            // Perfil con cambios locales sin subir: mezcla de tres vías en vez de ignorar la nube
            if (d.kind === 'profile' && !d.deleted) {
              const local = await db.profiles.get(userId)
              if (!local) continue
              const remoteP = { ...d.data, userId } as unknown as Profile
              if (stable(local) !== stable(remoteP)) {
                const base = await getMeta<Profile>(db, K.profileBase(userId))
                const merged = mergeProfile(base, local, remoteP, userId)
                if (stable(merged) !== stable(local)) {
                  // La transacción es "remota" (no encola), pero la entrada pendiente del perfil sigue en la
                  // cola: la mezcla se sube en el próximo pushOutbox.
                  await db.profiles.put(merged)
                  applied++
                }
                mergedProfile = true
              }
              await db.meta.put({ key: K.profileBase(userId), value: remoteP })
            }
            continue
          }
          await db.outbox
            .where('userId')
            .equals(userId)
            .filter((e) => e.kind === 'profile')
            .delete()
          pending.delete(docKey(d.kind, d.id))
          replacedLocalProfile = true
          console.warn('[sync] La nube ya tenía un perfil: se descarta el perfil creado en este dispositivo antes de la primera sincronización')
        }
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
        if (d.kind === 'profile') await db.meta.put({ key: K.profileBase(userId), value: data })
        if (local && stable(local) === stable(data)) continue
        await table.put(data)
        applied++
      }
      if (full) {
        const cp: PullCheckpoint = { ...next!, max, docs: docsSeen + docs.length }
        await db.meta.put({ key: K.pullCursor(userId), value: cp })
      } else {
        if (max) await db.meta.put({ key: K.pulled(userId), value: max })
        await db.meta.put({ key: K.pulledOnce(userId), value: Date.now() })
        await db.meta.delete(K.pullCursor(userId))
      }
    })

    pages++
    docsSeen += docs.length
    after = next
    opts.onProgress?.({ pages, docs: docsSeen, total })
    if (!full) break
  }
  return { applied, docs: docsSeen, pages, replacedLocalProfile, mergedProfile }
}

/** Una vuelta completa: encolar lo viejo (una vez), subir, bajar. */
export async function syncOnce(db: RachaDB, remote: Remote, userId: string, opts: PullOpts = {}) {
  await seedOutbox(db, userId)
  // Si este dispositivo nunca terminó una bajada, primero BAJAMOS y luego subimos: así lo que hay en la
  // nube (p. ej. el perfil real) se ve antes de subir nada creado aquí a ciegas (ver la excepción en pullRemote).
  // Lo mismo si hay cambios del perfil sin subir: subirlos primero pisaría lo que otro dispositivo subió
  // (XP, logros…); bajando antes, pullRemote los mezcla y se sube la mezcla.
  const profilePending = (await db.outbox.where('userId').equals(userId).filter((e) => e.kind === 'profile').count()) > 0
  const pullFirst = !(await hasCompletedPull(db, userId)) || profilePending
  let pushed = pullFirst ? 0 : await pushOutbox(db, remote, userId)
  const pull = await pullRemote(db, remote, userId, opts)
  if (pullFirst) pushed = await pushOutbox(db, remote, userId)
  await db.meta.put({ key: K.lastSync(userId), value: Date.now() })
  return { pushed, pulled: pull.applied, replacedLocalProfile: pull.replacedLocalProfile, mergedProfile: pull.mergedProfile }
}


// ---------------------------------------------------------------------------
// Motor: cuándo sincronizar, reintentos y estado
// ---------------------------------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
export interface SyncState {
  status: SyncStatus
  lastSyncAt: number | null
  error?: string
  /** Avance de la bajada en curso (undefined si no se está bajando) */
  progress?: PullProgress
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

  /** ¿Hay una sincronización corriendo ahora? */
  get busy() {
    return this.running !== null
  }

  /**
   * Pregunta a la nube si este usuario ya tiene perfil. Lanza si no se pudo preguntar
   * (sin conexión, tabla inexistente…): en ese caso NO se sabe, y hay que tratarlo como "puede que sí".
   */
  cloudHasProfile() {
    return this.remote.hasProfile(this.userId)
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
    this.set({ status: 'syncing', error: undefined, progress: undefined })
    try {
      await syncOnce(this.db, this.remote, this.userId, { onProgress: (progress) => this.set({ progress }) })
      this.attempt = 0
      this.set({ status: 'idle', lastSyncAt: Date.now(), progress: undefined })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!this.online()) {
        this.set({ status: 'offline', error: msg, progress: undefined })
      } else {
        this.set({ status: 'error', error: msg, progress: undefined })
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
