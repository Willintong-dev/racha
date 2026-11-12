import type { Account, MonthlyItem, Transaction } from './db'
import { addDays, todayStr } from './format'

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
 */
export function computeStreak(txs: Transaction[], dailyLimit?: number, toMain: ToMain = identity, exclude?: Set<string>) {
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

  const today = todayStr()
  let current = 0
  let day = today
  const todayInfo = byDay.get(today)
  if (todayInfo && !isGood(today)) {
    current = 0 // hoy te pasaste del límite
  } else {
    if (!isGood(today)) day = addDays(today, -1)
    while (goodDays.has(day)) {
      current++
      day = addDays(day, -1)
    }
  }

  let best = 0
  let run = 0
  let prev = ''
  for (const d of [...goodDays].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best: Math.max(best, current), goodDays, todayDone: isGood(today) }
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
