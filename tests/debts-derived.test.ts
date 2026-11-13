/**
 * Pruebas del saldo de deudas CALCULADO a partir de los pagos (debtBalance / withBalance) y de las acciones
 * que lo usan: pagar, editar o borrar un pago, "Ajustar saldo", deudas viejas sin ancla, XP y celebración.
 * Usa IndexedDB en memoria (fake-indexeddb) y la base real de Dexie.
 * Ejecutar: esbuild tests/debts-derived.test.ts --bundle --platform=node --outfile=debts-derived.test.mjs --format=esm --external:fake-indexeddb && node debts-derived.test.mjs
 */
import 'fake-indexeddb/auto'
import { db, type Debt, type Transaction } from '../src/lib/db'
import { debtBalance, legacyAnchor, withBalance, withBalances } from '../src/lib/debts'
import { createDebt, deleteTransaction, payDebt, restoreTransaction, saveTransaction, updateDebt, XP } from '../src/lib/actions'
import { celebrate, type CelebrateEvent } from '../src/lib/celebrate'
import { todayStr } from '../src/lib/format'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const events: CelebrateEvent[] = []
celebrate.on((e) => events.push(e))

const debt = (extra: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  userId: 'u',
  name: 'Tarjeta',
  emoji: '💳',
  currency: 'COP',
  originalBalance: 1000,
  balance: 1000,
  monthlyPayment: 100,
  dueDay: 15,
  payFromAccountId: 'a1',
  createdAt: 1000,
  ...extra,
})
let k = 0
const pay = (amount: number, createdAt: number, debtId = 'd1', extra: Partial<Transaction> = {}): Transaction => ({
  id: 'p' + ++k,
  userId: 'u',
  type: 'pago_deuda',
  amount,
  accountId: 'a1',
  debtId,
  date: '2026-11-10',
  createdAt,
  ...extra,
})

async function main() {
  // --- Función pura -----------------------------------------------------------------------------
  {
    const d = debt({ balanceAnchor: 1000, anchorAt: 0 })
    const txs = [pay(100, 2000), pay(50.555, 3000), pay(999, 4000, 'otra'), { ...pay(70, 5000), type: 'gasto' as const }]
    ok(debtBalance(d, txs) === 849.45, `ancla 1000 − pagos 100 y 50,555 (solo de esta deuda y solo pago_deuda) = ${debtBalance(d, txs)}`)
    ok(debtBalance(d, [pay(5000, 2000)]) === 0, 'pagar de más no deja saldo negativo')
    const adj = debt({ balanceAnchor: 300, anchorAt: 3000 })
    ok(debtBalance(adj, [pay(100, 2000), pay(50, 3000), pay(20, 3001)]) === 280, 'tras "Ajustar saldo" solo cuentan los pagos posteriores al ancla')
    // Deuda vieja: su balance guardado ya tenía descontados sus pagos
    const legacy = debt({ balance: 700 })
    const old = [pay(200, 2000), pay(100, 3000)]
    ok(debtBalance(legacy, old) === 700, 'deuda vieja sin ancla: mismo saldo que antes (700)')
    const la = legacyAnchor(legacy, old)!
    ok(la.balanceAnchor === 1000 && la.anchorAt === 0, 'legacyAnchor: ancla = 700 + 300 de pagos, contando todos')
    const anchored = { ...legacy, ...la }
    ok(debtBalance(anchored, old) === 700, 'anclada: el mismo saldo (700)')
    ok(debtBalance(anchored, [...old, pay(50, 9000)]) === 650, 'anclada: un pago nuevo la baja')
    ok(debtBalance(anchored, [old[1]]) === 900, 'anclada: borrar un pago viejo devuelve su monto (como hacía la versión anterior)')
    ok(debtBalance(anchored, [...old, pay(50, 500)]) === 650, 'anclada: cuenta un pago aunque su hora sea anterior a la deuda (reloj atrasado de otro teléfono)')
    ok(legacyAnchor(anchored, old) === undefined, 'legacyAnchor no toca una deuda que ya tiene ancla')
    const w = withBalance(debt({ balanceAnchor: 100, anchorAt: 0 }), [pay(100, 7777)])
    ok(w.balance === 0 && w.paidOffAt === 7777, `liquidada: paidOffAt = hora del último pago (${w.paidOffAt})`)
    const w2 = withBalance(debt({ balanceAnchor: 100, anchorAt: 0, paidOffAt: 5 }), [pay(40, 7777)])
    ok(w2.balance === 60 && w2.paidOffAt === undefined, 'con saldo: sin paidOffAt aunque hubiera uno viejo guardado')
    const list = withBalances([debt({ balanceAnchor: 100, anchorAt: 0 }), debt({ id: 'd2', balance: 40 })], [pay(30, 2000), pay(10, 2000, 'd2')])
    ok(list[0].balance === 70 && list[1].balance === 40, 'withBalances calcula cada deuda con sus pagos')
  }

  // --- Acciones contra la base ------------------------------------------------------------------
  const U = 'user-debts'
  await db.profiles.put({ userId: U, name: 'Ana', avatar: 0, xp: 0, currency: 'COP', onboarded: true })
  const fresh = async (id: string) => {
    const raw = (await db.debts.get(id))!
    return withBalance(raw, await db.transactions.where('userId').equals(U).toArray())
  }
  {
    const d = await createDebt(U, { name: 'Moto', emoji: '🏍️', currency: 'COP', balance: 1000, monthlyPayment: 200, dueDay: 15, payFromAccountId: 'a1' })
    ok(d.balanceAnchor === 1000 && d.anchorAt === 0 && d.originalBalance === 1000, 'crear deuda: ancla = saldo inicial')

    await payDebt(await fresh(d.id), 200, 'cuota')
    let f = await fresh(d.id)
    ok(f.balance === 800, `pagar la cuota baja el saldo calculado (${f.balance})`)
    ok((await db.debts.get(d.id))!.balance === 1000, 'el saldo guardado NO se toca al pagar (no hay escritura que dos teléfonos puedan pisar)')
    ok(f.xpCuotaMonth === todayStr().slice(0, 7), 'XP de cuota: se marca el mes como antes')

    // Pagar de más que el saldo: se limita al saldo calculado
    const before = (await db.profiles.get(U))!.xp
    events.length = 0
    await payDebt(f, 5000, 'extra')
    f = await fresh(d.id)
    ok(f.balance === 0 && !!f.paidOffAt, `el abono se limita al saldo (queda en ${f.balance}) y queda liquidada`)
    const pays = (await db.transactions.where('userId').equals(U).toArray()).filter((t) => t.debtId === d.id)
    ok(pays.some((t) => t.amount === 800), 'el pago registrado es de 800 (lo que faltaba)')
    ok(events[0]?.kind === 'payoff', `la celebración de liquidar va primero (${events.map((e) => e.kind).join(',')})`)
    ok(f.xpPayoff === true && (await db.profiles.get(U))!.xp - before >= XP.payoff, 'XP por liquidar y marca xpPayoff')

    // Borrar el último pago → vuelve el saldo; deshacer → se vuelve a descontar, sin XP ni celebración
    const last = pays.find((t) => t.amount === 800)!
    await deleteTransaction(last.id)
    ok((await fresh(d.id)).balance === 800, 'borrar un pago devuelve el saldo')
    const xp1 = (await db.profiles.get(U))!.xp
    events.length = 0
    await restoreTransaction(last)
    ok((await fresh(d.id)).balance === 0 && (await db.profiles.get(U))!.xp === xp1 && events.length === 0, 'deshacer el borrado lo vuelve a descontar sin XP ni celebración')

    // Editar el monto de un pago (antes no se reflejaba en la deuda)
    await saveTransaction({ ...last, amount: 300 }, false)
    ok((await fresh(d.id)).balance === 500, `editar un pago de 800 a 300 → saldo 500 (${(await fresh(d.id)).balance})`)

    // Volver a liquidarla no da otra vez los 500 XP
    const xp2 = (await db.profiles.get(U))!.xp
    events.length = 0
    await payDebt(await fresh(d.id), 500, 'extra')
    const gained = (await db.profiles.get(U))!.xp - xp2
    ok(events.some((e) => e.kind === 'payoff') && gained < XP.payoff, `re-liquidar celebra pero no repite los 500 XP (+${gained})`)
  }
  {
    // Ajustar saldo: ancla nueva; los pagos anteriores ya no cuentan, los siguientes sí
    const d = await createDebt(U, { name: 'Banco', emoji: '🏦', currency: 'COP', balance: 1000, monthlyPayment: 100, dueDay: 5, payFromAccountId: 'a1' })
    await payDebt(await fresh(d.id), 100, 'cuota')
    await sleep(3)
    await updateDebt(d.id, { balance: 1500 })
    let raw = (await db.debts.get(d.id))!
    ok(raw.balanceAnchor === 1500 && raw.anchorAt! > 0 && raw.originalBalance === 1500, 'ajustar a 1500: ancla nueva y el original sube a 1500')
    ok((await fresh(d.id)).balance === 1500, 'tras ajustar, el pago anterior no se vuelve a descontar')
    await sleep(3)
    await payDebt(await fresh(d.id), 100, 'extra')
    ok((await fresh(d.id)).balance === 1400, 'un pago posterior al ajuste sí baja el saldo')
    // Editar solo el nombre (el formulario manda también el saldo, igual al actual): el ancla no cambia
    const anchorAt = (await db.debts.get(d.id))!.anchorAt
    await updateDebt(d.id, { name: 'Banco X', balance: 1400 })
    raw = (await db.debts.get(d.id))!
    ok(raw.name === 'Banco X' && raw.anchorAt === anchorAt && raw.balanceAnchor === 1500, 'editar sin cambiar el saldo no mueve el ancla')
  }
  {
    // Deuda vieja (creada antes de este cambio): mismo saldo, y editarla sin tocar el saldo no la daña
    const id = 'legacy-1'
    await db.debts.put({ ...debt({ id, userId: U, balance: 700, originalBalance: 1000, createdAt: Date.now() - 10_000, paidOffAt: undefined }) })
    await db.transactions.bulkPut([pay(200, Date.now() - 9000, id, { userId: U }), pay(100, Date.now() - 8000, id, { userId: U })])
    ok((await fresh(id)).balance === 700, 'deuda vieja: el saldo calculado es el mismo que tenía guardado (700)')
    await updateDebt(id, { name: 'Vieja', balance: 700 })
    const raw = (await db.debts.get(id))!
    ok(raw.balanceAnchor === undefined && raw.balance === 700 && (await fresh(id)).balance === 700, 'editarla sin cambiar el saldo no le escribe ancla ni toca el saldo guardado')
    await payDebt(await fresh(id), 50, 'extra')
    ok((await fresh(id)).balance === 650, 'deuda vieja: pagar con la versión nueva la baja (650)')
    ok((await db.debts.get(id))!.balanceAnchor === 1000 && (await db.debts.get(id))!.anchorAt === 0, 'al pagarla se le escribió el ancla equivalente (700 + 300 = 1000)')
    const oldPay = (await db.transactions.where('userId').equals(U).toArray()).find((t) => t.debtId === id && t.amount === 200)!
    await deleteTransaction(oldPay.id)
    ok((await fresh(id)).balance === 850, 'borrar un pago viejo devuelve su monto (850)')
    await restoreTransaction(oldPay)
    ok((await fresh(id)).balance === 650, 'deshacer el borrado lo vuelve a descontar (650)')
    // Borrar un pago de una deuda vieja que NO se había anclado: primero se ancla, luego se borra
    const id2 = 'legacy-2'
    await db.debts.put({ ...debt({ id: id2, userId: U, balance: 500, createdAt: Date.now() - 10_000 }) })
    const p2 = pay(250, Date.now() - 9000, id2, { userId: U })
    await db.transactions.put(p2)
    await deleteTransaction(p2.id)
    ok((await fresh(id2)).balance === 750, 'deuda vieja sin anclar: borrar su pago devuelve el monto (750, igual que antes)')
    await sleep(3)
    await updateDebt(id, { balance: 600 })
    ok((await db.debts.get(id))!.balanceAnchor === 600 && (await fresh(id)).balance === 600, 'deuda vieja: "Ajustar saldo" le pone ancla (600)')
  }

  if (failures) {
    console.log(`${failures} FALLARON`)
    process.exit(1)
  }
  console.log('TODO OK')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
