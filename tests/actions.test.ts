/**
 * Pruebas de las acciones que modifican el perfil: cambio de moneda principal y escrituras concurrentes.
 * Usa IndexedDB en memoria (fake-indexeddb) y la base real de Dexie con su middleware de sincronización.
 * Ejecutar: esbuild tests/actions.test.ts --bundle --platform=node --outfile=actions.test.mjs --format=esm --external:fake-indexeddb && node actions.test.mjs
 */
import 'fake-indexeddb/auto'
import { db, type Profile } from '../src/lib/db'
import {
  addXp,
  applyFreezes,
  changeMainCurrency,
  deleteCustomCategory,
  removeDebtItem,
  saveCustomCategory,
  setRate,
  unlockAchievements,
} from '../src/lib/actions'
import { celebrate, type CelebrateEvent } from '../src/lib/celebrate'
import type { Achievement } from '../src/lib/game'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const near = (a: number | undefined, b: number, tol = 1e-9) => a !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

const events: CelebrateEvent[] = []
celebrate.on((e) => events.push(e))

let n = 0
async function newProfile(extra: Partial<Profile> = {}) {
  const userId = `u${++n}`
  await db.profiles.put({ userId, name: 'Prueba', avatar: 0, xp: 0, currency: 'COP', onboarded: true, ...extra })
  events.length = 0
  return userId
}
const get = async (id: string) => (await db.profiles.get(id))!

async function main() {
  // --- Cambio de moneda principal ----------------------------------------------------------
  {
    const id = await newProfile({
      xp: 777,
      rates: { USD: 4000, EUR: 4400 },
      monthlyIncome: 4_000_000,
      monthlyDebtPayments: 800_000,
      dailyLimit: 40_000,
      savingsPct: 10,
      payday: 15,
      debtItems: [{ id: 'd1', name: 'Tarjeta', emoji: '💳', amount: 800_000 }],
      fixedExpenses: [
        { id: 'f1', name: 'Arriendo', emoji: '🏠', amount: 400_000, categoryId: 'vivienda' },
        { id: 'f2', name: 'Internet', emoji: '📶', amount: 123_457 },
      ],
      debtPlan: { strategy: 'bola', extra: 200_000 },
      customCategories: [{ id: 'c_x', name: 'Gatos', emoji: '🐱', color: '#f00', kind: 'gasto' }],
    })
    await changeMainCurrency(id, 'USD')
    const p = await get(id)
    ok(p.currency === 'USD', 'COP→USD: la moneda principal pasa a USD')
    ok(near(p.rates?.COP, 1 / 4000) && near(p.rates?.EUR, 1.1) && p.rates?.USD === undefined, 'COP→USD: tasas re-expresadas (COP=1/4000, EUR=1.1, sin USD)')
    ok(p.monthlyIncome === 1000 && p.dailyLimit === 10 && p.monthlyDebtPayments === 200, 'COP→USD: ingreso, límite y suma de cuotas convertidos')
    ok(p.fixedExpenses?.[0].amount === 100 && p.fixedExpenses?.[1].amount === 30.86, 'COP→USD: gastos fijos convertidos y redondeados a 2 decimales (400000→100, 123457→30.86)')
    ok(p.fixedExpenses?.[0].categoryId === 'vivienda' && p.fixedExpenses?.[1].name === 'Internet', 'COP→USD: los gastos fijos conservan nombre y categoría')
    ok(p.debtItems?.[0].amount === 200 && p.debtItems?.[0].name === 'Tarjeta', 'COP→USD: cuotas declaradas convertidas (800000→200)')
    ok(p.debtPlan?.extra === 50 && p.debtPlan?.strategy === 'bola', 'COP→USD: pago extra del plan convertido (200000→50) y estrategia intacta')
    ok(p.savingsPct === 10 && p.payday === 15 && p.xp === 777 && p.customCategories?.length === 1, 'COP→USD: porcentaje, día de pago, XP y categorías no se tocan')

    // Y de vuelta: queda igual que al principio
    await changeMainCurrency(id, 'COP')
    const b = await get(id)
    ok(b.currency === 'COP' && near(b.rates?.USD, 4000) && near(b.rates?.EUR, 4400), 'USD→COP: las tasas vuelven a las originales')
    ok(b.fixedExpenses?.[0].amount === 400_000 && b.debtItems?.[0].amount === 800_000 && b.debtPlan?.extra === 200_000, 'USD→COP: montos de vuelta a los originales')
  }
  {
    const id = await newProfile({ rates: { USD: 4000 }, monthlyIncome: 8000 })
    await changeMainCurrency(id, 'USD')
    const p = await get(id)
    ok(p.monthlyIncome === 2 && !('fixedExpenses' in p) && !('debtItems' in p) && !('debtPlan' in p), 'Sin listas ni plan: no se crean campos vacíos')
    await changeMainCurrency(id, 'EUR')
    ok((await get(id)).currency === 'USD', 'Moneda sin tasa: no cambia nada')
  }

  // --- Escrituras concurrentes -------------------------------------------------------------
  {
    const id = await newProfile({ xp: 0, freezes: 2 })
    await Promise.all([addXp(id, 10), addXp(id, 20), applyFreezes(id, ['2026-11-10'], 3)])
    const p = await get(id)
    ok(p.xp === 30, `Concurrencia: dos addXp suman ambos (xp=${p.xp}, esperado 30)`)
    ok(p.freezes === 1 && p.frozenDays?.join() === '2026-11-10', `Concurrencia: el congelador gastado no revive (freezes=${p.freezes}, esperado 1)`)
  }
  {
    const id = await newProfile({ xp: 0, freezes: 2 })
    await Promise.all([applyFreezes(id, ['2026-11-10'], 3), addXp(id, 10), addXp(id, 20)])
    const p = await get(id)
    ok(p.xp === 30 && p.freezes === 1, `Concurrencia (otro orden): xp=${p.xp} freezes=${p.freezes}, esperado 30/1`)
  }
  {
    const id = await newProfile({ xp: 0 })
    await Promise.all(Array.from({ length: 20 }, () => addXp(id, 5)))
    ok((await get(id)).xp === 100, '20 addXp en paralelo: ninguno se pierde (xp=100)')
  }
  {
    const id = await newProfile({ freezes: 3 })
    await Promise.all([applyFreezes(id, ['2026-11-09'], 2), applyFreezes(id, ['2026-11-09'], 2)])
    const p = await get(id)
    ok(p.freezes === 2 && p.frozenDays?.length === 1, `El mismo día salvado dos veces a la vez gasta un solo congelador (freezes=${p.freezes})`)
    ok(events.filter((e) => e.kind === 'freeze').length === 1, 'Y se celebra una sola vez')
  }
  {
    const id = await newProfile({ freezes: 0 })
    await applyFreezes(id, ['2026-11-01'], 1)
    ok((await get(id)).frozenDays === undefined && events.length === 0, 'Sin congeladores no se salva nada')
  }

  // --- Subir de nivel regala un congelador ------------------------------------------------
  {
    const id = await newProfile({ xp: 90, freezes: 0 })
    await addXp(id, 20, 'Prueba')
    const p = await get(id)
    ok(p.xp === 110 && p.freezes === 1, `Subir a nivel 2 regala un congelador (freezes=${p.freezes})`)
    const lv = events.find((e) => e.kind === 'levelup')
    ok(lv?.kind === 'levelup' && lv.level === 2 && lv.gotFreeze === true, 'Se celebra el nivel 2 con congelador')
    ok(events[0]?.kind === 'xp' && events[1]?.kind === 'levelup', 'Orden: primero el XP, luego el nivel')
  }
  {
    const id = await newProfile({ xp: 90, freezes: 1 })
    await Promise.all([addXp(id, 20), applyFreezes(id, ['2026-11-11'], 4)])
    const p = await get(id)
    ok(p.xp === 110 && p.freezes === 1, `Subir de nivel mientras se gasta un congelador: 1 + 1 − 1 = 1 (freezes=${p.freezes})`)
  }
  {
    const id = await newProfile({ xp: 90, freezes: 3 })
    await addXp(id, 20)
    const lv = events.find((e) => e.kind === 'levelup')
    ok((await get(id)).freezes === 3 && lv?.kind === 'levelup' && lv.gotFreeze === false, 'Con el máximo de congeladores no se pasa de 3 ni se anuncia regalo')
  }
  {
    const id = await newProfile({ xp: 0 })
    await addXp(id, 300) // nivel 1 → 3 (100 + 200)
    const p = await get(id)
    ok(p.freezes === 3, `Saltar dos niveles regala dos congeladores (1 de bienvenida + 2 = ${p.freezes})`)
  }
  {
    const id = await newProfile({ xp: 5, freezes: 2 })
    await addXp(id, 5)
    ok((await get(id)).freezes === 2, 'Sin subir de nivel los congeladores no cambian')
  }

  // --- Logros ----------------------------------------------------------------------------
  {
    const id = await newProfile({ xp: 0 })
    const a = { id: 'first', emoji: '⭐', name: 'Primero', xp: 25 } as unknown as Achievement
    await Promise.all([unlockAchievements(id, [a]), unlockAchievements(id, [a])])
    const p = await get(id)
    ok(p.xp === 25 && !!p.achievements?.first, `Un logro desbloqueado dos veces a la vez da su XP una sola vez (xp=${p.xp})`)
    ok(events.filter((e) => e.kind === 'achievement').length === 1, 'Y se celebra una sola vez')
  }

  // --- Tasas y categorías propias ----------------------------------------------------------
  {
    const id = await newProfile({ rates: { EUR: 4400 } })
    await Promise.all([
      setRate(id, 'USD', 4000),
      saveCustomCategory(id, { id: 'c_a', name: 'A', emoji: '🅰️', color: '#000', kind: 'gasto' }),
      saveCustomCategory(id, { id: 'c_b', name: 'B', emoji: '🅱️', color: '#000', kind: 'ingreso' }),
      setRate(id, 'QAR', 1100),
    ])
    const p = await get(id)
    ok(p.rates?.USD === 4000 && p.rates?.QAR === 1100 && p.rates?.EUR === 4400, 'Dos setRate en paralelo: se guardan ambas tasas')
    ok(p.customCategories?.map((c) => c.id).sort().join() === 'c_a,c_b', 'Dos categorías propias en paralelo: se guardan ambas')
    await Promise.all([deleteCustomCategory(id, 'c_a'), setRate(id, 'USD', undefined)])
    const q = await get(id)
    ok(q.customCategories?.map((c) => c.id).join() === 'c_b' && q.rates?.USD === undefined && q.rates?.QAR === 1100, 'Borrar categoría y tasa a la vez: se aplican ambos')
  }
  {
    const id = await newProfile({
      debtItems: [
        { id: 'a', name: 'A', emoji: '💳', amount: 100 },
        { id: 'b', name: 'B', emoji: '🏦', amount: 50 },
      ],
      monthlyDebtPayments: 150,
    })
    await Promise.all([removeDebtItem(id, 'a'), removeDebtItem(id, 'b')])
    const p = await get(id)
    ok(p.debtItems?.length === 0 && p.monthlyDebtPayments === 0, 'Quitar dos cuotas a la vez: se quitan ambas y la suma queda en 0')
  }

  // --- Integración con la cola de sincronización y transacciones anidadas ------------------
  {
    const id = await newProfile({ xp: 0 })
    db.syncUserId = id
    const before = await db.outbox.count()
    await Promise.all([addXp(id, 5), applyFreezes(id, ['2026-11-12'], 1)])
    const entries = await db.outbox.where('userId').equals(id).toArray()
    ok(entries.length === (await db.outbox.count()) - before && entries.length === 2, `Con sincronización: cada escritura queda en la cola (entradas=${entries.length})`)
    ok(entries.every((e) => e.kind === 'profile' && e.id === id && !e.deleted), 'Las entradas de la cola son del perfil correcto')
    db.syncUserId = null
  }
  {
    const id = await newProfile({ xp: 0 })
    db.syncUserId = id
    await db.transaction('rw', db.profiles, async () => {
      await addXp(id, 7)
      await setRate(id, 'USD', 4000)
    })
    const p = await get(id)
    ok(p.xp === 7 && p.rates?.USD === 4000, 'Dentro de una transacción ya abierta (con la cola activa) las acciones funcionan')
    db.syncUserId = null
  }
  {
    // La celebración se emite cuando el cambio ya está guardado
    const id = await newProfile({ xp: 0 })
    let seen: number | undefined
    const off = celebrate.on((e) => {
      if (e.kind === 'xp') void db.profiles.get(id).then((p) => (seen = p?.xp))
    })
    await addXp(id, 9)
    await new Promise((r) => setTimeout(r, 20))
    off()
    ok(seen === 9, 'La celebración de XP llega cuando el XP ya está en la base')
  }
  {
    events.length = 0
    await addXp('no-existe', 10)
    ok(events.length === 0, 'Perfil inexistente: no se escribe ni se celebra nada')
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
