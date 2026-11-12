/**
 * Pruebas de las tasas de cambio sugeridas.
 * Ejecutar: esbuild tests/fx.test.ts --bundle --platform=node --outfile=fx.test.mjs --format=esm && node fx.test.mjs
 */
import { APPROX_USD, crossRate, FX_CACHE_KEY, FX_TTL_MS, parseFxResponse, rateLabel, readCache, suggestRate } from '../src/lib/fx'
import { CURRENCY_LIST } from '../src/lib/format'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const near = (a: number | null | undefined, b: number, tol = 1e-4) => a != null && Math.abs(a / b - 1) < tol

const memStorage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const USD = { USD: 1, COP: 4000, QAR: 3.64, EUR: 0.9 }
const apiJson = (rates = USD) => ({ result: 'success', time_last_update_unix: 1_700_000_000, rates })
let calls = 0
const okFetch = (rates = USD) =>
  (async () => {
    calls++
    return { ok: true, status: 200, json: async () => apiJson(rates) }
  }) as unknown as typeof fetch
const failFetch = (async () => {
  calls++
  throw new TypeError('Failed to fetch')
}) as unknown as typeof fetch

async function main() {
  // --- Matemática de tasas cruzadas ---
  ok(crossRate('COP', 'COP', USD) === 1, 'misma moneda = 1')
  ok(near(crossRate('QAR', 'COP', USD), 4000 / 3.64), '1 QAR = 1098,9 COP (vía USD)')
  ok(near(crossRate('COP', 'QAR', USD), 3.64 / 4000), '1 COP = 0,00091 QAR (inversa)')
  ok(near(crossRate('USD', 'COP', USD), 4000), '1 USD = 4000 COP')
  ok(near(crossRate('EUR', 'USD', USD), 1 / 0.9), '1 EUR = 1,11 USD')
  ok(near(crossRate('QAR', 'COP', USD)! * crossRate('COP', 'QAR', USD)!, 1), 'ida y vuelta da 1')
  ok(crossRate('XXX', 'COP', USD) === null, 'moneda desconocida → null')
  ok(crossRate('COP', 'XXX', USD) === null, 'principal desconocida → null')
  ok(crossRate('COP', 'USD', { USD: 1, COP: 0 }) === null, 'tasa 0 → null')

  // --- Respuesta de la API ---
  const t = parseFxResponse(apiJson(), 123)
  ok(!!t && t.usd.COP === 4000 && t.fetchedAt === 123 && t.date === 1_700_000_000_000, 'parsea respuesta válida')
  ok(parseFxResponse({ result: 'error', 'error-type': 'x' }, 1) === null, 'result≠success → null')
  ok(parseFxResponse(null, 1) === null, 'null → null')
  ok(!parseFxResponse({ result: 'success', rates: { COP: 'x', USD: 1 } }, 1)?.usd.COP, 'ignora valores no numéricos')

  // --- Descarga + caché ---
  const NOW = 1_800_000_000_000
  let s = memStorage()
  calls = 0
  let r = await suggestRate('QAR', 'COP', { fetch: okFetch(), storage: s, now: () => NOW })
  ok(r?.source === 'live' && near(r.rate, 1098.9) && calls === 1, `en línea → live ${r?.rate}`)
  ok(!!readCache(s) && readCache(s)!.fetchedAt === NOW, 'guarda en caché ' + FX_CACHE_KEY)
  ok(r!.rate === Number(r!.rate.toPrecision(6)), 'tasa redondeada a 6 cifras')

  r = await suggestRate('QAR', 'COP', { fetch: okFetch({ ...USD, COP: 5000 }), storage: s, now: () => NOW + FX_TTL_MS - 1000 })
  ok(r?.source === 'cache' && near(r.rate, 4000 / 3.64) && calls === 1, 'caché fresca: no vuelve a descargar')

  r = await suggestRate('QAR', 'COP', { fetch: okFetch({ ...USD, COP: 5000 }), storage: s, now: () => NOW + FX_TTL_MS + 1000 })
  ok(r?.source === 'live' && near(r.rate, 5000 / 3.64) && calls === 2, 'caché vencida (>12 h): descarga de nuevo')

  r = await suggestRate('QAR', 'COP', { fetch: failFetch, storage: s, now: () => NOW + 3 * FX_TTL_MS })
  ok(r?.source === 'cache' && near(r.rate, 5000 / 3.64) && calls === 3, 'sin internet + caché vieja → usa la caché')

  const badStatus = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
  r = await suggestRate('QAR', 'COP', { fetch: badStatus, storage: s, now: () => NOW + 3 * FX_TTL_MS })
  ok(r?.source === 'cache', 'HTTP 503 + caché → caché')

  // --- Respaldo aproximado ---
  s = memStorage()
  r = await suggestRate('QAR', 'COP', { fetch: failFetch, storage: s, now: () => NOW })
  ok(r?.source === 'approx' && near(r.rate, APPROX_USD.COP / APPROX_USD.QAR), `sin internet ni caché → aproximada ${r?.rate}`)
  ok(readCache(s) === null, 'la aproximada no se guarda como caché')

  r = await suggestRate('QAR', 'COP', { fetch: okFetch({ USD: 1, COP: 4000 } as typeof USD), storage: memStorage(), now: () => NOW })
  ok(r?.source === 'approx', 'API sin esa moneda → aproximada')

  r = await suggestRate('XXX', 'COP', { fetch: failFetch, storage: memStorage(), now: () => NOW })
  ok(r === null, 'moneda que nadie conoce → null')

  const corrupt = memStorage()
  corrupt.setItem(FX_CACHE_KEY, '{no es json')
  r = await suggestRate('USD', 'COP', { fetch: failFetch, storage: corrupt, now: () => NOW })
  ok(r?.source === 'approx', 'caché corrupta no rompe nada')

  const missing = CURRENCY_LIST.map((c) => c.code).filter((c) => !APPROX_USD[c])
  ok(missing.length === 0, 'la tabla aproximada cubre todas las monedas de la app' + (missing.length ? ': faltan ' + missing : ''))

  // --- Etiqueta ---
  ok(rateLabel('QAR', 'COP', 1098.9) === '1 QAR = 1.098,9 COP', rateLabel('QAR', 'COP', 1098.9))
  ok(rateLabel('COP', 'USD', 0.00025) === '1 USD = 4.000 COP', rateLabel('COP', 'USD', 0.00025))

  console.log(failures ? `\n${failures} FALLARON` : '\nTODO OK')
  if (failures) process.exitCode = 1
}
void main()
