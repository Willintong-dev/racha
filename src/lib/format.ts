export interface CurrencyInfo {
  code: string
  name: string
  flag: string
  /** Locale usado para separadores de miles/decimales cuando esta es la moneda principal */
  locale: string
}

export const CURRENCY_LIST: CurrencyInfo[] = [
  { code: 'COP', name: 'Peso colombiano', flag: '🇨🇴', locale: 'es-CO' },
  { code: 'USD', name: 'Dólar estadounidense', flag: '🇺🇸', locale: 'es-US' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', locale: 'es-ES' },
  { code: 'MXN', name: 'Peso mexicano', flag: '🇲🇽', locale: 'es-MX' },
  { code: 'ARS', name: 'Peso argentino', flag: '🇦🇷', locale: 'es-AR' },
  { code: 'CLP', name: 'Peso chileno', flag: '🇨🇱', locale: 'es-CL' },
  { code: 'PEN', name: 'Sol peruano', flag: '🇵🇪', locale: 'es-PE' },
  { code: 'BRL', name: 'Real brasileño', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'UYU', name: 'Peso uruguayo', flag: '🇺🇾', locale: 'es-UY' },
  { code: 'BOB', name: 'Boliviano', flag: '🇧🇴', locale: 'es-BO' },
  { code: 'PYG', name: 'Guaraní', flag: '🇵🇾', locale: 'es-PY' },
  { code: 'VES', name: 'Bolívar', flag: '🇻🇪', locale: 'es-VE' },
  { code: 'DOP', name: 'Peso dominicano', flag: '🇩🇴', locale: 'es-DO' },
  { code: 'CRC', name: 'Colón costarricense', flag: '🇨🇷', locale: 'es-CR' },
  { code: 'GTQ', name: 'Quetzal', flag: '🇬🇹', locale: 'es-GT' },
  { code: 'HNL', name: 'Lempira', flag: '🇭🇳', locale: 'es-HN' },
  { code: 'NIO', name: 'Córdoba', flag: '🇳🇮', locale: 'es-NI' },
  { code: 'PAB', name: 'Balboa', flag: '🇵🇦', locale: 'es-PA' },
  { code: 'CUP', name: 'Peso cubano', flag: '🇨🇺', locale: 'es-CU' },
  { code: 'CAD', name: 'Dólar canadiense', flag: '🇨🇦', locale: 'en-CA' },
  // Medio Oriente
  { code: 'QAR', name: 'Riyal catarí', flag: '🇶🇦', locale: 'en-QA' },
  { code: 'AED', name: 'Dírham de EAU', flag: '🇦🇪', locale: 'en-AE' },
  { code: 'SAR', name: 'Riyal saudí', flag: '🇸🇦', locale: 'en-SA' },
  { code: 'KWD', name: 'Dinar kuwaití', flag: '🇰🇼', locale: 'en-KW' },
  { code: 'BHD', name: 'Dinar bareiní', flag: '🇧🇭', locale: 'en-BH' },
  { code: 'OMR', name: 'Rial omaní', flag: '🇴🇲', locale: 'en-OM' },
  { code: 'JOD', name: 'Dinar jordano', flag: '🇯🇴', locale: 'en-JO' },
  { code: 'ILS', name: 'Nuevo séquel', flag: '🇮🇱', locale: 'en-IL' },
  { code: 'TRY', name: 'Lira turca', flag: '🇹🇷', locale: 'en-TR' },
  // Europa
  { code: 'GBP', name: 'Libra esterlina', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'CHF', name: 'Franco suizo', flag: '🇨🇭', locale: 'de-CH' },
  { code: 'SEK', name: 'Corona sueca', flag: '🇸🇪', locale: 'sv-SE' },
  { code: 'NOK', name: 'Corona noruega', flag: '🇳🇴', locale: 'nb-NO' },
  { code: 'DKK', name: 'Corona danesa', flag: '🇩🇰', locale: 'da-DK' },
  { code: 'PLN', name: 'Esloti polaco', flag: '🇵🇱', locale: 'pl-PL' },
  { code: 'CZK', name: 'Corona checa', flag: '🇨🇿', locale: 'cs-CZ' },
  { code: 'HUF', name: 'Forinto húngaro', flag: '🇭🇺', locale: 'hu-HU' },
  { code: 'RON', name: 'Leu rumano', flag: '🇷🇴', locale: 'ro-RO' },
  // Asia y Oceanía
  { code: 'JPY', name: 'Yen japonés', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'CNY', name: 'Yuan chino', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'KRW', name: 'Won surcoreano', flag: '🇰🇷', locale: 'ko-KR' },
  { code: 'INR', name: 'Rupia india', flag: '🇮🇳', locale: 'en-IN' },
  { code: 'PKR', name: 'Rupia pakistaní', flag: '🇵🇰', locale: 'en-PK' },
  { code: 'PHP', name: 'Peso filipino', flag: '🇵🇭', locale: 'en-PH' },
  { code: 'SGD', name: 'Dólar de Singapur', flag: '🇸🇬', locale: 'en-SG' },
  { code: 'HKD', name: 'Dólar de Hong Kong', flag: '🇭🇰', locale: 'en-HK' },
  { code: 'THB', name: 'Baht tailandés', flag: '🇹🇭', locale: 'th-TH' },
  { code: 'MYR', name: 'Ringgit malayo', flag: '🇲🇾', locale: 'en-MY' },
  { code: 'IDR', name: 'Rupia indonesia', flag: '🇮🇩', locale: 'id-ID' },
  { code: 'VND', name: 'Dong vietnamita', flag: '🇻🇳', locale: 'vi-VN' },
  { code: 'AUD', name: 'Dólar australiano', flag: '🇦🇺', locale: 'en-AU' },
  { code: 'NZD', name: 'Dólar neozelandés', flag: '🇳🇿', locale: 'en-NZ' },
  // África
  { code: 'ZAR', name: 'Rand sudafricano', flag: '🇿🇦', locale: 'en-ZA' },
  { code: 'EGP', name: 'Libra egipcia', flag: '🇪🇬', locale: 'en-EG' },
  { code: 'MAD', name: 'Dírham marroquí', flag: '🇲🇦', locale: 'fr-MA' },
  { code: 'NGN', name: 'Naira nigeriana', flag: '🇳🇬', locale: 'en-NG' },
  { code: 'KES', name: 'Chelín keniano', flag: '🇰🇪', locale: 'en-KE' },
]

/** Busca por código, nombre o país (sin tildes ni mayúsculas). */
export function searchCurrencies(q: string) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const n = norm(q.trim())
  if (!n) return CURRENCY_LIST
  return CURRENCY_LIST.filter((c) => norm(`${c.code} ${c.name} ${countryNames(c)}`).includes(n))
}

let esRegions: Intl.DisplayNames | undefined
let enRegions: Intl.DisplayNames | undefined
/** "Catar Qatar" para QAR, a partir de la región del locale. EUR → "Unión Europea". */
function countryNames(c: CurrencyInfo) {
  if (c.code === 'EUR') return 'union europea europe espana alemania francia italia'
  const region = c.locale.split('-')[1]
  if (!region) return ''
  try {
    esRegions ??= new Intl.DisplayNames(['es'], { type: 'region' })
    enRegions ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return `${esRegions.of(region) ?? ''} ${enRegions.of(region) ?? ''}`
  } catch {
    return ''
  }
}

const byCode = new Map(CURRENCY_LIST.map((c) => [c.code, c]))
export const currencyInfo = (code: string): CurrencyInfo =>
  byCode.get(code) ?? { code, name: code, flag: '💱', locale: 'es' }

let main = 'COP'
const formatters = new Map<string, Intl.NumberFormat>()

function fmt(code: string) {
  let f = formatters.get(code)
  if (!f) {
    f = new Intl.NumberFormat(currencyInfo(main).locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    formatters.set(code, f)
  }
  return f
}

export function setMainCurrency(code: string) {
  if (code === main) return
  main = code
  formatters.clear()
}
export const getMainCurrency = () => main

/** Símbolo corto de una moneda ("$", "€", "R$"). */
export function currencySymbol(code: string) {
  return fmt(code).formatToParts(1).find((p) => p.type === 'currency')?.value ?? code
}

/** Símbolos que comparten varias monedas ($ COP/USD/MXN, ¥ JPY/CNY, kr SEK/NOK/DKK). */
const AMBIGUOUS = new Set(['$', '¥', '￥', 'kr', 'Fr'])
/** Una moneda extranjera con símbolo ambiguo se confunde con otras: le agregamos el código. */
const needsCode = (code: string) => code !== main && AMBIGUOUS.has(currencySymbol(code))

export function money(n: number, opts?: { sign?: boolean; currency?: string }) {
  const code = opts?.currency ?? main
  let s = fmt(code).format(Math.abs(n))
  if (needsCode(code)) s += ' ' + code
  if (opts?.sign) return (n > 0 ? '+' : n < 0 ? '−' : '') + s
  return n < 0 ? '−' + s : s
}

/** Formatea lo que el usuario está tecleando ("1500.5" → "1.500,5"). */
export function formatTyping(s: string) {
  if (!s) return '0'
  const [int, dec] = s.split('.')
  const locale = currencyInfo(main).locale
  const intFmt = Number(int || '0').toLocaleString(locale)
  const decSep = (1.5).toLocaleString(locale).charAt(1)
  return dec !== undefined ? `${intFmt}${decSep}${dec}` : intFmt
}

export const parseAmount = (s: string) => Math.round((parseFloat(s) || 0) * 100) / 100

const pad = (n: number) => String(n).padStart(2, '0')
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => toDateStr(new Date())
export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function dayLabel(s: string) {
  const t = todayStr()
  if (s === t) return 'Hoy'
  if (s === addDays(t, -1)) return 'Ayer'
  return parseDate(s).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function monthLabel(d: Date) {
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Funciona también fuera de HTTPS (crypto.randomUUID no). */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
