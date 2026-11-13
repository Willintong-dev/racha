/**
 * Mezcla de tres vías del perfil (un solo documento por usuario) para no perder cambios cuando dos
 * dispositivos lo editan sin verse (dos teléfonos, o uno sin conexión).
 *
 * - `base`: la última versión del perfil que sabemos que está en la nube (ver sync.ts, `profileBase`).
 * - `local`: la de este dispositivo, con cambios aún sin subir.
 * - `remote`: la que acaba de bajar de la nube.
 *
 * Reglas:
 * - `xp` y `freezes` son contadores: base + lo que sumó cada lado. Un logro desbloqueado en LOS DOS lados
 *   (sin estar en la base) solo da su XP una vez. Sin base: el mayor de los dos (nunca se suma dos veces).
 * - `achievements`: unión, con la fecha más temprana. `frozenDays`: unión ordenada sin repetidos.
 * - `customCategories`, `fixedExpenses`, `debtItems`: por id. Lo agregado en cualquier lado se queda; lo
 *   borrado en un lado (estaba en la base y el otro no lo tocó) se borra; editado en los dos → gana local.
 * - `rates`: por moneda, con la misma regla.
 * - Cualquier otro campo: si solo cambió un lado se toma ese; si cambiaron los dos, gana local.
 * - MONEDA: `changeMainCurrency` re-expresa los montos en la moneda nueva. Si al final los dos lados tienen
 *   monedas distintas, NO se mezclan montos: todo el grupo de dinero (MONEY_FIELDS) sale entero del lado
 *   que ganó el campo `currency` (aunque el otro lado haya editado, p. ej., su ingreso en la otra moneda).
 * - `userId` siempre es el dueño.
 */
import type { MonthlyItem, Profile } from './db'
import { ACHIEVEMENTS, FREEZE_MAX } from './game'
import { sumItems } from './finance'

/** JSON con las llaves ordenadas (jsonb no conserva el orden) para comparar. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val,
  )
}
const eq = (a: unknown, b: unknown) => stable(a) === stable(b)

/** Campos expresados en la moneda principal: viajan juntos cuando las monedas no coinciden. */
export const MONEY_FIELDS = ['currency', 'rates', 'monthlyIncome', 'fixedExpenses', 'debtItems', 'monthlyDebtPayments', 'dailyLimit', 'debtPlan'] as const

type Obj = Record<string, unknown>

/** Escalar: solo un lado cambió → ese lado; los dos → local. Sin base → local (salvo que local no lo tenga). */
function pick<T>(b: T | undefined, l: T | undefined, r: T | undefined, hasBase: boolean): T | undefined {
  if (!hasBase) return l !== undefined ? l : r
  if (eq(l, b)) return r
  return l
}

/** Contador: base + delta local + delta remoto. Sin base: el mayor. */
function counter(b: number | undefined, l: number, r: number) {
  if (b === undefined) return Math.max(l, r)
  return b + (l - b) + (r - b)
}

/** Listas por id (mismo criterio que `pick`, pero elemento por elemento). Orden: el de local y luego lo nuevo del remoto. */
export function mergeById<T extends { id: string }>(base: T[] | undefined, local: T[] | undefined, remote: T[] | undefined): T[] | undefined {
  if (local === undefined && remote === undefined) return undefined
  const B = new Map((base ?? []).map((x) => [x.id, x]))
  const L = new Map((local ?? []).map((x) => [x.id, x]))
  const R = new Map((remote ?? []).map((x) => [x.id, x]))
  const out: T[] = []
  const decide = (id: string) => {
    const b = B.get(id)
    const l = L.get(id)
    const r = R.get(id)
    if (l && r) return eq(l, b) ? r : l
    if (l) return b && eq(l, b) ? undefined : l // el remoto lo borró y aquí no se tocó → borrado
    if (r) return b && eq(r, b) ? undefined : r // borrado aquí y allá no se tocó → borrado
    return undefined
  }
  for (const id of L.keys()) {
    const x = decide(id)
    if (x) out.push(x)
  }
  for (const id of R.keys()) {
    if (L.has(id)) continue
    const x = decide(id)
    if (x) out.push(x)
  }
  return out
}

/** Mapas por llave (tasas): la misma regla que las listas por id. */
function mergeMap<V>(base: Record<string, V> | undefined, local: Record<string, V> | undefined, remote: Record<string, V> | undefined) {
  if (local === undefined && remote === undefined) return undefined
  const toList = (m?: Record<string, V>) => (m ? Object.entries(m).map(([id, v]) => ({ id, v })) : undefined)
  const merged = mergeById(toList(base), toList(local), toList(remote))!
  return Object.fromEntries(merged.map((e) => [e.id, e.v])) as Record<string, V>
}

const xpOf = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)?.xp ?? 0

/**
 * Mezcla tres versiones del perfil. Pura: no lee ni escribe nada. `base` undefined = no se sabe qué había
 * en la nube (primera vez tras actualizar, o un dispositivo con datos de antes de sincronizar).
 */
export function mergeProfile(base: Profile | undefined, local: Profile, remote: Profile, owner = local.userId): Profile {
  const hasBase = base !== undefined
  const b = (base ?? {}) as Obj
  const l = local as unknown as Obj
  const r = remote as unknown as Obj
  const out: Obj = {}

  // Campos genéricos (todo lo que no tiene regla propia)
  const special = new Set(['userId', 'xp', 'freezes', 'achievements', 'frozenDays', 'customCategories', 'fixedExpenses', 'debtItems', 'rates'])
  const keys = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])
  for (const k of keys) if (!special.has(k)) out[k] = pick(b[k], l[k], r[k], hasBase)

  // Logros: unión con la fecha más temprana
  const achievements: Record<string, number> = {}
  for (const src of [local.achievements, remote.achievements]) {
    for (const [id, ts] of Object.entries(src ?? {})) achievements[id] = id in achievements ? Math.min(achievements[id], ts) : ts
  }
  if (local.achievements || remote.achievements) out.achievements = achievements

  // XP: suma de lo ganado en cada lado. Un logro nuevo en LOS DOS lados se cobró dos veces: se descuenta uno.
  let xp = counter(base?.xp, local.xp ?? 0, remote.xp ?? 0)
  if (base) {
    const had = base.achievements ?? {}
    for (const id of Object.keys(achievements)) {
      if (!had[id] && local.achievements?.[id] && remote.achievements?.[id]) xp -= xpOf(id)
    }
  }
  out.xp = Math.max(0, xp)

  // Congeladores: undefined = 1 (regalo de bienvenida)
  if (local.freezes !== undefined || remote.freezes !== undefined || base?.freezes !== undefined) {
    const f = counter(base ? (base.freezes ?? 1) : undefined, local.freezes ?? 1, remote.freezes ?? 1)
    out.freezes = Math.min(FREEZE_MAX, Math.max(0, f))
  }

  // Días salvados: unión
  if (local.frozenDays || remote.frozenDays) out.frozenDays = [...new Set([...(local.frozenDays ?? []), ...(remote.frozenDays ?? [])])].sort()

  out.customCategories = mergeById(base?.customCategories, local.customCategories, remote.customCategories)

  if (out.currency === local.currency && out.currency === remote.currency) {
    // Misma moneda: los montos se pueden mezclar campo por campo
    out.fixedExpenses = mergeById(base?.fixedExpenses, local.fixedExpenses, remote.fixedExpenses)
    out.debtItems = mergeById(base?.debtItems, local.debtItems, remote.debtItems)
    out.rates = mergeMap(base?.rates, local.rates, remote.rates)
    // monthlyDebtPayments es la suma de debtItems: si la lista mezclada no es la de ningún lado, se recalcula
    const items = out.debtItems as MonthlyItem[] | undefined
    if (items && !eq(items, local.debtItems) && !eq(items, remote.debtItems)) out.monthlyDebtPayments = sumItems(items)
  } else {
    // Monedas distintas: todo el grupo de dinero sale del lado que ganó la moneda
    const winner = (out.currency === local.currency ? l : r) as Obj
    for (const k of MONEY_FIELDS) out[k] = winner[k]
  }

  out.userId = owner
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out as unknown as Profile
}
