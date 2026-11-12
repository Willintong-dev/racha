import type { Debt, DebtStrategy, Transaction } from './db'
import { parseDate, toDateStr, todayStr } from './format'

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/** Fecha de vencimiento de la cuota en un mes dado (día 31 en febrero → 28/29). */
export function dueDateIn(dueDay: number, year: number, month: number) {
  return toDateStr(new Date(year, month, Math.min(dueDay, daysInMonth(year, month))))
}

/** Cuánto se ha abonado a una deuda en el mes de `date` (YYYY-MM-DD). */
export function paidInMonth(debtId: string, txs: Transaction[], date = todayStr()) {
  const key = date.slice(0, 7)
  let s = 0
  for (const t of txs) if (t.type === 'pago_deuda' && t.debtId === debtId && t.date.startsWith(key)) s += t.amount
  return s
}

export interface DueInfo {
  /** Próxima fecha de pago pendiente */
  dueDate: string
  /** Días hasta esa fecha (negativo = vencida) */
  daysLeft: number
  paidThisMonth: boolean
  overdue: boolean
  /** Lo que falta para completar la cuota de este mes */
  remainingThisMonth: number
}

export function dueInfo(debt: Debt, txs: Transaction[], today = todayStr()): DueInfo {
  const t = parseDate(today)
  const paid = paidInMonth(debt.id, txs, today)
  const cuota = Math.min(debt.monthlyPayment, debt.balance + paid)
  const paidThisMonth = debt.balance <= 0 || paid >= cuota - 0.005
  const dueThisMonth = dueDateIn(debt.dueDay, t.getFullYear(), t.getMonth())
  const dueDate = paidThisMonth ? dueDateIn(debt.dueDay, t.getFullYear(), t.getMonth() + 1) : dueThisMonth
  const daysLeft = Math.round((parseDate(dueDate).getTime() - t.getTime()) / 86_400_000)
  return {
    dueDate,
    daysLeft,
    paidThisMonth,
    overdue: !paidThisMonth && daysLeft < 0,
    remainingThisMonth: paidThisMonth ? 0 : Math.max(0, Math.min(debt.monthlyPayment - paid, debt.balance)),
  }
}

export function dueLabel(info: DueInfo) {
  if (info.paidThisMonth) return 'Cuota del mes pagada ✓'
  if (info.overdue) return `Vencida hace ${-info.daysLeft} ${-info.daysLeft === 1 ? 'día' : 'días'}`
  if (info.daysLeft === 0) return 'Vence hoy'
  if (info.daysLeft === 1) return 'Vence mañana'
  return `Vence en ${info.daysLeft} días`
}

// ---------------------------------------------------------------------------
// Simulador
// ---------------------------------------------------------------------------

export interface SimDebt {
  id: string
  /** En moneda principal */
  balance: number
  payment: number
  /** % anual */
  rate: number
}

export interface SimResult {
  /** Meses hasta quedar libre (Infinity si las cuotas no alcanzan a cubrir los intereses) */
  months: number
  totalInterest: number
  totalPaid: number
  /** Mes (1 = el próximo) en que se liquida cada deuda */
  payoffMonth: Map<string, number>
  /** Ids en el orden en que se liquidan */
  order: string[]
  feasible: boolean
}

const MAX_MONTHS = 600

/** Orden de ataque: Avalancha = mayor interés primero. Bola de nieve = menor saldo primero. */
export function attackOrder<T extends { balance: number; rate: number }>(debts: T[], strategy: DebtStrategy) {
  return [...debts].sort((a, b) =>
    strategy === 'avalancha' ? b.rate - a.rate || a.balance - b.balance : a.balance - b.balance || b.rate - a.rate,
  )
}

/**
 * Mes a mes: se cobran intereses, se paga la cuota mínima de cada deuda y el sobrante (pago extra +
 * cuotas de deudas ya liquidadas, si `rollover`) va a la deuda objetivo según la estrategia.
 * Sin `rollover` ni extra = "seguir pagando solo las cuotas", la línea base para comparar.
 */
export function simulate(debts: SimDebt[], extra: number, strategy: DebtStrategy, rollover = true): SimResult {
  const ds = debts.filter((d) => d.balance > 0.005).map((d) => ({ ...d }))
  const payoffMonth = new Map<string, number>()
  let month = 0
  let totalInterest = 0
  let totalPaid = 0

  while (ds.some((d) => d.balance > 0.005) && month < MAX_MONTHS) {
    month++
    let pool = extra
    for (const d of ds) {
      if (d.balance <= 0.005) {
        if (rollover) pool += d.payment
        continue
      }
      const interest = (d.balance * d.rate) / 100 / 12
      d.balance += interest
      totalInterest += interest
      const p = Math.min(d.payment, d.balance)
      d.balance -= p
      totalPaid += p
      if (rollover) pool += d.payment - p
    }
    for (const d of attackOrder(
      ds.filter((x) => x.balance > 0.005),
      strategy,
    )) {
      if (pool <= 0) break
      const p = Math.min(pool, d.balance)
      d.balance -= p
      pool -= p
      totalPaid += p
    }
    for (const d of ds) {
      if (d.balance <= 0.005 && !payoffMonth.has(d.id)) {
        d.balance = 0
        payoffMonth.set(d.id, month)
      }
    }
  }

  const feasible = ds.every((d) => d.balance <= 0.005)
  return {
    months: feasible ? month : Infinity,
    totalInterest,
    totalPaid,
    payoffMonth,
    order: [...payoffMonth.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
    feasible,
  }
}

/** "marzo 2028" a partir de dentro de N meses */
export function monthsFromNow(n: number, from = todayStr()) {
  const d = parseDate(from)
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const s = target.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function durationLabel(months: number) {
  if (!Number.isFinite(months)) return 'nunca (las cuotas no cubren los intereses)'
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = []
  if (y) parts.push(`${y} ${y === 1 ? 'año' : 'años'}`)
  if (m || !y) parts.push(`${m} ${m === 1 ? 'mes' : 'meses'}`)
  return parts.join(' y ')
}

export const shortDate = (s: string) => parseDate(s).toLocaleDateString('es', { day: 'numeric', month: 'short' })

/** Deudas activas expresadas en moneda principal para el simulador (las que no tienen tasa de cambio se omiten). */
export function toSimDebts(debts: Debt[], convert: (amount: number, code: string) => number): SimDebt[] {
  const out: SimDebt[] = []
  for (const d of debts) {
    if (d.balance <= 0) continue
    const k = convert(1, d.currency)
    if (!k) continue
    out.push({ id: d.id, balance: d.balance * k, payment: d.monthlyPayment * k, rate: d.annualRate ?? 0 })
  }
  return out
}

export interface ExtraRecommendation {
  /** Pago extra mensual recomendado (moneda principal), 0 si no sobra nada */
  amount: number
  /** Ingreso − cuotas − fijos − ahorro */
  free: number
  /** Lo reservado para el día a día (límite × 30, o el 80% de lo libre si no hay límite) */
  dayToDay: number
  basis: 'limite' | 'sin-limite'
  saving: number
}

/**
 * Cuánto puedes poner extra a tus deudas sin tocar tu presupuesto:
 * ingreso − cuotas − gastos fijos − ahorro − día a día.
 * Sin límite diario reservamos el 80% de lo libre para el día a día y recomendamos el 20%.
 */
export function recommendExtra(p: {
  income?: number
  debtsMonthly: number
  fixed: number
  savingsPct?: number
  dailyLimit?: number
}): ExtraRecommendation | undefined {
  if (!p.income) return undefined
  const saving = (p.income * (p.savingsPct ?? 0)) / 100
  const free = p.income - p.debtsMonthly - p.fixed - saving
  if (p.dailyLimit) {
    const dayToDay = p.dailyLimit * 30
    return { amount: Math.max(0, Math.floor(free - dayToDay)), free, dayToDay, basis: 'limite', saving }
  }
  const dayToDay = Math.max(0, free * 0.8)
  return { amount: Math.max(0, Math.floor(free - dayToDay)), free, dayToDay, basis: 'sin-limite', saving }
}
