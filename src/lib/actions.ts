import { db, type Account, type AccountType, type Transaction } from './db'
import { celebrate } from './celebrate'
import { fixedCategories, levelFromXp, makeToMain, rateOf, spentOn } from './finance'
import { money, todayStr, uid } from './format'
import { ACCOUNT_TYPES } from './catalog'

/** Máximo de movimientos al día que dan XP (evita registrar basura para subir de nivel). */
const XP_TX_CAP_PER_DAY = 10
export const XP = { tx: 5, onboarding: 50, newAccount: 10 }

export async function addXp(userId: string, amount: number, label?: string) {
  const p = await db.profiles.get(userId)
  if (!p) return
  const before = levelFromXp(p.xp).level
  const xp = p.xp + amount
  await db.profiles.update(userId, { xp })
  celebrate.emit({ kind: 'xp', amount, label })
  const after = levelFromXp(xp).level
  if (after > before) celebrate.emit({ kind: 'levelup', level: after })
}

export async function saveTransaction(tx: Transaction, isNew: boolean) {
  await db.transactions.put(tx)

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
  const p = await db.profiles.get(userId)
  const [from, to] = await Promise.all([db.accounts.get(fromId), db.accounts.get(toId)])
  if (!p || !from || !to || from.currency === to.currency || amount <= 0 || toAmount <= 0) return
  const rates = { ...p.rates }
  const rFrom = rateOf(from.currency, p.currency, rates)
  const rTo = rateOf(to.currency, p.currency, rates)
  let learned: string | undefined
  if (to.currency !== p.currency && rFrom) {
    rates[to.currency] = (amount * rFrom) / toAmount
    learned = to.currency
  } else if (from.currency !== p.currency && rTo) {
    rates[from.currency] = (toAmount * rTo) / amount
    learned = from.currency
  }
  if (!learned) return
  await db.profiles.update(userId, { rates })
  celebrate.emit({ kind: 'info', text: `Tasa actualizada: 1 ${learned} = ${money(rates[learned])}` })
}

export async function setRate(userId: string, code: string, rate: number | undefined) {
  const p = await db.profiles.get(userId)
  if (!p) return
  const rates = { ...p.rates }
  if (rate && rate > 0) rates[code] = rate
  else delete rates[code]
  await db.profiles.update(userId, { rates })
}

/** Cambia la moneda principal y re-expresa tasas, ingreso y límites en la nueva moneda. */
export async function changeMainCurrency(userId: string, next: string) {
  const p = await db.profiles.get(userId)
  if (!p || p.currency === next) return
  const r = p.rates?.[next]
  if (!r) return
  const rates: Record<string, number> = {}
  for (const [code, v] of Object.entries(p.rates ?? {})) if (code !== next) rates[code] = v / r
  rates[p.currency] = 1 / r
  const conv = (n?: number) => (n === undefined ? undefined : Math.round((n / r) * 100) / 100)
  await db.profiles.update(userId, {
    currency: next,
    rates,
    monthlyIncome: conv(p.monthlyIncome),
    monthlyDebtPayments: conv(p.monthlyDebtPayments),
    dailyLimit: conv(p.dailyLimit),
  })
}

export async function deleteTransaction(id: string) {
  const tx = await db.transactions.get(id)
  await db.transactions.delete(id)
  return tx
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
