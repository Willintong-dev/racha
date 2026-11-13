/**
 * Pruebas del balance del mes.
 * Ejecutar: esbuild tests/month.test.ts --bundle --platform=node --outfile=month.test.mjs --format=esm && node month.test.mjs
 */
import type { Account, Debt, Transaction } from '../src/lib/db'
import { makeToMain, monthBalance, rateOf } from '../src/lib/finance'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const near = (a: number | undefined, b: number, tol = 0.01) => a !== undefined && Math.abs(a - b) < tol

let n = 0
const tx = (type: Transaction['type'], amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: 't' + n++,
  userId: 'u',
  type,
  amount,
  accountId: 'cop',
  date,
  createdAt: n,
  ...extra,
})
const acc = (id: string, currency: string): Account => ({
  id, userId: 'u', name: id, type: 'banco', initialBalance: 0, isPrimary: id === 'cop', currency, color: '#000', archived: false, createdAt: 0,
})
const accounts = [acc('cop', 'COP'), acc('usd', 'USD')]
const rates = { USD: 4000 }
const toMain = makeToMain(accounts, 'COP', rates)
const convert = (a: number, code: string) => {
  const r = rateOf(code, 'COP', rates)
  return r ? a * r : 0
}
const debt = (monthlyPayment: number, currency = 'COP', balance = 1000000): Debt => ({
  id: 'd' + n++, userId: 'u', name: 'Tarjeta', emoji: '💳', currency, originalBalance: balance, balance, monthlyPayment,
  dueDay: 15, payFromAccountId: 'cop', createdAt: 0,
})

// Noviembre 2026: 30 días. Hoy = 15 → ritmo esperado = mitad del presupuesto.
const T = '2026-11-15'
const profile = {
  monthlyIncome: 3_000_000,
  savingsPct: 10,
  fixedExpenses: [{ id: 'f1', name: 'Arriendo', emoji: '🔑', amount: 1_000_000, categoryId: 'arriendo' }],
  debtItems: [{ id: 'i1', name: 'Celular', emoji: '📱', amount: 100_000 }],
}
const debts = [debt(200_000)]
// presupuesto = 3.000.000 − 1.000.000 − (200.000 + 100.000) − 300.000 = 1.400.000
const run = (txs: Transaction[], extra: Partial<typeof profile> = {}, today = T, ds = debts) =>
  monthBalance({ profile: { ...profile, ...extra }, debts: ds, txs, toMain, convert, today })

// --- Presupuesto y verde ---
let b = run([tx('gasto', 300_000, '2026-11-03', { categoryId: 'comida' }), tx('gasto', 200_000, '2026-11-10')])!
ok(near(b.budget, 1_400_000), `presupuesto día a día = 1.400.000 (${b.budget})`)
ok(near(b.debts, 300_000) && near(b.saving, 300_000) && near(b.fixed, 1_000_000), 'desglose: fijos, cuotas (deudas + onboarding), ahorro')
ok(near(b.variableSpent, 500_000), `gastado del día a día = 500.000 (${b.variableSpent})`)
ok(near(b.remaining, 900_000), 'te quedan 900.000')
ok(near(b.expectedByToday, 700_000), `ritmo esperado al día 15 = 700.000 (${b.expectedByToday})`)
ok(b.status === 'verde', `por debajo del ritmo → verde (${b.status})`)
ok(b.daysInMonth === 30 && b.day === 15 && b.daysLeft === 16, `días: ${b.day}/${b.daysInMonth}, quedan ${b.daysLeft} (contando hoy)`)
ok(b.perDayLeft === Math.floor(900_000 / 16), `puedes gastar ${b.perDayLeft}/día`)

// --- Amarillo ---
b = run([tx('gasto', 900_000, '2026-11-05')])!
ok(b.status === 'amarillo' && near(b.remaining, 500_000), `sobre el ritmo pero con saldo → amarillo (${b.status}, ${b.remaining})`)

// --- Rojo ---
b = run([tx('gasto', 900_000, '2026-11-05'), tx('gasto', 600_000, '2026-11-14')])!
ok(b.status === 'rojo' && near(b.remaining, -100_000), `pasado del presupuesto → rojo, te pasaste por 100.000 (${b.remaining})`)
ok(b.perDayLeft === 0, 'en rojo no hay gasto diario disponible')

// --- Exclusiones ---
b = run([
  tx('gasto', 1_000_000, '2026-11-01', { categoryId: 'arriendo' }),
  tx('gasto', 50_000, '2026-11-02', { categoryId: 'comida' }),
  tx('pago_deuda', 200_000, '2026-11-15', { debtId: 'x' }),
  tx('ingreso', 3_000_000, '2026-11-01', { categoryId: 'salario' }),
  tx('transferencia', 500_000, '2026-11-04', { toAccountId: 'usd', toAmount: 125 }),
  tx('ajuste', -80_000, '2026-11-04'),
])!
ok(near(b.variableSpent, 50_000), `categoría de gasto fijo, deudas, transferencias y ajustes no cuentan (${b.variableSpent})`)
ok(near(b.fixedSpent, 1_000_000), 'el arriendo se reporta como gasto fijo pagado')
ok(near(b.debtPaid, 200_000) && near(b.incomeReceived, 3_000_000), 'pagos de deuda e ingreso recibido del mes')
ok(b.status === 'verde', 'el arriendo no te pone en rojo')

// --- Solo este mes y hasta hoy ---
b = run([tx('gasto', 999_999, '2026-10-31'), tx('gasto', 999_999, '2026-12-01'), tx('gasto', 999_999, '2026-11-20'), tx('gasto', 10_000, '2026-11-15')])!
ok(near(b.variableSpent, 10_000), `ignora otros meses y fechas futuras (${b.variableSpent})`)

// --- Multimoneda ---
b = run([tx('gasto', 100, '2026-11-10', { accountId: 'usd' }), tx('gasto', 100_000, '2026-11-10')])!
ok(near(b.variableSpent, 500_000), `100 USD × 4000 + 100.000 COP = 500.000 (${b.variableSpent})`)
b = run([], {}, T, [debt(50, 'USD')])
ok(near(b!.debts, 300_000), `cuota de deuda en USD convertida (50 × 4000 + 100.000) = ${b!.debts}`)
b = run([], {}, T, [debt(200_000, 'COP', 0)])
ok(near(b!.debts, 100_000), 'deudas liquidadas no restan')

// --- Sin ingreso ---
ok(run([], { monthlyIncome: undefined }) === undefined, 'sin ingreso → undefined')
ok(run([], { monthlyIncome: 0 }) === undefined, 'ingreso 0 → undefined')

// --- Bordes ---
b = run([], { fixedExpenses: [{ id: 'f', name: 'x', emoji: 'x', amount: 3_000_000 }] })!
ok(b.budget < 0 && b.status === 'rojo' && b.perDayLeft === 0, 'fijos > ingreso → rojo desde el inicio')
b = run([tx('gasto', 50_000, '2026-02-28')], {}, '2026-02-28')!
ok(b.daysInMonth === 28 && b.daysLeft === 1 && b.perDayLeft === 1_350_000, `último día de febrero: queda 1 día (${b.perDayLeft})`)
b = run([tx('gasto', 1_400_000, '2026-11-30')], {}, '2026-11-30')!
ok(b.status === 'verde' && b.remaining === 0, 'gastar exactamente el presupuesto el último día → verde, te quedan 0')

console.log(failures ? `\n${failures} FALLARON` : '\nTODO OK')
if (failures) process.exitCode = 1
