import type { Debt, Transaction } from './db'
import type { ToMain } from './finance'
import { addDays, parseDate, todayStr, toDateStr } from './format'
import { dueDateIn } from './debts'

/**
 * Puntaje de salud financiera (0–100) para el ranking.
 * Se calcula en el dispositivo y SOLO sale de aquí el puntaje y sus partes: nunca montos.
 */

export const PART_MAX = { budget: 30, streak: 25, debts: 25, savings: 20 } as const
export type ScorePart = keyof typeof PART_MAX

export interface ScoreCtx {
  txs: Transaction[]
  debts: Debt[]
  dailyLimit?: number
  /** Categorías de gastos fijos: no cuentan contra el límite diario */
  fixedCats?: Set<string>
  toMain?: ToMain
  /** Racha actual (días) */
  streak: number
  today?: string
}

export interface HealthScore {
  /** 0–100, entero */
  score: number
  /** Puntos de cada parte (budget 0–30, streak 0–25, debts 0–25, savings 0–20), con un decimal */
  parts: Record<ScorePart, number>
  /** Pistas para los consejos (sin montos) */
  flags: { noLimit: boolean; noIncome: boolean; noActiveDebts: boolean }
}

const identity: ToMain = (a) => a
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const EPS = 0.005
/** Tasa de ahorro con la que se gana la parte completa */
export const SAVINGS_TARGET = 0.2
const WINDOW = 30

export function healthScore(ctx: ScoreCtx): HealthScore {
  const today = ctx.today ?? todayStr()
  const toMain = ctx.toMain ?? identity
  const from = addDays(today, -(WINDOW - 1))
  const recent = ctx.txs.filter((t) => t.date >= from && t.date <= today)

  // 1. Presupuesto: días con movimientos en que el gasto del día a día quedó dentro del límite
  let budget: number
  if (!ctx.dailyLimit || ctx.dailyLimit <= 0) budget = 0.5
  else {
    const days = new Map<string, number>()
    for (const t of recent) {
      if (t.type === 'ajuste') continue
      const spent = days.get(t.date) ?? 0
      const counts = t.type === 'gasto' && !(t.categoryId && ctx.fixedCats?.has(t.categoryId))
      days.set(t.date, spent + (counts ? toMain(t.amount, t.accountId) : 0))
    }
    const total = days.size
    let good = 0
    for (const s of days.values()) if (s <= ctx.dailyLimit + EPS) good++
    budget = total ? good / total : 0
  }

  // 2. Racha
  const streak = clamp01(Math.min(Math.max(ctx.streak, 0), WINDOW) / WINDOW)

  // 3. Deudas: meses (máx. los últimos 3) con la cuota completa pagada a tiempo
  const active = ctx.debts.filter((d) => d.balance > EPS)
  let debts = 1
  if (active.length) {
    let evaluated = 0
    let onTime = 0
    for (const d of active) {
      const r = debtMonths(d, ctx.txs, today)
      evaluated += r.evaluated
      onTime += r.onTime
    }
    debts = evaluated ? onTime / evaluated : 1
  }

  // 4. Ahorro: (ingresos − gastos − pagos de deuda) ÷ ingresos en los últimos 30 días
  let income = 0
  let out = 0
  for (const t of recent) {
    if (t.type === 'ingreso') income += toMain(t.amount, t.accountId)
    else if (t.type === 'gasto' || t.type === 'pago_deuda') out += toMain(t.amount, t.accountId)
  }
  const savings = income > EPS ? clamp01((income - out) / income / SAVINGS_TARGET) : 0

  const raw = {
    budget: clamp01(budget) * PART_MAX.budget,
    streak: streak * PART_MAX.streak,
    debts: clamp01(debts) * PART_MAX.debts,
    savings: savings * PART_MAX.savings,
  }
  const total = raw.budget + raw.streak + raw.debts + raw.savings
  const r1 = (n: number) => Math.round(n * 10) / 10
  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    parts: { budget: r1(raw.budget), streak: r1(raw.streak), debts: r1(raw.debts), savings: r1(raw.savings) },
    flags: { noLimit: !ctx.dailyLimit || ctx.dailyLimit <= 0, noIncome: income <= EPS, noActiveDebts: active.length === 0 },
  }
}

/**
 * Para una deuda activa revisa hasta 3 meses (desde su creación hasta hoy).
 * Un mes cuenta si su fecha de vencimiento ya pasó (o la cuota ya está pagada) y la deuda existía
 * antes de esa fecha. Es "a tiempo" si lo abonado ese mes hasta el vencimiento cubre la cuota.
 */
function debtMonths(debt: Debt, txs: Transaction[], today: string) {
  const pays = txs.filter((t) => t.type === 'pago_deuda' && t.debtId === debt.id)
  const created = toDateStr(new Date(debt.createdAt))
  const t = parseDate(today)
  let evaluated = 0
  let onTime = 0
  for (let back = 0; back < 3; back++) {
    const y = t.getFullYear()
    const m = t.getMonth() - back
    const monthStart = toDateStr(new Date(y, m, 1))
    const key = monthStart.slice(0, 7)
    if (key < created.slice(0, 7)) break
    const due = dueDateIn(debt.dueDay, y, m)
    if (created > due) continue // creada después del vencimiento de ese mes
    // Saldo aproximado al empezar el mes = saldo actual + lo abonado desde entonces (sin intereses)
    const since = pays.filter((p) => p.date >= monthStart).reduce((s, p) => s + p.amount, 0)
    const cuota = Math.min(debt.monthlyPayment, debt.balance + since)
    const paidByDue = pays.filter((p) => p.date.startsWith(key) && p.date <= due).reduce((s, p) => s + p.amount, 0)
    const paid = paidByDue >= cuota - EPS
    if (due > today && !paid) continue // aún no vence: no penaliza
    evaluated++
    if (paid) onTime++
  }
  return { evaluated, onTime }
}

// ---------------------------------------------------------------------------
// Ligas y semana ISO
// ---------------------------------------------------------------------------

export type LeagueId = 'bronce' | 'plata' | 'oro' | 'diamante'
export interface League {
  id: LeagueId
  name: string
  emoji: string
  min: number
  /** Inclusivo */
  max: number
}
export const LEAGUES: League[] = [
  { id: 'bronce', name: 'Bronce', emoji: '🥉', min: 0, max: 39 },
  { id: 'plata', name: 'Plata', emoji: '🥈', min: 40, max: 59 },
  { id: 'oro', name: 'Oro', emoji: '🥇', min: 60, max: 79 },
  { id: 'diamante', name: 'Diamante', emoji: '💎', min: 80, max: 100 },
]
export const leagueOf = (score: number) => LEAGUES.find((l) => score <= l.max) ?? LEAGUES[LEAGUES.length - 1]

/** Semana ISO 8601 de una fecha YYYY-MM-DD, p. ej. "2026-W46". */
export function isoWeek(date = todayStr()) {
  const d = parseDate(date)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dow) // jueves de esa semana
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
