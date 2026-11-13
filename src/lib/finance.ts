import type { Account, Debt, MonthlyItem, Profile, Transaction } from './db'
import { addDays, parseDate, todayStr } from './format'

/** Convierte un monto de una cuenta a la moneda principal. Devuelve 0 si falta la tasa. */
export type ToMain = (amount: number, accountId: string) => number
const identity: ToMain = (a) => a

/** rate(c): cuántas unidades de la moneda principal vale 1 c (undefined si no se conoce). */
export function rateOf(code: string, main: string, rates?: Record<string, number>) {
  return code === main ? 1 : rates?.[code]
}

export function makeToMain(accounts: Account[], main: string, rates?: Record<string, number>): ToMain {
  const cur = new Map(accounts.map((a) => [a.id, a.currency]))
  return (amount, accountId) => {
    const r = rateOf(cur.get(accountId) ?? main, main, rates)
    return r ? amount * r : 0
  }
}

export function missingRates(accounts: Account[], main: string, rates?: Record<string, number>) {
  return [...new Set(accounts.filter((a) => !a.archived && !rateOf(a.currency, main, rates)).map((a) => a.currency))]
}

/** Efecto de un movimiento sobre el saldo de una cuenta. */
export function txEffect(tx: Transaction, accountId: string) {
  switch (tx.type) {
    case 'ingreso':
      return tx.accountId === accountId ? tx.amount : 0
    case 'gasto':
    case 'pago_deuda':
      return tx.accountId === accountId ? -tx.amount : 0
    case 'ajuste':
      return tx.accountId === accountId ? tx.amount : 0
    case 'transferencia':
      if (tx.accountId === accountId) return -tx.amount
      if (tx.toAccountId === accountId) return tx.toAmount ?? tx.amount
      return 0
  }
}

export function computeBalances(accounts: Account[], txs: Transaction[]) {
  const map = new Map<string, number>()
  for (const a of accounts) map.set(a.id, a.initialBalance)
  for (const tx of txs) {
    if (tx.type === 'transferencia') {
      if (map.has(tx.accountId)) map.set(tx.accountId, map.get(tx.accountId)! - tx.amount)
      if (tx.toAccountId && map.has(tx.toAccountId)) map.set(tx.toAccountId, map.get(tx.toAccountId)! + (tx.toAmount ?? tx.amount))
    } else if (map.has(tx.accountId)) {
      map.set(tx.accountId, map.get(tx.accountId)! + txEffect(tx, tx.accountId))
    }
  }
  for (const [k, v] of map) map.set(k, Math.round(v * 100) / 100)
  return map
}

/** Categorías de tus gastos fijos: ya están presupuestadas, no cuentan contra el límite diario. */
export function fixedCategories(fixed?: MonthlyItem[]) {
  return new Set((fixed ?? []).map((f) => f.categoryId).filter((c): c is string => !!c))
}

const sumItems = (items?: MonthlyItem[]) => (items ?? []).reduce((s, i) => s + i.amount, 0)
export { sumItems }

/** Gasto "del día a día" de una fecha, en moneda principal (sin gastos fijos). */
export function spentOn(txs: Transaction[], date: string, toMain: ToMain = identity, exclude?: Set<string>) {
  let s = 0
  for (const t of txs)
    if (t.type === 'gasto' && t.date === date && !(t.categoryId && exclude?.has(t.categoryId))) s += toMain(t.amount, t.accountId)
  return s
}

/**
 * Racha: un día es "bueno" si registraste al menos 1 movimiento
 * y (si tienes límite diario) no te pasaste.
 * Hoy aún no termina: si hoy no has registrado nada, la racha sigue viva desde ayer.
 * Los días salvados con congelador (`frozen`) mantienen la racha y cuentan en ella.
 */
export function computeStreak(
  txs: Transaction[],
  dailyLimit?: number,
  toMain: ToMain = identity,
  exclude?: Set<string>,
  frozen: Set<string> = new Set(),
) {
  const byDay = new Map<string, { count: number; spent: number }>()
  for (const t of txs) {
    if (t.type === 'ajuste') continue
    const d = byDay.get(t.date) ?? { count: 0, spent: 0 }
    d.count++
    if (t.type === 'gasto' && !(t.categoryId && exclude?.has(t.categoryId))) d.spent += toMain(t.amount, t.accountId)
    byDay.set(t.date, d)
  }
  const isGood = (day: string) => {
    const d = byDay.get(day)
    if (!d || d.count === 0) return false
    return !dailyLimit || d.spent <= dailyLimit
  }
  const goodDays = new Set([...byDay.keys()].filter(isGood))
  const kept = new Set([...goodDays, ...frozen])

  const today = todayStr()
  let current = 0
  let day = today
  const todayInfo = byDay.get(today)
  if (todayInfo && !isGood(today)) {
    current = 0 // hoy te pasaste del límite
  } else {
    if (!isGood(today)) day = addDays(today, -1)
    while (kept.has(day)) {
      current++
      day = addDays(day, -1)
    }
  }

  let best = 0
  let run = 0
  let prev = ''
  for (const d of [...kept].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best: Math.max(best, current), goodDays, frozenDays: frozen, todayDone: isGood(today), isGood }
}

/** Para pasar del nivel L al L+1 se necesitan L × 100 XP. */
export function levelFromXp(xp: number) {
  let level = 1
  let rest = xp
  while (rest >= level * 100) {
    rest -= level * 100
    level++
  }
  return { level, into: rest, needed: level * 100 }
}

/** (ingreso − cuotas de deudas − gastos fijos − ahorro) ÷ 30 */
export function suggestedDailyLimit(income?: number, debts = 0, savingsPct = 0, fixed = 0) {
  if (!income) return undefined
  return Math.floor((income - debts - fixed - (income * savingsPct) / 100) / 30)
}

/**
 * Cuotas mensuales de deudas en moneda principal: deudas registradas activas + cuotas del onboarding
 * aún sin completar (igual que el límite sugerido en Perfil).
 */
export function monthlyDebtTotal(
  profile: Pick<Profile, 'debtItems' | 'monthlyDebtPayments'>,
  debts: Debt[],
  convert: (amount: number, code: string) => number,
) {
  const registered = debts.filter((d) => d.balance > 0).reduce((s, d) => s + convert(d.monthlyPayment, d.currency), 0)
  return registered + (profile.debtItems ? sumItems(profile.debtItems) : (profile.monthlyDebtPayments ?? 0))
}

export type MonthStatus = 'verde' | 'amarillo' | 'rojo'

export interface MonthBalance {
  /** Ingreso mensual declarado */
  income: number
  /** Gastos fijos presupuestados */
  fixed: number
  /** Cuotas de deudas presupuestadas */
  debts: number
  /** Ahorro (savingsPct del ingreso) */
  saving: number
  /** Para el día a día este mes = ingreso − fijos − cuotas − ahorro (misma base que el límite sugerido) */
  budget: number
  /** Gastos del mes sin las categorías de gastos fijos */
  variableSpent: number
  /** Gastos del mes en categorías de gastos fijos */
  fixedSpent: number
  /** Pagos a deudas hechos este mes */
  debtPaid: number
  /** Ingresos registrados este mes */
  incomeReceived: number
  /** budget − variableSpent (negativo = te pasaste) */
  remaining: number
  daysInMonth: number
  /** Día del mes de hoy (1…31) */
  day: number
  /** Días que quedan contando hoy */
  daysLeft: number
  /** Lo que "tocaría" llevar gastado al terminar hoy si repartes el presupuesto parejo */
  expectedByToday: number
  /** Lo que puedes gastar por día el resto del mes (0 si ya no queda) */
  perDayLeft: number
  status: MonthStatus
}

/**
 * Balance del mes calendario (del 1 al último día). Todo en moneda principal.
 * verde = vas igual o por debajo del ritmo; amarillo = vas más rápido que el ritmo pero aún te queda;
 * rojo = el gasto del día a día ya superó lo presupuestado para el mes.
 * Nota: `profile.payday` podría usarse para medir de quincena/pago a pago; por ahora usamos el mes calendario.
 * Devuelve undefined si no hay ingreso mensual.
 */
export function monthBalance(p: {
  profile: Pick<Profile, 'monthlyIncome' | 'fixedExpenses' | 'debtItems' | 'monthlyDebtPayments' | 'savingsPct'>
  debts: Debt[]
  txs: Transaction[]
  toMain: ToMain
  convert: (amount: number, code: string) => number
  today?: string
}): MonthBalance | undefined {
  const { profile, txs, toMain } = p
  const income = profile.monthlyIncome
  if (!income) return undefined
  const today = p.today ?? todayStr()
  const fixed = sumItems(profile.fixedExpenses)
  const debts = monthlyDebtTotal(profile, p.debts, p.convert)
  const saving = (income * (profile.savingsPct ?? 0)) / 100
  const budget = income - fixed - debts - saving

  const key = today.slice(0, 7)
  const fixedCats = fixedCategories(profile.fixedExpenses)
  let variableSpent = 0
  let fixedSpent = 0
  let debtPaid = 0
  let incomeReceived = 0
  for (const t of txs) {
    if (!t.date.startsWith(key) || t.date > today) continue
    const v = toMain(t.amount, t.accountId)
    if (t.type === 'gasto') {
      if (t.categoryId && fixedCats.has(t.categoryId)) fixedSpent += v
      else variableSpent += v
    } else if (t.type === 'pago_deuda') debtPaid += v
    else if (t.type === 'ingreso') incomeReceived += v
  }

  const d = parseDate(today)
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const day = d.getDate()
  const daysLeft = daysInMonth - day + 1
  const remaining = budget - variableSpent
  const expectedByToday = Math.max(0, budget) * (day / daysInMonth)
  const status: MonthStatus = remaining < 0 ? 'rojo' : variableSpent > expectedByToday + 0.005 ? 'amarillo' : 'verde'
  return {
    income,
    fixed,
    debts,
    saving,
    budget,
    variableSpent,
    fixedSpent,
    debtPaid,
    incomeReceived,
    remaining,
    daysInMonth,
    day,
    daysLeft,
    expectedByToday,
    perDayLeft: remaining > 0 ? Math.floor(remaining / daysLeft) : 0,
    status,
  }
}
