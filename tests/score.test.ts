/**
 * Pruebas del puntaje de salud financiera.
 * Ejecutar: esbuild tests/score.test.ts --bundle --platform=node --outfile=score.test.mjs --format=esm && node score.test.mjs
 */
import type { Debt, Transaction } from '../src/lib/db'
import { addDays } from '../src/lib/format'
import { healthScore, isoWeek, leagueOf } from '../src/lib/score'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}

const T = '2026-11-12'
let n = 0
const tx = (type: Transaction['type'], amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: 't' + n++,
  userId: 'u',
  type,
  amount,
  accountId: 'a1',
  date,
  createdAt: n,
  ...extra,
})
const debt = (extra: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  userId: 'u',
  name: 'Tarjeta',
  emoji: '💳',
  currency: 'COP',
  originalBalance: 1000,
  balance: 800,
  monthlyPayment: 100,
  dueDay: 10,
  payFromAccountId: 'a1',
  createdAt: new Date(2026, 6, 1).getTime(), // 1 jul 2026
  ...extra,
})

// --- Vacío: sin datos ---
{
  const r = healthScore({ txs: [], debts: [], streak: 0, today: T })
  ok(r.parts.budget === 15, `sin límite → media parte de presupuesto (${r.parts.budget})`)
  ok(r.parts.streak === 0 && r.parts.savings === 0, 'sin racha ni ingresos → 0')
  ok(r.parts.debts === 25, 'sin deudas → parte de deudas completa')
  ok(r.score === 40, `puntaje vacío = 40 (${r.score})`)
  ok(r.flags.noLimit && r.flags.noIncome && r.flags.noActiveDebts, 'flags vacíos')
}

// --- Típico ---
{
  const txs: Transaction[] = [tx('ingreso', 1000, addDays(T, -20))]
  // 10 días con gasto: 8 dentro del límite (50), 2 por encima (80)
  for (let i = 0; i < 10; i++) txs.push(tx('gasto', i < 8 ? 50 : 80, addDays(T, -i)))
  // Un gasto fijo grande que NO cuenta contra el límite pero sí para el ahorro
  txs.push(tx('gasto', 100, addDays(T, -1), { categoryId: 'arriendo' }))
  // Movimiento viejo (fuera de 30 días) no cuenta
  txs.push(tx('gasto', 999, addDays(T, -40)))
  const r = healthScore({ txs, debts: [], dailyLimit: 60, fixedCats: new Set(['arriendo']), streak: 15, today: T })
  // presupuesto: ingreso día -20 cuenta como día con movimiento (gasto 0 ≤ límite) → 9/11
  ok(Math.abs(r.parts.budget - (9 / 11) * 30) < 0.06, `presupuesto 9/11 días (${r.parts.budget})`)
  ok(r.parts.streak === 12.5, `racha 15/30 → 12.5 (${r.parts.streak})`)
  // ahorro: (1000 − (8·50 + 2·80 + 100)) / 1000 = 34% → completo
  ok(r.parts.savings === 20, `ahorro 34% ≥ 20% → 20 (${r.parts.savings})`)
  ok(r.score === Math.round((9 / 11) * 30 + 12.5 + 25 + 20), `puntaje típico ${r.score}`)
}

// --- Ahorro parcial y negativo ---
{
  const a = healthScore({ txs: [tx('ingreso', 1000, T), tx('gasto', 900, T)], debts: [], streak: 0, today: T })
  ok(a.parts.savings === 10, `ahorro 10% → mitad (${a.parts.savings})`)
  const b = healthScore({ txs: [tx('ingreso', 1000, T), tx('gasto', 1500, T)], debts: [], streak: 0, today: T })
  ok(b.parts.savings === 0, 'gastar más de lo ingresado → 0')
  const c = healthScore({ txs: [tx('ingreso', 1000, T), tx('pago_deuda', 850, T, { debtId: 'x' })], debts: [], streak: 0, today: T })
  ok(c.parts.savings === 15, `pagos de deuda restan al ahorro (15%) → 15 (${c.parts.savings})`)
}

// --- Conversión de moneda ---
{
  const toMain = (amt: number, acc: string) => (acc === 'usd' ? amt * 4000 : amt)
  const r = healthScore({
    txs: [tx('gasto', 10, T, { accountId: 'usd' })],
    debts: [],
    dailyLimit: 30_000,
    toMain,
    streak: 0,
    today: T,
  })
  ok(r.parts.budget === 0, 'gasto en USD convertido supera el límite en COP')
}

// --- Límite con 0 días activos ---
{
  const r = healthScore({ txs: [], debts: [], dailyLimit: 100, streak: 0, today: T })
  ok(r.parts.budget === 0 && !r.flags.noLimit, 'con límite pero sin movimientos → 0')
}

// --- Racha topa en 30 ---
ok(healthScore({ txs: [], debts: [], streak: 120, today: T }).parts.streak === 25, 'racha 120 → 25 (máx)')

// --- Deudas ---
{
  // Creada 1 jul, vence el 10. Meses evaluados: sep, oct, nov (nov ya venció el 10, hoy 12).
  const pays = [
    tx('pago_deuda', 100, '2026-09-05', { debtId: 'd1' }), // sep a tiempo
    tx('pago_deuda', 100, '2026-10-15', { debtId: 'd1' }), // oct tarde
    tx('pago_deuda', 60, '2026-11-08', { debtId: 'd1' }), // nov incompleto…
    tx('pago_deuda', 40, '2026-11-09', { debtId: 'd1' }), // …completado a tiempo
  ]
  const r = healthScore({ txs: pays, debts: [debt()], streak: 0, today: T })
  ok(Math.abs(r.parts.debts - (2 / 3) * 25) < 0.06, `2 de 3 meses a tiempo → 16.7 (${r.parts.debts})`)

  // Hoy día 5: noviembre aún no vence y no está pagado → no cuenta
  const r2 = healthScore({ txs: pays.slice(0, 2), debts: [debt()], streak: 0, today: '2026-11-05' })
  ok(r2.parts.debts === 12.5, `nov aún no vence y no cuenta: sep(ok), oct(tarde) → 1/2 (${r2.parts.debts})`)

  // Recién creada después del vencimiento de este mes → aún nada que evaluar → completo
  const nueva = debt({ createdAt: new Date(2026, 10, 11).getTime() })
  ok(healthScore({ txs: [], debts: [nueva], streak: 0, today: T }).parts.debts === 25, 'deuda nueva sin vencimientos → completo')

  // Creada en octubre: solo oct y nov
  const oct = debt({ createdAt: new Date(2026, 9, 1).getTime() })
  const r3 = healthScore({ txs: [tx('pago_deuda', 100, '2026-11-01', { debtId: 'd1' })], debts: [oct], streak: 0, today: T })
  ok(r3.parts.debts === 12.5, `creada en oct: oct sin pagar, nov a tiempo → 1/2 (${r3.parts.debts})`)

  // Saldo (60) menor que la cuota (100): la cuota del mes es el saldo; abonar 40 no alcanza
  const casi = debt({ balance: 20, createdAt: new Date(2026, 10, 1).getTime() })
  const r4 = healthScore({ txs: [tx('pago_deuda', 40, '2026-11-03', { debtId: 'd1' })], debts: [casi], streak: 0, today: T })
  ok(r4.parts.debts === 0, `saldo 60 < cuota, abonó 40 → no completó (${r4.parts.debts})`)
  // Cuota pagada antes del vencimiento (que aún no llega) → cuenta como a tiempo
  const nov = debt({ createdAt: new Date(2026, 10, 1).getTime() })
  const r6 = healthScore({ txs: [tx('pago_deuda', 100, '2026-11-02', { debtId: 'd1' })], debts: [nov], streak: 0, today: '2026-11-05' })
  ok(r6.parts.debts === 25, `cuota pagada antes del vencimiento → completo (${r6.parts.debts})`)
  // Sin pagar y aún no vence → nada evaluado → completo
  ok(healthScore({ txs: [], debts: [nov], streak: 0, today: '2026-11-05' }).parts.debts === 25, 'aún no vence la primera cuota → completo')

  // Todas liquidadas → completo
  const pagada = debt({ balance: 0, paidOffAt: Date.now() })
  ok(healthScore({ txs: [], debts: [pagada], streak: 0, today: T }).parts.debts === 25, 'todas las deudas pagadas → completo')

  // Pago de otra deuda no cuenta
  const r5 = healthScore({ txs: [tx('pago_deuda', 100, '2026-11-03', { debtId: 'otra' })], debts: [oct], streak: 0, today: T })
  ok(r5.parts.debts === 0, 'pagos de otra deuda no cuentan')
}

// --- Máximo ---
{
  const txs = [tx('ingreso', 1000, T), tx('gasto', 10, T)]
  const r = healthScore({ txs, debts: [], dailyLimit: 100, streak: 30, today: T })
  ok(r.score === 100, `todo perfecto → 100 (${r.score})`)
  ok(Number.isInteger(r.score), 'puntaje entero')
}

// --- Nunca expone montos ---
{
  const r = healthScore({ txs: [tx('ingreso', 123456, T)], debts: [], streak: 0, today: T })
  ok(!JSON.stringify(r).includes('123456'), 'el resultado no contiene montos')
}

// --- Ligas ---
ok(leagueOf(0).id === 'bronce' && leagueOf(39).id === 'bronce', 'Bronce < 40')
ok(leagueOf(40).id === 'plata' && leagueOf(59).id === 'plata', 'Plata 40–59')
ok(leagueOf(60).id === 'oro' && leagueOf(79).id === 'oro', 'Oro 60–79')
ok(leagueOf(80).id === 'diamante' && leagueOf(100).id === 'diamante', 'Diamante ≥ 80')

// --- Semana ISO ---
ok(isoWeek('2026-11-12') === '2026-W46', `2026-11-12 → ${isoWeek('2026-11-12')}`)
ok(isoWeek('2026-01-01') === '2026-W01', `2026-01-01 → ${isoWeek('2026-01-01')}`)
ok(isoWeek('2021-01-03') === '2020-W53', `2021-01-03 → ${isoWeek('2021-01-03')}`)
ok(isoWeek('2024-12-30') === '2025-W01', `2024-12-30 → ${isoWeek('2024-12-30')}`)
ok(isoWeek('2026-11-16') === '2026-W47', `lunes 2026-11-16 → ${isoWeek('2026-11-16')}`)

console.log(failures ? `\n${failures} FALLOS` : '\nTODO OK')
if (failures) throw new Error(`${failures} fallos`)
