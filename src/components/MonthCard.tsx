import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useData } from '../lib/data'
import { monthBalance, type MonthStatus } from '../lib/finance'
import { money, monthLabel, parseDate, todayStr } from '../lib/format'
import { AnimatedMoney } from './ui'

const STATUS: Record<MonthStatus, { color: string; emoji: string; text: string }> = {
  verde: { color: '#34d399', emoji: '🟢', text: 'Vas bien' },
  amarillo: { color: '#fbbf24', emoji: '🟡', text: 'Vas más rápido de lo planeado' },
  rojo: { color: '#f87171', emoji: '🔴', text: 'Estás en rojo este mes' },
}

/** "Este mes": cuánto te queda para el día a día y si vas a buen ritmo. */
export function MonthCard() {
  const { profile, debts, txs, toMain, convert } = useData()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const today = todayStr()
  const b = useMemo(() => monthBalance({ profile, debts, txs, toMain, convert, today }), [profile, debts, txs, toMain, convert, today])

  if (!b) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate('/perfil')}
        className="mt-4 flex w-full items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-left"
      >
        <span className="text-2xl">📅</span>
        <span className="flex-1 text-sm">
          <b>Agrega tu ingreso mensual</b>
          <br />
          <span className="text-muted">Así te digo si este mes vas bien o estás en rojo.</span>
        </span>
        <ChevronRight className="text-muted" />
      </motion.button>
    )
  }

  const s = STATUS[b.status]
  const over = b.remaining < 0
  const max = Math.max(b.budget, 0)
  const spentPct = max > 0 ? Math.min(b.variableSpent / max, 1) : b.variableSpent > 0 ? 1 : 0
  const pacePct = b.day / b.daysInMonth
  const bigValue = Math.abs(b.remaining)
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, damping: 22, stiffness: 90 }

  return (
    <motion.button
      type="button"
      data-testid="month-card"
      whileTap={reduce ? undefined : { scale: 0.98 }}
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="mt-4 block w-full rounded-3xl bg-card p-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wider text-muted uppercase">Este mes · {monthLabel(parseDate(today)).split(' ')[0]}</p>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : undefined} className="text-muted">
          <ChevronDown size={18} />
        </motion.span>
      </div>

      <p className="mt-1 text-sm font-bold text-muted">{over ? 'Te pasaste por' : 'Te quedan'}</p>
      <p className="text-3xl font-black tabular-nums" style={{ color: over ? s.color : undefined }}>
        {reduce ? money(bigValue) : <AnimatedMoney value={bigValue} />}
      </p>

      {/* Barra: gastado vs presupuesto, con la marca de "dónde deberías ir hoy" */}
      <div className="relative mt-3 pt-4">
        <div
          className="absolute top-0 -translate-x-1/2 text-[10px] font-bold text-muted"
          style={{ left: `${Math.min(Math.max(pacePct * 100, 6), 94)}%` }}
        >
          hoy
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${spentPct * 100}%`, background: s.color }}
            transition={spring}
          />
        </div>
        <div className="absolute top-3.5 bottom-[-2px] w-0.5 rounded bg-ink/80" style={{ left: `${pacePct * 100}%` }} aria-hidden />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
        <span>Gastado {money(b.variableSpent)}</span>
        <span>de {money(max)}</span>
      </div>

      <p className="mt-2 text-sm font-bold" style={{ color: s.color }}>
        <motion.span
          className="inline-block"
          animate={b.status === 'rojo' && !reduce ? { scale: [1, 1.2, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          {s.emoji}
        </motion.span>{' '}
        {s.text}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {b.perDayLeft > 0 ? (
          <>
            Puedes gastar <b className="text-ink">{money(b.perDayLeft)}/día</b> {b.daysLeft === 1 ? 'hoy, último día del mes' : `los ${b.daysLeft} días que quedan`}
          </>
        ) : b.budget <= 0 ? (
          'Tus gastos fijos, cuotas y ahorro ya usan todo tu ingreso.'
        ) : (
          `Trata de no sumar más gastos del día a día ${b.daysLeft === 1 ? 'hoy' : `en los ${b.daysLeft} días que quedan`}.`
        )}
      </p>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-line pt-2 text-xs tabular-nums">
              <HowLine label="Ingreso mensual" value={money(b.income)} />
              <HowLine label="− Gastos fijos" value={money(b.fixed)} />
              <HowLine label="− Cuotas de deudas" value={money(b.debts)} />
              <HowLine label={`− Ahorro (${profile.savingsPct ?? 0}%)`} value={money(b.saving)} />
              <div className="my-1 h-px bg-line" />
              <HowLine label="= Para el día a día" value={money(b.budget)} strong />
              <HowLine label="− Gastado este mes" value={money(b.variableSpent)} />
              <div className="my-1 h-px bg-line" />
              <HowLine label={over ? '= Te pasaste por' : '= Te queda'} value={money(Math.abs(b.remaining))} strong />
              <p className="mt-2 text-muted">
                No cuenta lo que gastas en tus categorías de gastos fijos
                {b.fixedSpent > 0 ? ` (llevas ${money(b.fixedSpent)})` : ''}
                {b.debtPaid > 0 ? ` ni lo que abonas a deudas (${money(b.debtPaid)} este mes)` : ''}.
              </p>
              <p className="mt-1 text-muted">
                Ingresos registrados este mes: <b className="text-ink">{money(b.incomeReceived)}</b> de {money(b.income)} esperados.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function HowLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${strong ? 'font-black text-ink' : 'text-muted'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
