import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account, type Profile, type Transaction } from './db'
import { useAuth } from './auth'
import { computeBalances, fixedCategories, makeToMain, missingRates, type ToMain } from './finance'
import { setMainCurrency } from './format'
import { Splash } from '../screens/Splash'

interface Data {
  userId: string
  profile: Profile
  accounts: Account[]
  /** Ordenados del más reciente al más antiguo */
  txs: Transaction[]
  /** Saldo de cada cuenta, en la moneda de esa cuenta */
  balances: Map<string, number>
  /** Moneda principal */
  main: string
  /** Convierte un monto de una cuenta a la moneda principal */
  toMain: ToMain
  currencyOf: (accountId?: string) => string
  /** Monedas usadas en cuentas activas sin tasa de cambio definida */
  missing: string[]
  /** Categorías de gastos fijos (no cuentan contra el límite diario) */
  fixedCats: Set<string>
}

const Ctx = createContext<Data | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const userId = useAuth().user!.id
  const profile = useLiveQuery(() => db.profiles.get(userId), [userId])
  const accounts = useLiveQuery(() => db.accounts.where('userId').equals(userId).toArray(), [userId])
  const txs = useLiveQuery(
    () =>
      db.transactions
        .where('userId')
        .equals(userId)
        .toArray()
        .then((l) => l.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))),
    [userId],
  )
  const balances = useMemo(() => computeBalances(accounts ?? [], txs ?? []), [accounts, txs])
  const main = profile?.currency ?? 'COP'
  const toMain = useMemo(() => makeToMain(accounts ?? [], main, profile?.rates), [accounts, main, profile?.rates])
  const missing = useMemo(() => missingRates(accounts ?? [], main, profile?.rates), [accounts, main, profile?.rates])

  const fixedCats = useMemo(() => fixedCategories(profile?.fixedExpenses), [profile?.fixedExpenses])
  const currencyOf = useCallback((id?: string) => accounts?.find((a) => a.id === id)?.currency ?? main, [accounts, main])

  if (!profile || !accounts || !txs) return <Splash />
  setMainCurrency(main)

  return (
    <Ctx.Provider value={{ userId, profile, accounts, txs, balances, main, toMain, currencyOf, missing, fixedCats }}>
      {children}
    </Ctx.Provider>
  )
}

export function useData() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData fuera de DataProvider')
  return c
}

export function useAccountName() {
  const { accounts } = useData()
  return (id?: string) => accounts.find((a) => a.id === id)?.name ?? '—'
}
