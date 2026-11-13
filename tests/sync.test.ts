/**
 * Pruebas de la sincronización: bajada por páginas (keyset) con punto de control por página, reanudar
 * tras un corte, ediciones a mitad de la bajada, solape, documentos raros y la protección del perfil.
 * Usa IndexedDB en memoria (fake-indexeddb), la base real de Dexie y dos servidores falsos:
 *  - `FakeRemote`: implementa `Remote` en memoria (misma semántica que user_docs).
 *  - `fakePostgrest`: un `fetch` que entiende las consultas de supabase-js (filtros `or=(…)` con comillas,
 *    `gte`, `order`, `limit`, conteo con HEAD) para probar `supabaseRemote` de punta a punta.
 * Ejecutar: esbuild tests/sync.test.ts --bundle --platform=node --outfile=sync.test.mjs --format=esm --external:fake-indexeddb && node sync.test.mjs
 */
import 'fake-indexeddb/auto'
import { createClient } from '@supabase/supabase-js'
import { RachaDB, type CustomCategory, type Debt, type Profile, type Transaction } from '../src/lib/db'
import { debtBalance, legacyAnchor } from '../src/lib/debts'
import {
  PULL_PAGE,
  SyncEngine,
  keysetFilter,
  pgQuote,
  pullRemote,
  supabaseRemote,
  syncOnce,
  type DocRow,
  type PullCursor,
  type PullProgress,
  type Remote,
  type RemoteDoc,
} from '../src/lib/sync'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const J = (v: unknown) => JSON.stringify(v)

// ---------------------------------------------------------------------------
// Servidor falso en memoria
// ---------------------------------------------------------------------------

type Row = RemoteDoc & { user: string }
/** Como Postgres/PostgREST: hora con microsegundos y zona "+00:00" */
const serverTs = (ms: number) => new Date(ms).toISOString().replace('Z', '000+00:00')
const cmpRow = (a: { updated_at: string; kind: string; id: string }, b: { updated_at: string; kind: string; id: string }) =>
  Date.parse(a.updated_at) - Date.parse(b.updated_at) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

class Store {
  rows = new Map<string, Row>()
  clock = Date.parse('2026-01-01T00:00:00Z')
  /** Escribe como una sentencia: todas las filas con el mismo now() */
  write(user: string, docs: DocRow[], tsMs?: number) {
    if (tsMs === undefined) tsMs = this.clock += 10_000
    const ts = serverTs(tsMs)
    for (const r of docs) this.rows.set(`${user}|${r.kind}|${r.id}`, { ...JSON.parse(JSON.stringify(r)), updated_at: ts, user })
  }
  sorted(user: string) {
    return [...this.rows.values()].filter((r) => r.user === user).sort(cmpRow)
  }
  get(user: string, kind: string, id: string) {
    return this.rows.get(`${user}|${kind}|${id}`)
  }
}
const strip = (r: Row) => {
  const out = JSON.parse(JSON.stringify(r)) as RemoteDoc & { user?: string }
  delete out.user
  return out as RemoteDoc
}

class FakeRemote implements Remote {
  offline = false
  /** Falla la llamada número N a pullPage (1 = la primera) */
  failOnCall = 0
  calls: (PullCursor | null)[] = []
  /** Se ejecuta antes de responder cada página (para simular otro dispositivo escribiendo) */
  beforePage?: (call: number) => Promise<void> | void
  constructor(public store: Store) {}
  async push(userId: string, rows: DocRow[]) {
    if (this.offline) throw new Error('Failed to fetch')
    this.store.write(userId, rows)
  }
  async pullPage(userId: string, after: PullCursor | null, limit: number) {
    if (this.offline) throw new Error('Failed to fetch')
    this.calls.push(after)
    const n = this.calls.length
    if (this.failOnCall === n) throw new Error('Failed to fetch (página ' + n + ')')
    await this.beforePage?.(n)
    const all = this.store.sorted(userId)
    const rest = !after
      ? all
      : !after.kind && !after.id
        ? all.filter((r) => Date.parse(r.updated_at) >= Date.parse(after.ts))
        : all.filter((r) => cmpRow(r, { updated_at: after.ts, kind: after.kind, id: after.id }) > 0)
    return rest.slice(0, limit).map(strip)
  }
  async count(userId: string) {
    if (this.offline) throw new Error('Failed to fetch')
    return this.store.sorted(userId).length
  }
  async hasProfile(userId: string) {
    if (this.offline) throw new Error('Failed to fetch')
    return this.store.sorted(userId).some((r) => r.kind === 'profile' && !r.deleted)
  }
}

// ---------------------------------------------------------------------------
// PostgREST falso (para supabaseRemote): entiende lo justo de la sintaxis y es estricto con las comillas
// ---------------------------------------------------------------------------

type Cond = { col: string; op: string; val: string } | { and: Cond[] } | { or: Cond[] }
/** Lee una lista `a,b,and(c,d)` hasta `)` o el final. Valores con , . : ( ) DEBEN ir entre comillas. */
function parseLogic(s: string): Cond[] {
  let i = 0
  const list = (): Cond[] => {
    const out: Cond[] = []
    for (;;) {
      out.push(item())
      if (s[i] === ',') {
        i++
        continue
      }
      return out
    }
  }
  const item = (): Cond => {
    for (const k of ['and', 'or'] as const) {
      if (s.startsWith(k + '(', i)) {
        i += k.length + 1
        const inner = list()
        if (s[i++] !== ')') throw new Error('falta ) en ' + s)
        return k === 'and' ? { and: inner } : { or: inner }
      }
    }
    const col = s.slice(i, s.indexOf('.', i))
    i += col.length + 1
    const op = s.slice(i, s.indexOf('.', i))
    i += op.length + 1
    let val = ''
    if (s[i] === '"') {
      i++
      while (s[i] !== '"') {
        if (i >= s.length) throw new Error('comilla sin cerrar en ' + s)
        if (s[i] === '\\') i++
        val += s[i++]
      }
      i++
    } else {
      while (i < s.length && s[i] !== ',' && s[i] !== ')') val += s[i++]
      if (/[.:]/.test(val)) throw new Error(`valor con caracteres reservados sin comillas: ${val}`)
    }
    return { col, op, val }
  }
  const out = list()
  if (i !== s.length) throw new Error('sobra texto en ' + s)
  return out
}
function cmpCol(r: Row, col: string, val: string) {
  const v = (r as unknown as Record<string, unknown>)[col]
  if (col === 'updated_at') {
    const b = Date.parse(val)
    if (Number.isNaN(b)) throw new Error('fecha inválida: ' + val)
    return Date.parse(r.updated_at) - b
  }
  const a = String(v)
  return a < val ? -1 : a > val ? 1 : 0
}
function evalCond(r: Row, c: Cond): boolean {
  if ('and' in c) return c.and.every((x) => evalCond(r, x))
  if ('or' in c) return c.or.some((x) => evalCond(r, x))
  const d = cmpCol(r, c.col, c.val)
  if (c.op === 'eq') return c.col === 'deleted' ? String(r.deleted) === c.val : d === 0
  if (c.op === 'gt') return d > 0
  if (c.op === 'gte') return d >= 0
  throw new Error('op desconocido ' + c.op)
}
const orFilters: string[] = []
function fakePostgrest(store: Store, net: { down: boolean }) {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String((input as Request)?.url ?? input))
    const method = (init.method ?? 'GET').toUpperCase()
    if (net.down) throw new TypeError('Failed to fetch')
    const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(method === 'HEAD' ? null : JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } })
    try {
      if (method === 'POST') {
        const user = 'u-http'
        store.write(user, JSON.parse(String(init.body)))
        return new Response(null, { status: 201 })
      }
      const conds: Cond[] = []
      let user = ''
      let limit = Infinity
      for (const [k, v] of url.searchParams) {
        if (k === 'select' || k === 'order') continue
        if (k === 'limit') limit = Number(v)
        else if (k === 'or') {
          orFilters.push(v)
          if (!v.startsWith('(') || !v.endsWith(')')) throw new Error('or sin paréntesis')
          conds.push({ or: parseLogic(v.slice(1, -1)) })
        } else if (k === 'user_id') user = v.replace(/^eq\./, '')
        else {
          const [op, ...rest] = v.split('.')
          conds.push({ col: k, op, val: rest.join('.') })
        }
      }
      if (url.searchParams.get('order') !== 'updated_at.asc,kind.asc,id.asc' && method === 'GET' && url.searchParams.get('select')?.includes('data'))
        throw new Error('orden inesperado: ' + url.searchParams.get('order'))
      const rows = store.sorted(user).filter((r) => conds.every((c) => evalCond(r, c)))
      const out = rows.slice(0, limit).map(strip)
      return json(out, 200, { 'content-range': `0-${Math.max(0, out.length - 1)}/${rows.length}` })
    } catch (e) {
      return json({ code: 'PGRST100', message: (e as Error).message, details: null, hint: null }, 400)
    }
  }
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const prof = (userId: string, name = 'Ana', xp = 10): Profile => ({ userId, name, avatar: 0, xp, currency: 'COP', rates: { USD: 4000 }, onboarded: true })
const accDoc = (id: string, name = 'Nómina') => ({
  kind: 'account' as const,
  id,
  deleted: false,
  data: { id, name, type: 'banco', initialBalance: 1000, isPrimary: false, currency: 'COP', color: '#6366f1', archived: false, createdAt: 1 },
})
const txDoc = (id: string, amount = 1) => ({
  kind: 'transaction' as const,
  id,
  deleted: false,
  data: { id, type: 'gasto', amount, accountId: 'a0', date: '2026-01-02', createdAt: 2 },
})
const pad = (n: number) => String(n).padStart(5, '0')

/** 2500 documentos: perfil + 9 cuentas + 2490 movimientos. Muchos comparten updated_at (subidas en lote). */
function seed2500(store: Store, user: string) {
  store.write(user, [{ kind: 'profile', id: user, deleted: false, data: { ...prof(user, 'Nube', 500) } as unknown as Record<string, unknown> }])
  store.write(user, Array.from({ length: 9 }, (_, i) => accDoc('a' + i)))
  // 1200 movimientos con el MISMO updated_at (cruzan los límites de página): el desempate es (kind, id)
  store.write(user, Array.from({ length: 1200 }, (_, i) => txDoc('t' + pad(i))))
  for (let i = 1200; i < 2490; i += 430) store.write(user, Array.from({ length: Math.min(430, 2490 - i) }, (_, j) => txDoc('t' + pad(i + j))))
}
const localCount = async (d: RachaDB) => (await d.profiles.count()) + (await d.accounts.count()) + (await d.transactions.count())

async function main() {
  // --- Filtro keyset de PostgREST ------------------------------------------------------------
  {
    ok(pgQuote('2026-11-13T10:00:00.123456+00:00') === '"2026-11-13T10:00:00.123456+00:00"', 'pgQuote envuelve la fecha con +00:00 en comillas')
    ok(pgQuote('a"b\\c') === '"a\\"b\\\\c"', 'pgQuote escapa comillas y barras invertidas')
    const f = keysetFilter({ ts: '2026-11-13T10:00:00.123456+00:00', kind: 'transaction', id: 't,1.(x)' })
    ok(
      f ===
        'updated_at.gt."2026-11-13T10:00:00.123456+00:00",and(updated_at.eq."2026-11-13T10:00:00.123456+00:00",kind.gt."transaction"),and(updated_at.eq."2026-11-13T10:00:00.123456+00:00",kind.eq."transaction",id.gt."t,1.(x)")',
      'keysetFilter arma (updated_at, kind, id) > cursor con valores entre comillas',
    )
    const parsed = parseLogic(f)
    ok(parsed.length === 3 && JSON.stringify(parsed[2]).includes('"val":"t,1.(x)"'), 'el filtro se puede leer de vuelta (id con , . ( ) intacto)')
    const enc = new URLSearchParams([['or', `(${f})`]]).toString()
    ok(enc.includes('%2B00%3A00') && !enc.includes('+00'), 'en la URL el + de la zona horaria va como %2B (no se vuelve espacio)')
  }

  // --- 2500 documentos en 5 páginas, con punto de control tras cada una -----------------------
  const U = 'user-1'
  const store = new Store()
  seed2500(store, U)
  {
    const r = new FakeRemote(store)
    const d = new RachaDB('dev-full')
    d.syncUserId = U
    const cursors: unknown[] = []
    r.beforePage = async () => {
      cursors.push((await d.meta.get(`pullCursor:${U}`))?.value)
    }
    const progress: PullProgress[] = []
    const res = await pullRemote(d, r, U, { onProgress: (p) => progress.push(p) })
    const all = store.sorted(U)
    ok(res.docs === 2500 && res.pages === 6 && r.calls.length === 6, `2500 documentos en 5 páginas llenas + 1 vacía que cierra (páginas=${res.pages}, llamadas=${r.calls.length})`)
    ok((await localCount(d)) === 2500 && res.applied === 2500, `todo quedó en la base local (${await localCount(d)})`)
    const expected = [undefined, ...[1, 2, 3, 4, 5].map((k) => all[k * PULL_PAGE - 1])]
    ok(
      cursors.every((c, k) => (k === 0 ? c === undefined : (c as PullCursor).id === expected[k]!.id && (c as PullCursor).ts === expected[k]!.updated_at)),
      'tras cada página el cursor guardado = última fila aplicada (ts con microsegundos tal cual)',
    )
    ok(
      r.calls.slice(1).every((c, k) => c?.id === expected[k + 1]!.id),
      'cada página se pide "después" de la última fila de la anterior (keyset, sin OFFSET)',
    )
    ok(!(await d.meta.get(`pullCursor:${U}`)) && (await d.meta.get(`pulled:${U}`))?.value === all[all.length - 1].updated_at, 'al terminar se borra el cursor y queda la marca de bajada completa')
    ok(progress[0]?.total === 2500 && progress[0]?.docs === 0 && progress.at(-1)?.docs === 2500 && progress.some((p) => p.docs === 1500), `progreso: total=2500 y docs 0→500→…→2500 (${progress.map((p) => p.docs).join(',')})`)
    ok((await d.outbox.count()) === 0, 'lo bajado no vuelve a la cola')

    // --- Solape: repetidos inofensivos, sin bucles ---
    const r2 = new FakeRemote(store)
    const again = await pullRemote(d, r2, U)
    ok(again.docs > 0 && again.docs < 2500 && again.applied === 0 && r2.calls.length >= 1 && r2.calls.length <= 3, `bajada incremental: repasa ${again.docs} documentos del solape de 5 s, cambia 0, termina (${r2.calls.length} llamadas)`)
    ok((await d.outbox.count()) === 0 && (await localCount(d)) === 2500, 'los repetidos no ensucian la cola ni duplican filas')
    store.write(U, [txDoc('t-new', 77)])
    const r3 = new FakeRemote(store)
    const inc = await pullRemote(d, r3, U)
    ok(inc.applied === 1 && (await d.transactions.get('t-new'))?.amount === 77, 'un documento nuevo llega en la siguiente bajada incremental')
    store.rows.delete(`${U}|transaction|t-new`)
  }

  // --- Corte en la página 3 → al reintentar sigue desde la 3 -----------------------------------
  {
    const r = new FakeRemote(store)
    r.failOnCall = 3
    const d = new RachaDB('dev-resume')
    d.syncUserId = U
    let threw = false
    try {
      await pullRemote(d, r, U)
    } catch {
      threw = true
    }
    const cp = (await d.meta.get(`pullCursor:${U}`))?.value as PullCursor & { docs: number }
    const all = store.sorted(U)
    ok(threw && (await localCount(d)) === 1000 && cp?.id === all[999].id && cp.docs === 1000, `falla en la página 3: quedan aplicadas 2 páginas (1000) y el cursor en la fila 1000 (${await localCount(d)}, ${cp?.id})`)
    ok(!(await d.meta.get(`pulled:${U}`)), 'sin marca de bajada completa mientras esté a medias')
    const r2 = new FakeRemote(store)
    const progress: PullProgress[] = []
    const res = await pullRemote(d, r2, U, { onProgress: (p) => progress.push(p) })
    ok(r2.calls[0]?.id === all[999].id && r2.calls.length === 4, `al reanudar la primera petición es "después de la fila 1000" (no desde el principio) y faltan 4 llamadas (${r2.calls.length})`)
    ok((await localCount(d)) === 2500 && res.docs === 2500, `termina con los 2500 (${await localCount(d)}); el progreso cuenta lo de antes del corte (${progress.at(-1)?.docs})`)
    ok(!(await d.meta.get(`pullCursor:${U}`)), 'cursor borrado al terminar')
  }

  // --- Documento editado a mitad de la bajada (se mueve al final) no se salta -------------------
  {
    const s2 = new Store()
    seed2500(s2, U)
    const all = s2.sorted(U)
    const r = new FakeRemote(s2)
    r.beforePage = (n) => {
      if (n === 2) {
        // Otro dispositivo edita un documento ya bajado (página 1) y uno que aún no bajamos (página 4)
        s2.write(U, [{ ...txDoc(all[10].id, 999) }, { ...txDoc(all[1600].id, 888) }])
      }
    }
    const d = new RachaDB('dev-mid')
    d.syncUserId = U
    await pullRemote(d, r, U)
    const ids = await d.transactions.toCollection().primaryKeys()
    ok((await localCount(d)) === 2500 && ids.length === 2490, `no se salta ningún documento aunque se movieran filas a mitad de la bajada (${await localCount(d)})`)
    ok((await d.transactions.get(all[10].id))?.amount === 999 && (await d.transactions.get(all[1600].id))?.amount === 888, 'las versiones editadas a mitad de la bajada llegan (al final)')
  }

  // --- Tipos desconocidos y documentos malformados se ignoran ------------------------------------
  {
    const s3 = new Store()
    s3.write('u-odd', [
      { kind: 'budget' as never, id: 'b1', deleted: false, data: { x: 1 } },
      { kind: 'account', id: 'bad', deleted: false, data: [1, 2] as never },
      accDoc('a-ok'),
    ])
    const d = new RachaDB('dev-odd')
    d.syncUserId = 'u-odd'
    const res = await pullRemote(d, new FakeRemote(s3), 'u-odd')
    ok(res.applied === 1 && !!(await d.accounts.get('a-ok')) && !(await d.accounts.get('bad')), 'tipo desconocido y datos que no son objeto se saltan; lo demás se aplica')
    ok(!!(await d.meta.get('pulledOnce:u-odd')), 'la bajada termina igual (no se atasca por un documento raro)')
  }

  // --- "Empezar de cero" solo si la nube confirma que no hay perfil -------------------------------
  {
    const d = new RachaDB('dev-check')
    const r = new FakeRemote(store)
    const eng = new SyncEngine(d, r, U, { isOnline: () => true })
    ok((await eng.cloudHasProfile()) === true, 'la nube tiene perfil → cloudHasProfile() = true (no se ofrece empezar de cero)')
    const eng2 = new SyncEngine(d, new FakeRemote(new Store()), 'nadie', { isOnline: () => true })
    ok((await eng2.cloudHasProfile()) === false, 'la nube responde sin perfil → false (se puede ofrecer)')
    r.offline = true
    let threw = false
    try {
      await eng.cloudHasProfile()
    } catch {
      threw = true
    }
    ok(threw, 'sin conexión cloudHasProfile() lanza (no se sabe → no se ofrece)')
    eng.stop()
    eng2.stop()
  }

  // --- Perfil creado sin conexión en un dispositivo nuevo NO pisa el de la nube -----------------
  {
    const s4 = new Store()
    const V = 'user-2'
    s4.write(V, [{ kind: 'profile', id: V, deleted: false, data: { ...prof(V, 'Real', 500), achievements: { a1: 1 } } as unknown as Record<string, unknown> }, accDoc('real-acc')])
    const r = new FakeRemote(s4)
    const d = new RachaDB('dev-blind')
    d.syncUserId = V
    r.offline = true
    try {
      await syncOnce(d, r, V)
    } catch {
      /* sin conexión */
    }
    await sleep(5)
    // El usuario terminó en el onboarding sin conexión y creó un perfil nuevo
    await d.profiles.put(prof(V, 'Nuevo', 0))
    await d.accounts.put({ ...accDoc('blind-acc').data, userId: V } as never)
    r.offline = false
    const warn = console.warn
    console.warn = () => {}
    const res = await syncOnce(d, r, V)
    console.warn = warn
    const cloudP = s4.get(V, 'profile', V)!.data as unknown as Profile
    ok(cloudP.name === 'Real' && cloudP.xp === 500, `el perfil de la nube no se reemplazó (nube: ${cloudP.name}, xp ${cloudP.xp})`)
    const localP = (await d.profiles.get(V))!
    ok(localP.name === 'Real' && localP.xp === 500 && !!localP.achievements?.a1, `el dispositivo se queda con el perfil de la nube (local: ${localP.name})`)
    ok(res.replacedLocalProfile === true, 'se avisa que se descartó el perfil local')
    ok((await d.outbox.count()) === 0 && !!s4.get(V, 'account', 'blind-acc'), 'lo demás creado aquí (la cuenta) sí se sube; la cola queda vacía')

    // Contraste (regla estrecha): un perfil que YA existía antes de sincronizar por primera vez se respeta
    const W = 'user-3'
    s4.write(W, [{ kind: 'profile', id: W, deleted: false, data: prof(W, 'Nube W') as unknown as Record<string, unknown> }])
    const e = new RachaDB('dev-legacy')
    await e.profiles.put(prof(W, 'Previo W'))
    e.syncUserId = W
    const res2 = await syncOnce(e, new FakeRemote(s4), W)
    ok(!res2.replacedLocalProfile && (s4.get(W, 'profile', W)!.data as unknown as Profile).name === 'Previo W', 'un perfil anterior a la sincronización (no creado a ciegas) mantiene la regla de siempre')

    // Y con una bajada completa previa, un cambio local pendiente del perfil gana como siempre
    await d.profiles.update(V, { name: 'Editado' })
    await syncOnce(d, r, V)
    ok((s4.get(V, 'profile', V)!.data as unknown as Profile).name === 'Editado', 'después de la primera bajada, editar el perfil sube normal')
  }

  // --- Motor: expone el progreso ------------------------------------------------------------------
  {
    const d = new RachaDB('dev-engine')
    d.syncUserId = U
    const eng = new SyncEngine(d, new FakeRemote(store), U, { isOnline: () => true })
    const seen: PullProgress[] = []
    eng.subscribe((s) => s.progress && seen.push(s.progress))
    const okk = await eng.syncNow()
    ok(okk && seen.length >= 6 && seen.at(-1)!.docs === 2500 && seen.at(-1)!.total === 2500 && eng.state.progress === undefined, `el motor publica el progreso (${seen.length} avisos) y lo limpia al terminar`)
    eng.stop()
  }

  // --- supabaseRemote contra un PostgREST falso (URL, comillas, %2B, conteo) -----------------------
  {
    const s5 = new Store()
    const H = 'u-http'
    seed2500(s5, H)
    s5.write(H, [txDoc('raro,"id".(x):1')]) // id con caracteres reservados de PostgREST
    const net = { down: false }
    const client = createClient('https://abcd.supabase.co', 'anon-falsa', {
      global: { fetch: fakePostgrest(s5, net) as typeof fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const remote = supabaseRemote(client)
    const d = new RachaDB('dev-http')
    d.syncUserId = H
    let page = 0
    const realPull = remote.pullPage.bind(remote)
    remote.pullPage = async (u, a, l) => {
      page++
      if (page === 2) s5.write(H, [txDoc(s5.sorted(H)[50].id, 4242)]) // edición a mitad de la bajada
      if (page === 3 && !net.down) {
        net.down = true
        try {
          return await realPull(u, a, l)
        } finally {
          net.down = false
        }
      }
      return realPull(u, a, l)
    }
    let threw = false
    try {
      await pullRemote(d, remote, H)
    } catch {
      threw = true
    }
    ok(threw && (await localCount(d)) === 1000, `HTTP: corte en la página 3 deja 1000 aplicados (${await localCount(d)})`)
    const res = await pullRemote(d, remote, H)
    ok((await localCount(d)) === 2501 && res.docs === 2501 + 1, `HTTP: reanuda y termina con todo, incluida la fila editada a mitad (${await localCount(d)}, recibidos ${res.docs})`)
    ok(!!(await d.transactions.get('raro,"id".(x):1')), 'HTTP: un id con , " . ( ) : viaja bien por el filtro')
    ok(orFilters.length > 0 && orFilters.every((f) => f.includes('+00:00"')), `HTTP: el servidor recibe las fechas con +00:00 entre comillas (${orFilters[0]?.slice(0, 48)}…)`)
    ok((await remote.count!(H)) === 2501 && (await remote.hasProfile(H)) === true && (await remote.hasProfile('otro')) === false, 'HTTP: conteo con HEAD y consulta de perfil')
    net.down = true
    let threw2 = false
    try {
      await remote.hasProfile(H)
    } catch {
      threw2 = true
    }
    ok(threw2, 'HTTP: sin red, hasProfile lanza')
  }

  // --- Dos dispositivos sin verse: el perfil se mezcla y el saldo de las deudas sale de los pagos -----
  {
    const s = new Store()
    const U = 'two-dev'
    const A = new RachaDB('two-A')
    const B = new RachaDB('two-B')
    A.syncUserId = U
    B.syncUserId = U
    const rA = new FakeRemote(s)
    const rB = new FakeRemote(s)
    const c = (id: string, name: string): CustomCategory => ({ id, name, emoji: '⭐', color: '#000', kind: 'gasto' })
    const pay = (id: string, amount: number, debtId = 'deb'): Transaction => ({
      id, userId: U, type: 'pago_deuda', amount, accountId: 'a0', debtId, date: '2026-11-10', createdAt: Date.now(),
    })
    const both = async () => {
      await syncOnce(A, rA, U)
      await syncOnce(B, rB, U)
      await syncOnce(A, rA, U)
    }
    const bal = async (d: RachaDB, id = 'deb') => debtBalance((await d.debts.get(id))!, await d.transactions.toArray())

    await A.profiles.put({ ...prof(U, 'Ana', 100), freezes: 1, achievements: { primer_paso: 1 }, customCategories: [c('c1', 'Gatos'), c('c2', 'Plantas')] })
    const debtRow: Debt = {
      id: 'deb', userId: U, name: 'Tarjeta', emoji: '💳', currency: 'COP', originalBalance: 1000, balance: 1000, balanceAnchor: 1000, anchorAt: 0,
      monthlyPayment: 100, dueDay: 15, payFromAccountId: 'a0', createdAt: Date.now(),
    }
    await A.debts.put(debtRow)
    await syncOnce(A, rA, U)
    await syncOnce(B, rB, U)
    ok((await B.profiles.get(U))?.xp === 100 && !!(await B.debts.get('deb')), 'B recibe el perfil y la deuda de A')
    ok(!!(await B.meta.get(`profileBase:${U}`)) && !!(await A.meta.get(`profileBase:${U}`)), 'los dos guardan la base del perfil (lo último visto en la nube)')

    // Sin conexión, cada uno por su lado
    await A.profiles.update(U, { xp: 150, achievements: { primer_paso: 1, racha_3: 5 }, customCategories: [c('c2', 'Plantas')] })
    await A.transactions.put(pay('pA', 100))
    await B.profiles.update(U, { xp: 130, achievements: { primer_paso: 1, cuentas_2: 6 }, customCategories: [c('c1', 'Gatos'), c('c2', 'Plantas'), c('c3', 'Viajes')] })
    await B.transactions.put(pay('pB', 200))
    await both()
    for (const [n, d] of [['A', A], ['B', B]] as const) {
      const p = (await d.profiles.get(U))!
      ok(p.xp === 180, `${n}: XP ganado en los dos se suma (100 + 50 + 30 = ${p.xp})`)
      ok(J(Object.keys(p.achievements ?? {}).sort()) === J(['cuentas_2', 'primer_paso', 'racha_3']), `${n}: logros de los dos (unión)`)
      ok(J(p.customCategories?.map((x) => x.id)) === J(['c2', 'c3']), `${n}: categoría borrada en A y agregada en B → c2, c3 (${p.customCategories?.map((x) => x.id)})`)
      ok((await bal(d)) === 700, `${n}: los dos pagos a la misma deuda cuentan (1000 − 100 − 200 = ${await bal(d)})`)
      ok((await d.outbox.count()) === 0, `${n}: cola vacía al final`)
    }
    ok((s.get(U, 'profile', U)!.data as unknown as Profile).xp === 180, 'la nube tiene la mezcla')

    // El mismo logro (racha_7, 75 XP) desbloqueado en los dos sin verse: su XP cuenta una vez
    await A.profiles.update(U, { xp: 255, achievements: { ...(await A.profiles.get(U))!.achievements, racha_7: 50 } })
    await B.profiles.update(U, { xp: 255, achievements: { ...(await B.profiles.get(U))!.achievements, racha_7: 40 } })
    // Y una edición del pago en A y un borrado en B
    await A.transactions.update('pA', { amount: 150 })
    await B.transactions.delete('pB')
    await both()
    const pa = (await A.profiles.get(U))!
    const pb = (await B.profiles.get(U))!
    ok(pa.xp === 255 && pb.xp === 255, `mismo logro en los dos: XP sin duplicar (${pa.xp} / ${pb.xp})`)
    ok(pa.achievements?.racha_7 === 40 && pb.achievements?.racha_7 === 40, 'mismo logro: queda la fecha más temprana')
    ok((await bal(A)) === 850 && (await bal(B)) === 850, `editar un pago (100→150) en A y borrar el de B → 850 en los dos (${await bal(A)} / ${await bal(B)})`)

    // Ajustar saldo en un dispositivo y pagar en el otro (pago posterior al ajuste)
    await A.debts.update('deb', { balance: 2000, balanceAnchor: 2000, anchorAt: Date.now() })
    await sleep(3)
    await B.transactions.put(pay('pB2', 300))
    await both()
    ok((await bal(A)) === 1700 && (await bal(B)) === 1700, `ajuste a 2000 en A + pago posterior de 300 en B → 1700 en los dos (${await bal(A)} / ${await bal(B)})`)

    // Deuda vieja (sin ancla, de antes de esta versión): igual en los dos, y dos pagos sin verse cuentan los dos
    const legacy: Debt = { ...debtRow, id: 'old', balance: 700, originalBalance: 1000 }
    delete legacy.balanceAnchor
    delete legacy.anchorAt
    await A.debts.put(legacy)
    await A.transactions.put(pay('old-1', 300, 'old'))
    await both()
    ok((await bal(A, 'old')) === 700 && (await bal(B, 'old')) === 700, 'deuda vieja: el mismo saldo de antes en los dos (700)')
    // Lo que hace saveTransaction con una deuda vieja: escribirle el ancla equivalente y luego guardar el pago
    for (const [d, id, amount] of [[A, 'old-a', 50], [B, 'old-b', 70]] as const) {
      await d.debts.update('old', legacyAnchor((await d.debts.get('old'))!, await d.transactions.toArray())!)
      await d.transactions.put(pay(id, amount, 'old'))
    }
    await both()
    ok((await bal(A, 'old')) === 580 && (await bal(B, 'old')) === 580, `deuda vieja: dos pagos sin verse (50 y 70) → 580 en los dos (${await bal(A, 'old')} / ${await bal(B, 'old')})`)

    // Moneda: A cambia a USD (montos convertidos), B edita el ingreso en COP y el nombre
    await A.profiles.update(U, { currency: 'USD', rates: { COP: 1 / 4000 }, monthlyIncome: 1000 })
    await B.profiles.update(U, { monthlyIncome: 5_000_000, name: 'Ana B' })
    await both()
    for (const [n, d] of [['A', A], ['B', B]] as const) {
      const p = (await d.profiles.get(U))!
      ok(p.currency === 'USD' && p.monthlyIncome === 1000 && J(p.rates) === J({ COP: 1 / 4000 }) && p.name === 'Ana B', `${n}: moneda distinta → el dinero sale entero de A (USD, 1000); el nombre de B se conserva`)
    }

    // Sin base (primera mezcla tras actualizar la app): no se suma dos veces, gana el mayor
    await B.meta.delete(`profileBase:${U}`)
    await A.profiles.update(U, { xp: 300 })
    await syncOnce(A, rA, U)
    await B.profiles.update(U, { xp: 250, frozenDays: ['2026-11-02'] })
    await B.meta.delete(`profileBase:${U}`)
    const res = await syncOnce(B, rB, U)
    const p = (await B.profiles.get(U))!
    ok(res.mergedProfile && p.xp === 300 && J(p.frozenDays) === J(['2026-11-02']), `sin base: XP = el mayor (${p.xp}), los días congelados se unen`)
    await syncOnce(A, rA, U)
    ok((await A.profiles.get(U))!.xp === 300 && J((await A.profiles.get(U))!.frozenDays) === J(['2026-11-02']), 'A recibe la mezcla')
  }

  if (failures) {
    console.log(`${failures} FALLARON`)
    process.exit(1)
  }
  console.log('TODO OK')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
