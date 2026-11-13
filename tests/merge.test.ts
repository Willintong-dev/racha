/**
 * Pruebas de la mezcla de tres vías del perfil (mergeProfile, función pura).
 * Ejecutar: esbuild tests/merge.test.ts --bundle --platform=node --outfile=merge.test.mjs --format=esm && node merge.test.mjs
 */
import type { CustomCategory, Profile } from '../src/lib/db'
import { mergeById, mergeProfile } from '../src/lib/merge'

let failures = 0
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) failures++
}
const J = (v: unknown) => JSON.stringify(v)

const base: Profile = {
  userId: 'u',
  name: 'Ana',
  avatar: 1,
  xp: 100,
  currency: 'COP',
  rates: { USD: 4000, EUR: 4400 },
  monthlyIncome: 4_000_000,
  dailyLimit: 50_000,
  payday: 15,
  freezes: 1,
  frozenDays: ['2026-11-01'],
  achievements: { primer_paso: 10 },
  customCategories: [
    { id: 'c1', name: 'Gatos', emoji: '🐱', color: '#f00', kind: 'gasto' },
    { id: 'c2', name: 'Plantas', emoji: '🌱', color: '#0f0', kind: 'gasto' },
  ],
  fixedExpenses: [{ id: 'f1', name: 'Arriendo', emoji: '🏠', amount: 1_000_000 }],
  debtItems: [{ id: 'd1', name: 'Celular', emoji: '📱', amount: 100_000 }],
  monthlyDebtPayments: 100_000,
  onboarded: true,
}
const edit = (p: Partial<Profile>): Profile => ({ ...structuredClone(base), ...p })
const cat = (id: string, name: string): CustomCategory => ({ id, name, emoji: '⭐', color: '#000', kind: 'gasto' })

// --- XP y congeladores --------------------------------------------------------------------------
{
  const m = mergeProfile(base, edit({ xp: 150 }), edit({ xp: 130 }))
  ok(m.xp === 180, `XP: 100 + 50 (aquí) + 30 (allá) = ${m.xp}`)
  ok(mergeProfile(base, edit({ xp: 150 }), base).xp === 150 && mergeProfile(base, base, edit({ xp: 130 })).xp === 130, 'XP: si solo un lado cambió, ese lado')
  ok(mergeProfile(undefined, edit({ xp: 150 }), edit({ xp: 130 })).xp === 150, 'XP sin base: el mayor (nunca se suma dos veces)')
  ok(mergeProfile(base, edit({ xp: 0 }), edit({ xp: 0 })).xp === 0, 'XP nunca negativo')
  const f = mergeProfile(base, edit({ freezes: 0 }), edit({ freezes: 3 }))
  ok(f.freezes === 2, `congeladores: 1 − 1 + 2 = ${f.freezes}`)
  ok(mergeProfile(base, edit({ freezes: 3 }), edit({ freezes: 3 })).freezes === 3, 'congeladores: tope FREEZE_MAX (3)')
  ok(mergeProfile(base, edit({ freezes: 0 }), edit({ freezes: 0 })).freezes === 0, 'congeladores: nunca negativos')
  const nb = edit({})
  delete nb.freezes
  ok(mergeProfile(nb, edit({ freezes: 2 }), nb).freezes === 2 && mergeProfile(nb, nb, nb).freezes === undefined, 'congeladores: undefined vale 1 y no se inventa el campo')
}

// --- Logros ---------------------------------------------------------------------------------------
{
  const l = edit({ xp: 100 + 25, achievements: { primer_paso: 10, racha_3: 500 } })
  const r = edit({ xp: 100 + 25, achievements: { primer_paso: 10, cuentas_2: 600 } })
  const m = mergeProfile(base, l, r)
  ok(J(Object.keys(m.achievements!).sort()) === J(['cuentas_2', 'primer_paso', 'racha_3']), 'logros distintos en cada lado: unión')
  ok(m.xp === 150, `logros distintos: XP de ambos (${m.xp})`)
  const both = mergeProfile(base, edit({ xp: 125, achievements: { primer_paso: 10, racha_3: 700 } }), edit({ xp: 125, achievements: { primer_paso: 10, racha_3: 500 } }))
  ok(both.xp === 125, `mismo logro desbloqueado en los dos lados: su XP (25) cuenta una sola vez (${both.xp})`)
  ok(both.achievements!.racha_3 === 500, 'mismo logro: queda la fecha más temprana')
  const both2 = mergeProfile(base, edit({ xp: 135, achievements: { primer_paso: 10, racha_3: 700 } }), edit({ xp: 125, achievements: { primer_paso: 10, racha_3: 500 } }))
  ok(both2.xp === 135, `mismo logro + 10 XP más aquí: 100 + 35 + 25 − 25 = ${both2.xp}`)
  const days = mergeProfile(base, edit({ frozenDays: ['2026-11-01', '2026-11-05'] }), edit({ frozenDays: ['2026-11-03', '2026-11-01'] }))
  ok(J(days.frozenDays) === J(['2026-11-01', '2026-11-03', '2026-11-05']), 'días congelados: unión ordenada sin repetidos')
}

// --- Listas por id ------------------------------------------------------------------------------
{
  const l = edit({ customCategories: [base.customCategories![1]] }) // borró c1
  const r = edit({ customCategories: [...base.customCategories!, cat('c3', 'Viajes')] }) // agregó c3
  const m = mergeProfile(base, l, r)
  ok(J(m.customCategories!.map((c) => c.id)) === J(['c2', 'c3']), `borrar c1 aquí + agregar c3 allá → c2, c3 (${m.customCategories!.map((c) => c.id)})`)
  const m2 = mergeProfile(base, r, l)
  ok(J(m2.customCategories!.map((c) => c.id).sort()) === J(['c2', 'c3']), 'y al revés da lo mismo')
  // Borrado en un lado pero editado en el otro → se queda (con la edición)
  const ed = edit({ customCategories: [{ ...base.customCategories![0], name: 'Michis' }, base.customCategories![1]] })
  const m3 = mergeProfile(base, ed, l)
  ok(m3.customCategories!.find((c) => c.id === 'c1')?.name === 'Michis', 'borrado allá pero editado aquí → se conserva la edición')
  // Editado en los dos → gana local
  const m4 = mergeProfile(base, ed, edit({ customCategories: [{ ...base.customCategories![0], name: 'Gatitos' }, base.customCategories![1]] }))
  ok(m4.customCategories!.find((c) => c.id === 'c1')?.name === 'Michis', 'editado en los dos → gana local')
  // Sin base: unión sin borrar nada
  const m5 = mergeProfile(undefined, l, r)
  ok(J(m5.customCategories!.map((c) => c.id)) === J(['c2', 'c1', 'c3']), 'sin base: unión (no se puede saber qué se borró)')
  ok(mergeById<{ id: string }>(undefined, undefined, undefined) === undefined, 'listas: sin nada en ningún lado no se crea el campo')

  const fx = mergeProfile(
    base,
    edit({ fixedExpenses: [...base.fixedExpenses!, { id: 'f2', name: 'Gym', emoji: '🏋️', amount: 90_000 }] }),
    edit({ fixedExpenses: [{ ...base.fixedExpenses![0], amount: 1_100_000 }] }),
  )
  ok(J(fx.fixedExpenses!.map((f) => [f.id, f.amount])) === J([['f1', 1_100_000], ['f2', 90_000]]), 'gastos fijos por id: agregado aquí + editado allá')
  const di = mergeProfile(
    base,
    edit({ debtItems: [...base.debtItems!, { id: 'd2', name: 'Moto', emoji: '🏍️', amount: 200_000 }], monthlyDebtPayments: 300_000 }),
    edit({ debtItems: [...base.debtItems!, { id: 'd3', name: 'TV', emoji: '📺', amount: 50_000 }], monthlyDebtPayments: 150_000 }),
  )
  ok(di.debtItems!.length === 3 && di.monthlyDebtPayments === 350_000, `cuotas: unión y la suma se recalcula (${di.monthlyDebtPayments})`)
}

// --- Campos sueltos y tasas -----------------------------------------------------------------------
{
  const m = mergeProfile(base, edit({ name: 'Ana María' }), edit({ payday: 30, avatar: 3 }))
  ok(m.name === 'Ana María' && m.payday === 30 && m.avatar === 3, 'campos distintos editados en cada lado: se quedan los dos')
  ok(mergeProfile(base, edit({ name: 'Aquí' }), edit({ name: 'Allá' })).name === 'Aquí', 'mismo campo editado en los dos → gana local')
  const noLimit = edit({})
  delete noLimit.dailyLimit
  ok(!('dailyLimit' in mergeProfile(base, base, noLimit)), 'quitar un campo en un lado (sin tocarlo en el otro) lo quita')
  ok(mergeProfile(base, edit({ wardrobe: { hat: 'hat_gorra' } }), base).wardrobe?.hat === 'hat_gorra', 'vestidor cambiado en un lado')
  const r = mergeProfile(base, edit({ rates: { USD: 4100, EUR: 4400 } }), edit({ rates: { USD: 4000, EUR: 4400, MXN: 200 } }))
  ok(J(r.rates) === J({ USD: 4100, EUR: 4400, MXN: 200 }), `tasas por moneda: USD editada aquí + MXN agregada allá (${J(r.rates)})`)
  const r2 = mergeProfile(base, edit({ rates: { USD: 4100 } }), edit({ rates: { USD: 3900, EUR: 4400 } }))
  ok(J(r2.rates) === J({ USD: 4100 }), 'tasas: EUR borrada aquí, USD editada en los dos → gana local')
  ok(mergeProfile(base, edit({ userId: 'x' }), edit({ userId: 'y' }), 'u').userId === 'u', 'userId siempre es el dueño')
}

// --- Moneda ---------------------------------------------------------------------------------------
{
  // Aquí se cambió la moneda a USD (montos convertidos); allá se editó el ingreso en COP y el nombre
  const local = edit({ currency: 'USD', rates: { COP: 1 / 4000, EUR: 1.1 }, monthlyIncome: 1000, dailyLimit: 12.5, fixedExpenses: [{ ...base.fixedExpenses![0], amount: 250 }], debtItems: [{ ...base.debtItems![0], amount: 25 }], monthlyDebtPayments: 25 })
  const remote = edit({ monthlyIncome: 5_000_000, name: 'Ana B', fixedExpenses: [...base.fixedExpenses!, { id: 'f9', name: 'Luz', emoji: '💡', amount: 80_000 }] })
  const m = mergeProfile(base, local, remote)
  ok(m.currency === 'USD' && m.monthlyIncome === 1000 && m.dailyLimit === 12.5, 'moneda cambiada aquí: el grupo de dinero sale entero de aquí (no se mezcla un ingreso en COP)')
  ok(m.fixedExpenses!.length === 1 && m.fixedExpenses![0].amount === 250 && J(m.rates) === J(local.rates), 'moneda: gastos fijos y tasas también del lado que ganó la moneda')
  ok(m.name === 'Ana B', 'moneda: los campos que no son de dinero se mezclan igual (nombre de allá)')
  const m2 = mergeProfile(base, remote, local)
  ok(m2.currency === 'USD' && m2.monthlyIncome === 1000 && m2.name === 'Ana B', 'moneda cambiada allá: el grupo sale de allá')
  const both = mergeProfile(base, edit({ currency: 'EUR', monthlyIncome: 900 }), local)
  ok(both.currency === 'EUR' && both.monthlyIncome === 900 && J(both.rates) === J(base.rates), 'moneda cambiada en los dos: gana local con todo su grupo')
  const same = mergeProfile(base, edit({ currency: 'USD', monthlyIncome: 1000 }), edit({ currency: 'USD', dailyLimit: 10 }))
  ok(same.currency === 'USD' && same.monthlyIncome === 1000 && same.dailyLimit === 10, 'misma moneda nueva en los dos: se mezcla campo por campo')
}

if (failures) {
  console.log(`${failures} FALLARON`)
  process.exit(1)
}
console.log('TODO OK')
