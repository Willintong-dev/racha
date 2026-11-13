import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { useData } from '../lib/data'
import { type Debt, type MonthlyItem } from '../lib/db'
import { removeDebtItem } from '../lib/actions'
import { attackOrder, dueInfo, dueLabel, durationLabel, monthsFromNow, simulate, toSimDebts } from '../lib/debts'
import { money } from '../lib/format'
import { AnimatedMoney, Empty, Page, Sheet } from '../components/ui'
import { DebtWizard, type DebtSeed } from '../components/DebtWizard'

export function Debts() {
  const { debts, txs, profile, userId, convert } = useData()
  const navigate = useNavigate()
  const [wizard, setWizard] = useState<{ seed?: DebtSeed; itemId?: string } | null>(null)
  const [showPaid, setShowPaid] = useState(false)

  const active = debts.filter((d) => d.balance > 0)
  const paidOff = debts.filter((d) => d.balance <= 0)
  const pending = profile.debtItems ?? []

  const totals = useMemo(() => {
    let owed = 0
    let original = 0
    for (const d of debts) {
      owed += convert(d.balance, d.currency)
      original += convert(d.originalBalance, d.currency)
    }
    return { owed, original, pct: original > 0 ? (original - owed) / original : 0 }
  }, [debts, convert])

  const plan = profile.debtPlan
  const sim = useMemo(() => {
    const sd = toSimDebts(active, convert)
    if (!sd.length) return null
    return plan ? simulate(sd, plan.extra, plan.strategy) : simulate(sd, 0, 'avalancha', false)
  }, [active, convert, plan])
  // Con plan: la deuda a la que va el dinero extra este mes
  const target = useMemo(() => {
    if (!plan) return undefined
    const sd = toSimDebts(active, convert)
    return attackOrder(sd, plan.strategy)[0]?.id
  }, [plan, active, convert])

  const removeItem = (itemId: string) => removeDebtItem(userId, itemId)

  return (
    <Page>
      <h1 className="text-2xl font-black">Deudas</h1>

      {active.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-[28px] bg-card p-5">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Debes en total</p>
          <AnimatedMoney value={totals.owed} className="mt-1 block text-4xl font-black tabular-nums" />
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-good to-emerald-300"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(totals.pct * 100, 2)}%` }}
              transition={{ type: 'spring', damping: 20, stiffness: 60 }}
            />
          </div>
          <p className="mt-1.5 text-sm font-bold text-good">Llevas {Math.round(totals.pct * 100)}% pagado</p>
          {sim && (
            <p className="mt-3 text-sm text-muted">
              {sim.feasible ? (
                <>
                  🏁 Libre de deudas en <b className="text-ink">{monthsFromNow(sim.months)}</b> ({durationLabel(sim.months)})
                </>
              ) : (
                <span className="font-bold text-bad">⚠️ Con las cuotas actuales no terminas de pagar: revisa el simulador.</span>
              )}
            </p>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/deudas/simulador')}
            className="grad mt-4 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 font-extrabold text-white"
          >
            <span>
              🧮 {plan ? `Plan ${plan.strategy === 'avalancha' ? 'Avalancha' : 'Bola de nieve'}${plan.extra ? ` +${money(plan.extra)}/mes` : ''}` : 'Simular cómo pagar más rápido'}
            </span>
            <ChevronRight />
          </motion.button>
        </motion.div>
      )}

      {/* Cuotas declaradas en el onboarding: falta el saldo total y el día de pago */}
      {pending.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-extrabold">Completa tus deudas</h2>
          <p className="mb-2 text-sm text-muted">Agregaste estas cuotas al empezar. Falta el saldo total y el día de pago.</p>
          <div className="flex flex-col gap-2">
            {pending.map((i: MonthlyItem) => (
              <motion.button
                key={i.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setWizard({ seed: { name: i.name, emoji: i.emoji, monthlyPayment: i.amount }, itemId: i.id })}
                className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-accent/50 bg-accent/5 p-4 text-left"
              >
                <span className="text-2xl">{i.emoji}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{i.name}</b>
                  <span className="text-sm text-muted">{money(i.amount)}/mes</span>
                </span>
                <span className="rounded-full bg-accent px-3 py-1.5 text-sm font-extrabold text-white">Completar</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && <h2 className="mt-6 mb-2 text-lg font-extrabold">Tus deudas</h2>}
      <div className="flex flex-col gap-3">
        {active.map((d, i) => (
          <DebtCard key={d.id} debt={d} index={i} target={d.id === target} txs={txs} onClick={() => navigate(`/deudas/${d.id}`)} />
        ))}
      </div>

      {active.length === 0 && pending.length === 0 && (
        <Empty
          emoji={paidOff.length ? '🕊️' : '🎯'}
          title={paidOff.length ? '¡No debes nada!' : 'Sin deudas registradas'}
          text={paidOff.length ? 'Todas tus deudas están liquidadas. Así se hace.' : 'Si tienes tarjetas, créditos o préstamos, regístralos para planear cómo salir más rápido.'}
        />
      )}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setWizard({})}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-5 font-extrabold text-muted"
      >
        <Plus size={20} /> Nueva deuda
      </motion.button>

      {paidOff.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowPaid((s) => !s)} className="text-sm font-bold text-muted">
            {showPaid ? '▾' : '▸'} Pagadas ✓ ({paidOff.length})
          </button>
          <AnimatePresence>
            {showPaid && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 flex flex-col gap-2">
                {paidOff.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate(`/deudas/${d.id}`)}
                    className="flex items-center gap-3 rounded-2xl bg-good/10 p-3 text-left"
                  >
                    <span className="text-xl">{d.emoji}</span>
                    <span className="flex-1 font-bold">{d.name}</span>
                    <span className="text-sm font-bold text-good">{money(d.originalBalance, { currency: d.currency })} ✓</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={!!wizard} onClose={() => setWizard(null)} title={wizard?.itemId ? 'Completar deuda' : 'Nueva deuda'}>
        {wizard && (
          <DebtWizard
            seed={wizard.seed}
            onDone={async (d) => {
              if (d && wizard.itemId) await removeItem(wizard.itemId)
              setWizard(null)
            }}
          />
        )}
      </Sheet>
    </Page>
  )
}

function DebtCard({
  debt,
  index,
  target,
  txs,
  onClick,
}: {
  debt: Debt
  index: number
  target: boolean
  txs: ReturnType<typeof useData>['txs']
  onClick: () => void
}) {
  const info = dueInfo(debt, txs)
  const pct = debt.originalBalance > 0 ? (debt.originalBalance - debt.balance) / debt.originalBalance : 0
  const tone = info.paidThisMonth ? 'text-good bg-good/15' : info.overdue ? 'text-bad bg-bad/15' : info.daysLeft <= 5 ? 'text-warn bg-warn/15' : 'text-muted bg-white/5'
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-3xl bg-card p-4 text-left ${target ? 'ring-2 ring-accent' : ''}`}
    >
      {target && (
        <span className="absolute top-3 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-white">🎯 ATACA ESTA</span>
      )}
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-2xl">{debt.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate pr-20 font-extrabold">{debt.name}</p>
          <p className="text-xl font-black tabular-nums">{money(debt.balance, { currency: debt.currency })}</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-good"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct * 100, 2)}%` }}
          transition={{ type: 'spring', damping: 20, stiffness: 70, delay: 0.1 + index * 0.05 }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-muted">
          {Math.round(pct * 100)}% pagado · {money(debt.monthlyPayment, { currency: debt.currency })}/mes
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 font-bold ${tone}`}>{dueLabel(info)}</span>
      </div>
    </motion.button>
  )
}
