import { useState } from 'react'
import { dueInfo, dueLabel } from '../lib/debts'
import { payDebt } from '../lib/actions'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useData } from '../lib/data'
import { spentOn } from '../lib/finance'
import { money, todayStr } from '../lib/format'
import { AnimatedMoney, Avatar, Empty, Page, Ring, XpBar } from '../components/ui'
import { TxRow } from '../components/TxRow'
import { useQuickAdd } from '../components/QuickAdd'
import { StreakSheet } from '../components/StreakSheet'

export function Home() {
  const { profile, accounts, txs, balances, toMain, fixedCats } = useData()
  const navigate = useNavigate()
  const quickAdd = useQuickAdd()
  const [streakOpen, setStreakOpen] = useState(false)

  const { streak, level: lvl } = useData()
  const spentToday = spentOn(txs, todayStr(), toMain, fixedCats)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <Page>
      {/* Cabecera: avatar, nivel, XP y racha */}
      <div className="flex items-center gap-3">
        <Avatar index={profile.avatar} size={52} look={profile.wardrobe} onClick={() => navigate('/perfil')} />
        <button type="button" onClick={() => navigate('/perfil')} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm text-muted">
            {greeting}, <b className="text-ink">{profile.name}</b>
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-black text-accent">Nv {lvl.level}</span>
            <XpBar into={lvl.into} needed={lvl.needed} className="flex-1" />
          </div>
        </button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => setStreakOpen(true)}
          className={`flex items-center gap-1 rounded-full px-3 py-2 font-black ${
            streak.current > 0 ? 'bg-orange-500/20 text-orange-300' : 'bg-card2 text-muted'
          }`}
        >
          <motion.span
            animate={streak.todayDone ? { scale: [1, 1.25, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className={streak.current > 0 ? '' : 'grayscale'}
          >
            🔥
          </motion.span>
          {streak.current}
        </motion.button>
      </div>

      <BalanceCarousel accounts={accounts.filter((a) => !a.archived)} balances={balances} />

      {/* Gasto de hoy vs límite */}
      {profile.dailyLimit ? (
        <TodayRing spent={spentToday} limit={profile.dailyLimit} />
      ) : (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/perfil')}
          className="mt-4 flex w-full items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-left"
        >
          <span className="text-2xl">🎯</span>
          <span className="flex-1 text-sm">
            <b>Define tu límite diario</b>
            <br />
            <span className="text-muted">Hoy llevas {money(spentToday)} en gastos.</span>
          </span>
          <ChevronRight className="text-muted" />
        </motion.button>
      )}

      <UpcomingPayments />

      {/* Últimos movimientos */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Últimos movimientos</h2>
        {txs.length > 0 && (
          <button type="button" onClick={() => navigate('/movimientos')} className="text-sm font-bold text-accent">
            Ver todos
          </button>
        )}
      </div>
      {txs.length === 0 ? (
        <Empty emoji="🪙" title="Aún no hay movimientos" text="Toca el botón + para registrar tu primer gasto. Te toma 3 segundos." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card">
          {txs.slice(0, 5).map((tx, i) => (
            <motion.button
              key={tx.id}
              type="button"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => quickAdd({ edit: tx })}
              className="block w-full border-b border-white/5 text-left last:border-0"
            >
              <TxRow tx={tx} />
            </motion.button>
          ))}
        </div>
      )}

      <StreakSheet open={streakOpen} onClose={() => setStreakOpen(false)} />
    </Page>
  )
}

function BalanceCarousel({
  accounts,
  balances,
}: {
  accounts: ReturnType<typeof useData>['accounts']
  balances: Map<string, number>
}) {
  const { toMain, main, missing } = useData()
  const navigate = useNavigate()
  const list = [...accounts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [showTotal, setShowTotal] = useState(false)
  const total = list.reduce((s, a) => s + toMain(balances.get(a.id) ?? 0, a.id), 0)
  const i = Math.min(idx, list.length - 1)
  const acc = list[i]
  if (!acc) return null

  const go = (n: number) => {
    if (n < 0 || n >= list.length) return
    setDir(n > i ? 1 : -1)
    setIdx(n)
    setShowTotal(false)
  }

  return (
    <div className="mt-5">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50) go(i + 1)
          else if (info.offset.x > 50) go(i - 1)
        }}
        onTap={() => setShowTotal((s) => !s)}
        whileTap={{ scale: 0.98 }}
        className="relative h-44 cursor-grab touch-pan-y overflow-hidden rounded-[28px] p-5 shadow-2xl select-none"
        style={{
          background: showTotal
            ? 'linear-gradient(135deg,#8b5cf6,#ec4899)'
            : `linear-gradient(135deg, ${acc.color}, ${acc.color}99 60%, #0b0b14)`,
        }}
      >
        <motion.div
          className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 5 }}
        />
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={showTotal ? 'total' : acc.id}
            custom={dir}
            initial={{ opacity: 0, x: 40 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 * dir }}
            transition={{ duration: 0.2 }}
            className="relative flex h-full flex-col"
          >
            <p className="text-sm font-bold text-white/80">
              {showTotal ? `Dinero total en ${main} · todas tus cuentas` : `${acc.isPrimary ? '★ ' : ''}${acc.name}`}
            </p>
            <AnimatedMoney
              value={showTotal ? total : (balances.get(acc.id) ?? 0)}
              currency={showTotal ? main : acc.currency}
              className="mt-2 text-4xl font-black text-white tabular-nums"
            />
            {!showTotal && acc.currency !== main && toMain(1, acc.id) > 0 && (
              <p className="text-sm font-bold text-white/70">≈ {money(toMain(balances.get(acc.id) ?? 0, acc.id))}</p>
            )}
            <p className="mt-auto text-xs font-semibold text-white/70">
              {showTotal ? 'Toca para volver' : list.length > 1 ? 'Desliza para ver otras cuentas · toca para ver el total' : 'Toca para ver el total'}
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {missing.length > 0 && (
        <button type="button" onClick={() => navigate('/perfil')} className="mt-2 w-full text-center text-xs font-bold text-warn">
          ⚠️ Falta la tasa de {missing.join(', ')}: no se suma al total. Configúrala →
        </button>
      )}
      {list.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {list.map((a, n) => (
            <motion.div key={a.id} className="h-1.5 rounded-full" animate={{ width: n === i ? 20 : 6, background: n === i ? '#f4f4fb' : '#2a2a42' }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TodayRing({ spent, limit }: { spent: number; limit: number }) {
  const pct = spent / limit
  const color = pct < 0.7 ? '#34d399' : pct <= 1 ? '#fbbf24' : '#f87171'
  const left = limit - spent
  return (
    <div className="mt-4 flex items-center gap-5 rounded-3xl bg-card p-4">
      <Ring value={spent} max={limit} size={96} stroke={11} color={color}>
        <span className="text-lg font-black">{Math.round(pct * 100)}%</span>
      </Ring>
      <div className="flex-1">
        <p className="text-xs font-bold tracking-wider text-muted uppercase">Hoy</p>
        <p className="text-xl font-black tabular-nums">
          {money(spent)} <span className="text-base text-muted">de {money(limit)}</span>
        </p>
        <p className="mt-1 text-sm font-bold" style={{ color }}>
          {left >= 0 ? `Te quedan ${money(left)}` : `Te pasaste ${money(-left)}`}
        </p>
      </div>
    </div>
  )
}

/** Cuotas que vencen en los próximos 5 días (o ya vencidas) y aún no se pagan este mes. */
function UpcomingPayments() {
  const { debts, txs } = useData()
  const navigate = useNavigate()
  const [paying, setPaying] = useState<string | null>(null)
  const upcoming = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ debt: d, info: dueInfo(d, txs) }))
    .filter(({ info }) => !info.paidThisMonth && info.daysLeft <= 5)
    .sort((a, b) => a.info.daysLeft - b.info.daysLeft)
  if (!upcoming.length) return null

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-lg font-extrabold">Próximos pagos</h2>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {upcoming.map(({ debt, info }) => (
            <motion.div
              key={debt.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60, height: 0, marginTop: 0 }}
              className={`flex items-center gap-3 rounded-3xl p-3 ${info.overdue ? 'bg-bad/15' : 'bg-card'}`}
            >
              <button type="button" onClick={() => navigate(`/deudas/${debt.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-xl">{debt.emoji}</span>
                <span className="min-w-0">
                  <b className="block truncate">{debt.name}</b>
                  <span className={`text-xs font-bold ${info.overdue ? 'text-bad' : info.daysLeft <= 1 ? 'text-warn' : 'text-muted'}`}>
                    {dueLabel(info)} · {money(info.remainingThisMonth, { currency: debt.currency })}
                  </span>
                </span>
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                disabled={paying === debt.id}
                onClick={async () => {
                  setPaying(debt.id)
                  navigator.vibrate?.([10, 40, 20])
                  await payDebt(debt, info.remainingThisMonth, 'cuota')
                  setPaying(null)
                }}
                className="grad shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Pagar
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
