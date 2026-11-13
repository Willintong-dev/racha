import {
  db,
  type Account,
  type AccountType,
  type CustomCategory,
  type Debt,
  type MonthlyItem,
  type Profile,
  type Transaction,
} from './db'
import { paidInMonth } from './debts'
import { FREEZE_MAX, freezesOf, itemsForLevel, type Achievement } from './game'
import { celebrate } from './celebrate'
import { fixedCategories, levelFromXp, makeToMain, rateOf, spentOn, sumItems } from './finance'
import { money, todayStr, uid } from './format'
import { ACCOUNT_TYPES } from './catalog'

/** Máximo de movimientos al día que dan XP (evita registrar basura para subir de nivel). */
const XP_TX_CAP_PER_DAY = 10
export const XP = { tx: 5, onboarding: 50, newAccount: 10, newDebt: 10, cuota: 50, extra: 100, payoff: 500 }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Lee y modifica el perfil dentro de UNA transacción de base de datos: si dos acciones corren a la vez
 * (sumar XP mientras se gasta un congelador), ninguna pisa el cambio de la otra con datos viejos.
 * `fn` recibe el perfil leído dentro de la transacción y devuelve solo los campos que cambian
 * (o undefined para no escribir nada). Las celebraciones van DESPUÉS, cuando ya se guardó.
 */
async function editProfile<R>(
  userId: string,
  fn: (p: Profile) => { patch: Partial<Profile>; result: R } | undefined,
): Promise<R | undefined> {
  return db.transaction('rw', db.profiles, async () => {
    const p = await db.profiles.get(userId)
    if (!p) return undefined
    const out = fn(p)
    if (!out) return undefined
    if (Object.keys(out.patch).length) await db.profiles.update(userId, out.patch)
    return out.result
  })
}

export async function addXp(userId: string, amount: number, label?: string) {
  const r = await editProfile(userId, (p) => {
    const before = levelFromXp(p.xp).level
    const xp = p.xp + amount
    const after = levelFromXp(xp).level
    const patch: Partial<Profile> = { xp }
    // Cada nivel nuevo regala un congelador de racha (máximo FREEZE_MAX)
    if (after > before) patch.freezes = Math.min(FREEZE_MAX, freezesOf(p) + (after - before))
    return { patch, result: { before, after, gotFreeze: freezesOf(p) < FREEZE_MAX } }
  })
  if (!r) return
  celebrate.emit({ kind: 'xp', amount, label })
  if (r.after > r.before) {
    const items: string[] = []
    for (let l = r.before + 1; l <= r.after; l++) items.push(...itemsForLevel(l).map((i) => i.emoji ?? '🎨'))
    celebrate.emit({ kind: 'levelup', level: r.after, unlocked: items.length, gotFreeze: r.gotFreeze })
  }
}

/** Desbloquea logros (una sola celebración aunque sean varios) y suma su XP. */
export async function unlockAchievements(userId: string, list: Achievement[]) {
  if (list.length === 0) return
  const fresh = await editProfile(userId, (p) => {
    const achievements = { ...p.achievements }
    const fresh = list.filter((a) => !achievements[a.id])
    if (fresh.length === 0) return undefined
    for (const a of fresh) achievements[a.id] = Date.now()
    return { patch: { achievements }, result: fresh }
  })
  if (!fresh) return
  celebrate.emit({ kind: 'achievement', items: fresh.map((a) => ({ emoji: a.emoji, name: a.name })) })
  await addXp(userId, fresh.reduce((s, a) => s + a.xp, 0), fresh.length === 1 ? `Logro: ${fresh[0].name}` : `${fresh.length} logros`)
}

/** Gasta congeladores para salvar días sin cumplir y mantener la racha. */
export async function applyFreezes(userId: string, days: string[], streakAfter: number) {
  if (days.length === 0) return
  const used = await editProfile(userId, (p) => {
    // Un día ya salvado (por otra llamada que corrió antes) no gasta otro congelador
    const done = new Set(p.frozenDays ?? [])
    const fresh = [...new Set(days)].filter((d) => !done.has(d))
    if (fresh.length === 0 || freezesOf(p) < fresh.length) return undefined
    return {
      patch: { freezes: freezesOf(p) - fresh.length, frozenDays: [...(p.frozenDays ?? []), ...fresh] },
      result: fresh.length,
    }
  })
  if (!used) return
  celebrate.emit({
    kind: 'freeze',
    text: `🧊 Usamos ${used === 1 ? 'un congelador' : `${used} congeladores`}: tu racha de ${streakAfter} días sigue viva`,
  })
}

export async function saveTransaction(tx: Transaction, isNew: boolean) {
  // Un pago nuevo a una deuda baja su saldo en la misma transacción de base de datos
  let debtBefore: Debt | undefined
  let paidBefore = 0
  if (isNew && tx.type === 'pago_deuda' && tx.debtId) {
    await db.transaction('rw', db.transactions, db.debts, async () => {
      debtBefore = await db.debts.get(tx.debtId!)
      paidBefore = paidInMonth(tx.debtId!, await db.transactions.where('userId').equals(tx.userId).toArray(), tx.date)
      await db.transactions.put(tx)
      if (debtBefore) await applyToDebt(debtBefore.id, -tx.amount)
    })
  } else {
    await db.transactions.put(tx)
  }
  // Liquidar una deuda se celebra primero, antes de cualquier XP que pueda disparar "Subiste de nivel"
  if (debtBefore && debtBefore.balance > 0 && debtBefore.balance - tx.amount <= 0.005) {
    celebrate.emit({ kind: 'payoff', name: debtBefore.name, emoji: debtBefore.emoji })
  }

  if (isNew) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const createdToday = await db.transactions
      .where('userId')
      .equals(tx.userId)
      .filter((t) => t.createdAt >= start.getTime() && t.type !== 'ajuste')
      .count()
    if (createdToday <= XP_TX_CAP_PER_DAY) await addXp(tx.userId, XP.tx)
  }

  if (debtBefore) await rewardDebtPayment(tx, debtBefore, paidBefore)

  if (tx.type === 'transferencia' && tx.toAccountId && tx.toAmount) {
    await learnRate(tx.userId, tx.accountId, tx.toAccountId, tx.amount, tx.toAmount)
  }

  if (tx.type === 'gasto' && tx.date === todayStr()) {
    const p = await db.profiles.get(tx.userId)
    if (p?.dailyLimit) {
      const all = await db.transactions.where('userId').equals(tx.userId).toArray()
      const accounts = await db.accounts.where('userId').equals(tx.userId).toArray()
      const toMain = makeToMain(accounts, p.currency, p.rates)
      const fixed = fixedCategories(p.fixedExpenses)
      const spent = spentOn(all, tx.date, toMain, fixed)
      // Avisamos solo al cruzar el límite, no en cada gasto posterior (y nunca por un gasto fijo)
      if (!(tx.categoryId && fixed.has(tx.categoryId)) && spent > p.dailyLimit && spent - toMain(tx.amount, tx.accountId) <= p.dailyLimit) {
        celebrate.emit({
          kind: 'warn',
          text: `Te pasaste del límite de hoy (${money(spent)} de ${money(p.dailyLimit)}). Mañana es otro día 💪`,
        })
      }
    }
  }
}

/** Una transferencia entre monedas distintas nos dice la tasa real que usó el usuario. */
async function learnRate(userId: string, fromId: string, toId: string, amount: number, toAmount: number) {
  const [from, to] = await Promise.all([db.accounts.get(fromId), db.accounts.get(toId)])
  if (!from || !to || from.currency === to.currency || amount <= 0 || toAmount <= 0) return
  const learned = await editProfile(userId, (p) => {
    const rates = { ...p.rates }
    const rFrom = rateOf(from.currency, p.currency, rates)
    const rTo = rateOf(to.currency, p.currency, rates)
    let code: string | undefined
    if (to.currency !== p.currency && rFrom) {
      rates[to.currency] = (amount * rFrom) / toAmount
      code = to.currency
    } else if (from.currency !== p.currency && rTo) {
      rates[from.currency] = (toAmount * rTo) / amount
      code = from.currency
    }
    if (!code) return undefined
    return { patch: { rates }, result: { code, rate: rates[code] } }
  })
  if (!learned) return
  celebrate.emit({ kind: 'info', text: `Tasa actualizada: 1 ${learned.code} = ${money(learned.rate)}` })
}

/** Crea o edita una categoría propia (vive en el perfil, así se sincroniza sin tablas nuevas). */
export async function saveCustomCategory(userId: string, cat: CustomCategory) {
  await editProfile(userId, (p) => {
    const list = p.customCategories ?? []
    const customCategories = list.some((c) => c.id === cat.id) ? list.map((c) => (c.id === cat.id ? cat : c)) : [...list, cat]
    return { patch: { customCategories }, result: true }
  })
}

/** Borra una categoría propia. Sus movimientos no se tocan: se ven como "Otros". */
export async function deleteCustomCategory(userId: string, id: string) {
  await editProfile(userId, (p) => ({
    patch: { customCategories: (p.customCategories ?? []).filter((c) => c.id !== id) },
    result: true,
  }))
}

/** Quita una cuota declarada en el onboarding (y recalcula su suma) sin pisar otros cambios del perfil. */
export async function removeDebtItem(userId: string, itemId: string) {
  await editProfile(userId, (p) => {
    const debtItems = (p.debtItems ?? []).filter((i) => i.id !== itemId)
    return { patch: { debtItems, monthlyDebtPayments: sumItems(debtItems) }, result: true }
  })
}

export async function setRate(userId: string, code: string, rate: number | undefined) {
  await editProfile(userId, (p) => {
    const rates = { ...p.rates }
    if (rate && rate > 0) rates[code] = rate
    else delete rates[code]
    return { patch: { rates }, result: true }
  })
}

/**
 * Cambia la moneda principal y re-expresa en la nueva moneda todo lo que el perfil guarda en ella:
 * tasas, ingreso, límite diario, cuotas declaradas, gastos fijos y el pago extra del plan de deudas.
 */
export async function changeMainCurrency(userId: string, next: string) {
  await editProfile(userId, (p) => {
    if (p.currency === next) return undefined
    const r = p.rates?.[next]
    if (!r) return undefined
    const rates: Record<string, number> = {}
    for (const [code, v] of Object.entries(p.rates ?? {})) if (code !== next) rates[code] = v / r
    rates[p.currency] = 1 / r
    const conv = (n?: number) => (n === undefined ? undefined : round2(n / r))
    const convItems = (list: MonthlyItem[]) => list.map((i) => ({ ...i, amount: round2(i.amount / r) }))
    const patch: Partial<Profile> = {
      currency: next,
      rates,
      monthlyIncome: conv(p.monthlyIncome),
      monthlyDebtPayments: conv(p.monthlyDebtPayments),
      dailyLimit: conv(p.dailyLimit),
    }
    if (p.debtItems) patch.debtItems = convItems(p.debtItems)
    if (p.fixedExpenses) patch.fixedExpenses = convItems(p.fixedExpenses)
    if (p.debtPlan) patch.debtPlan = { ...p.debtPlan, extra: round2(p.debtPlan.extra / r) }
    return { patch, result: true }
  })
}

export async function deleteTransaction(id: string) {
  return db.transaction('rw', db.transactions, db.debts, async () => {
    const tx = await db.transactions.get(id)
    await db.transactions.delete(id)
    // Borrar un pago devuelve el saldo a la deuda
    if (tx?.type === 'pago_deuda' && tx.debtId) await applyToDebt(tx.debtId, tx.amount)
    return tx
  })
}

/** Deshacer un borrado: vuelve a poner el movimiento (y a descontar el pago de la deuda) sin dar XP. */
export async function restoreTransaction(tx: Transaction) {
  await db.transaction('rw', db.transactions, db.debts, async () => {
    await db.transactions.put(tx)
    if (tx.type === 'pago_deuda' && tx.debtId) await applyToDebt(tx.debtId, -tx.amount)
  })
}

// ---------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------

/** Suma `delta` al saldo (negativo = pago). Marca o desmarca la deuda como liquidada. */
async function applyToDebt(debtId: string, delta: number) {
  const d = await db.debts.get(debtId)
  if (!d) return
  const balance = Math.max(0, round2(d.balance + delta))
  await db.debts.update(debtId, { balance, paidOffAt: balance <= 0 ? (d.paidOffAt ?? Date.now()) : undefined })
}

/**
 * XP por pagar: la primera vez que se completa la cuota del mes = cuota (+50).
 * Abonos por encima de la cuota = pago extra (+100, máx. 1 por día y solo si es ≥ 10% de la cuota).
 * Liquidar la deuda = +500 y celebración.
 */
async function rewardDebtPayment(tx: Transaction, before: Debt, paidBefore: number) {
  const paysOff = before.balance > 0 && before.balance - tx.amount <= 0.005
  const cuota = Math.min(before.monthlyPayment, before.balance + paidBefore)
  const completesCuota = paidBefore < cuota - 0.005 && paidBefore + tx.amount >= cuota - 0.005
  const isExtra = paidBefore >= cuota - 0.005 || paidBefore + tx.amount > cuota + 0.005

  const month = tx.date.slice(0, 7)
  if (completesCuota && before.xpCuotaMonth !== month) {
    await db.debts.update(before.id, { xpCuotaMonth: month })
    await addXp(tx.userId, XP.cuota, 'Cuota pagada')
  }
  if (isExtra && tx.amount >= before.monthlyPayment * 0.1 && before.xpExtraDay !== tx.date) {
    await db.debts.update(before.id, { xpExtraDay: tx.date })
    await addXp(tx.userId, XP.extra, 'Pago extra')
  }
  if (paysOff) {
    // Los 500 XP solo la primera vez que se liquida
    if (!before.xpPayoff) {
      await db.debts.update(before.id, { xpPayoff: true })
      await addXp(tx.userId, XP.payoff, 'Deuda liquidada')
    }
  }
}

export async function payDebt(debt: Debt, amount: number, kind: 'cuota' | 'extra') {
  const paid = Math.min(round2(amount), debt.balance)
  if (paid <= 0) return
  await saveTransaction(
    {
      id: uid(),
      userId: debt.userId,
      type: 'pago_deuda',
      amount: paid,
      accountId: debt.payFromAccountId,
      debtId: debt.id,
      date: todayStr(),
      note: kind === 'extra' ? 'Pago extra' : 'Cuota',
      createdAt: Date.now(),
    },
    true,
  )
}

export type DebtInput = Omit<Debt, 'id' | 'userId' | 'createdAt' | 'originalBalance' | 'paidOffAt'>

export async function createDebt(userId: string, data: DebtInput) {
  const debt: Debt = {
    ...data,
    id: uid(),
    userId,
    balance: round2(data.balance),
    originalBalance: round2(data.balance),
    createdAt: Date.now(),
  }
  await db.debts.add(debt)
  await addXp(userId, XP.newDebt, 'Deuda registrada')
  return debt
}

export async function updateDebt(id: string, data: Partial<DebtInput>) {
  const d = await db.debts.get(id)
  if (!d) return
  const patch: Partial<Debt> = { ...data }
  if (data.balance !== undefined) {
    patch.balance = round2(data.balance)
    // Si el saldo real es mayor que el original (intereses, más compras), el progreso parte de ahí
    if (patch.balance > d.originalBalance) patch.originalBalance = patch.balance
    patch.paidOffAt = patch.balance <= 0 ? (d.paidOffAt ?? Date.now()) : undefined
  }
  await db.debts.update(id, patch)
}

export async function deleteDebt(id: string) {
  await db.debts.delete(id)
}

export async function createAccount(
  userId: string,
  data: { name: string; type: AccountType; initialBalance: number; currency: string; isPrimary?: boolean },
) {
  const acc: Account = {
    id: uid(),
    userId,
    name: data.name.trim() || ACCOUNT_TYPES[data.type].label,
    type: data.type,
    initialBalance: data.initialBalance,
    isPrimary: !!data.isPrimary,
    currency: data.currency,
    color: ACCOUNT_TYPES[data.type].color,
    archived: false,
    createdAt: Date.now(),
  }
  await db.accounts.add(acc)
  return acc
}

export async function setPrimary(userId: string, accountId: string) {
  await db.transaction('rw', db.accounts, async () => {
    const all = await db.accounts.where('userId').equals(userId).toArray()
    for (const a of all) await db.accounts.update(a.id, { isPrimary: a.id === accountId })
  })
}

export async function adjustBalance(acc: Account, current: number, real: number) {
  const diff = Math.round((real - current) * 100) / 100
  if (diff === 0) return
  await db.transactions.add({
    id: uid(),
    userId: acc.userId,
    type: 'ajuste',
    amount: diff,
    accountId: acc.id,
    date: todayStr(),
    note: 'Ajuste de saldo',
    createdAt: Date.now(),
  })
}
