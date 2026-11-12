/**
 * Tasas de cambio sugeridas. Las traemos de open.er-api.com (gratis, sin llave, se actualiza a diario),
 * las guardamos 12 h en localStorage y, sin internet ni caché, usamos una tabla aproximada incluida en la app.
 * Siempre son una SUGERENCIA: el usuario puede corregirla y su tasa manda.
 */

export const FX_URL = 'https://open.er-api.com/v6/latest/USD'
export const FX_CACHE_KEY = 'racha_fx'
export const FX_TTL_MS = 12 * 60 * 60 * 1000

export type FxSource = 'live' | 'cache' | 'approx'

/** Tasas con base USD: usd[X] = cuántas X vale 1 USD */
export interface FxTable {
  usd: Record<string, number>
  /** Fecha de la tasa según el proveedor (ms) */
  date?: number
  /** Cuándo la descargamos (ms) */
  fetchedAt: number
}

export interface RateSuggestion {
  /** Cuántas unidades de la moneda principal vale 1 de la otra (mismo formato que Profile.rates) */
  rate: number
  source: FxSource
  date?: number
}

/**
 * Tabla APROXIMADA de respaldo (1 USD = X), solo para cuando no hay internet ni caché.
 * Valores de referencia de 2026; las monedas con inflación alta (ARS, VES, ...) quedan desactualizadas rápido.
 */
export const APPROX_USD: Record<string, number> = {
  USD: 1,
  COP: 4000,
  EUR: 0.92,
  MXN: 18.5,
  ARS: 1400,
  CLP: 940,
  PEN: 3.6,
  BRL: 5.4,
  UYU: 40,
  BOB: 6.9,
  PYG: 7500,
  VES: 200,
  DOP: 62,
  CRC: 505,
  GTQ: 7.7,
  HNL: 26,
  NIO: 36.8,
  PAB: 1,
  CUP: 24,
  CAD: 1.38,
  QAR: 3.64,
  AED: 3.6725,
  SAR: 3.75,
  KWD: 0.307,
  BHD: 0.376,
  OMR: 0.3845,
  JOD: 0.709,
  ILS: 3.7,
  TRY: 41,
  GBP: 0.78,
  CHF: 0.85,
  SEK: 10,
  NOK: 10.5,
  DKK: 6.9,
  PLN: 3.9,
  CZK: 22.5,
  HUF: 360,
  RON: 4.6,
  JPY: 150,
  CNY: 7.2,
  KRW: 1400,
  INR: 87,
  PKR: 282,
  PHP: 57,
  SGD: 1.3,
  HKD: 7.8,
  THB: 33,
  MYR: 4.3,
  IDR: 16300,
  VND: 26000,
  AUD: 1.53,
  NZD: 1.7,
  ZAR: 18,
  EGP: 49,
  MAD: 9.2,
  NGN: 1550,
  KES: 129,
}

/** 1 `from` = ? `main`, a partir de una tabla con base USD. null si falta alguna moneda. */
export function crossRate(from: string, main: string, usd: Record<string, number>): number | null {
  if (from === main) return 1
  const f = usd[from]
  const m = usd[main]
  if (!(f > 0) || !(m > 0)) return null
  return m / f
}

/** Valida la respuesta de open.er-api.com y la convierte en tabla. */
export function parseFxResponse(json: unknown, now: number): FxTable | null {
  const j = json as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> } | null
  if (!j || j.result !== 'success' || !j.rates || typeof j.rates !== 'object') return null
  const usd: Record<string, number> = {}
  for (const [k, v] of Object.entries(j.rates)) if (typeof v === 'number' && v > 0) usd[k] = v
  if (!usd.USD) usd.USD = 1
  return { usd, date: j.time_last_update_unix ? j.time_last_update_unix * 1000 : undefined, fetchedAt: now }
}

export const isFresh = (t: FxTable, now: number, ttl = FX_TTL_MS) => now - t.fetchedAt < ttl

export function readCache(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): FxTable | null {
  try {
    const raw = storage?.getItem(FX_CACHE_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as FxTable
    return t && t.usd && typeof t.fetchedAt === 'number' ? t : null
  } catch {
    return null
  }
}

function writeCache(t: FxTable, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(FX_CACHE_KEY, JSON.stringify(t))
  } catch {
    /* sin espacio o modo privado: seguimos sin caché */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export interface FxDeps {
  fetch?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  now?: () => number
}

let inflight: Promise<{ table: FxTable; source: FxSource } | null> | null = null

/**
 * Devuelve la mejor tabla disponible: caché fresca → descarga → caché vieja → null.
 * Nunca lanza. Comparte la descarga entre llamadas simultáneas.
 */
export function getFxTable(deps: FxDeps = {}): Promise<{ table: FxTable; source: FxSource } | null> {
  const storage = deps.storage ?? safeStorage()
  const now = (deps.now ?? Date.now)()
  const cached = readCache(storage)
  if (cached && isFresh(cached, now)) return Promise.resolve({ table: cached, source: 'cache' })
  if (inflight && !deps.fetch) return inflight
  const doFetch = deps.fetch ?? (typeof fetch === 'undefined' ? undefined : fetch)
  const p = (async () => {
    try {
      if (!doFetch) throw new Error('sin fetch')
      const ctrl = typeof AbortController === 'undefined' ? undefined : new AbortController()
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : undefined
      try {
        const res = await doFetch(FX_URL, { signal: ctrl?.signal })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const table = parseFxResponse(await res.json(), now)
        if (!table) throw new Error('respuesta inválida')
        writeCache(table, storage)
        return { table, source: 'live' as const }
      } finally {
        if (timer) clearTimeout(timer)
      }
    } catch {
      return cached ? { table: cached, source: 'cache' as const } : null
    }
  })()
  if (!deps.fetch) {
    inflight = p
    void p.finally(() => {
      inflight = null
    })
  }
  return p
}

/** Tasa sugerida "1 from = ? main". Usa mercado/caché y, si no hay, la tabla aproximada. null si no la conocemos. */
export async function suggestRate(from: string, main: string, deps: FxDeps = {}): Promise<RateSuggestion | null> {
  if (from === main) return { rate: 1, source: 'live' }
  const got = await getFxTable(deps)
  if (got) {
    const r = crossRate(from, main, got.table.usd)
    if (r) return { rate: round6(r), source: got.source, date: got.table.date }
  }
  return approxRate(from, main)
}

/** Sugerencia inmediata (sin red) con la caché, o la tabla aproximada. Útil para no dejar el campo vacío mientras carga. */
export function approxRate(from: string, main: string): RateSuggestion | null {
  const r = crossRate(from, main, APPROX_USD)
  return r ? { rate: round6(r), source: 'approx' } : null
}

/** 6 cifras significativas: suficiente para una tasa y deja el número limpio al guardarlo */
const round6 = (n: number) => Number(n.toPrecision(6))

/** Para pruebas */
export function _resetFx() {
  inflight = null
}

/** "1 QAR = 1.098,9 COP" — o al revés si la tasa es menor que 1 ("1 USD = 4.000 COP" en vez de "1 COP = 0,00025 USD") */
export function rateLabel(foreign: string, main: string, rate: number) {
  const fmt = (n: number) => n.toLocaleString('es-CO', { maximumSignificantDigits: 6 })
  return rate < 1 ? `1 ${main} = ${fmt(1 / rate)} ${foreign}` : `1 ${foreign} = ${fmt(rate)} ${main}`
}

