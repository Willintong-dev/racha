import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '../lib/data'
import { db, type DebtStrategy } from '../lib/db'
import { attackOrder, durationLabel, monthsFromNow, simulate, toSimDebts } from '../lib/debts'
import { celebrate } from '../lib/celebrate'
import { money } from '../lib/format'
import { BigButton, Empty, Page } from '../components/ui'

const STRATEGIES: { id: DebtStrategy; emoji: string; name: string; pitch: string }[] = [
  { id: 'avalancha', emoji: '🏔️', name: 'Avalancha', pitch: 'Primero la de mayor interés. Pagas menos en total.' },
  { id: 'bola', emoji: '⛄', name: 'Bola de nieve', pitch: 'Primero la más pequeña. Ves deudas cerradas antes.' },
]

export function DebtSimulator() {
  const { debts, convert, profile, userId, main } = useData()
  const navigate = useNavigate()
  const active = useMemo(() => debts.filter((d) => d.balance > 0), [debts])
  const sim = useMemo(() => toSimDebts(active, convert), [active, convert])
  const skipped = active.filter((d) => !sim.some((s) => s.id === d.id))
  const noRate = active.filter((d) => !d.annualRate)

  const [strategy, setStrategy] = useState<DebtStrategy>(profile.debtPlan?.strategy ?? 'avalancha')
  const [extra, setExtra] = useState(profile.debtPlan?.extra ?? 0)

  const totalPayment = sim.reduce((s, d) => s + d.payment, 0)
  const maxExtra = Math.max(Math.ceil(totalPayment * 1.5), 10)
  const step = Math.max(1, Math.round(maxExtra / 100))

  const base = useMemo(() => simulate(sim, 0, strategy, false), [sim, strategy])
  const results = useMemo(
    () => ({ avalancha: simulate(sim, extra, 'avalancha'), bola: simulate(sim, extra, 'bola') }),
    [sim, extra],
  )
  const r = results[strategy]
  const monthsSaved = base.feasible && r.feasible ? base.months - r.months : undefined
  const interestSaved = base.totalInterest - r.totalInterest
  const nameOf = (id: string) => active.find((d) => d.id === id)
  const targetId = attackOrder(sim, strategy)[0]?.id

  if (active.length === 0) {
    return (
      <Page>
        <Back onClick={() => navigate('/deudas')} />
        <Empty emoji="🧮" title="No hay deudas para simular" text="Registra tus deudas en la pestaña Deudas y vuelve aquí." />
      </Page>
    )
  }

  return (
    <Page>
      <Back onClick={() => navigate('/deudas')} />
      <h1 className="text-2xl font-black">Simulador</h1>
      <p className="text-sm text-muted">¿Qué deuda pagar primero y cuánto extra poner cada mes?</p>

      {/* Estrategia */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {STRATEGIES.map((s) => {
          const on = strategy === s.id
          return (
            <motion.button
              key={s.id}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setStrategy(s.id)}
              animate={{ scale: on ? 1 : 0.97, opacity: on ? 1 : 0.6 }}
              className={`rounded-3xl border-2 p-4 text-left ${on ? 'border-accent bg-accent/15' : 'border-line bg-card'}`}
            >
              <div className="text-3xl">{s.emoji}</div>
              <p className="mt-1 font-black">{s.name}</p>
              <p className="text-xs text-muted">{s.pitch}</p>
            </motion.button>
          )
        })}
      </div>

      {/* Pago extra */}
      <div className="mt-5 rounded-3xl bg-card p-4">
        <div className="flex items-end justify-between">
          <p className="font-bold">Pago extra al mes</p>
          <motion.p key={extra} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-2xl font-black text-accent">
            +{money(extra)}
          </motion.p>
        </div>
        <input
          type="range"
          min={0}
          max={maxExtra}
          step={step}
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          className="mt-3 w-full accent-[#8b5cf6]"
        />
        <p className="mt-1 text-xs text-muted">Además de tus cuotas ({money(totalPayment)}/mes). Cuando liquidas una deuda, su cuota se suma al ataque de la siguiente.</p>
      </div>

      {/* Resultado */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${strategy}-${r.months}`}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="mt-5 rounded-[28px] bg-gradient-to-br from-accent/30 to-accent2/20 p-5 text-center"
        >
          {r.feasible ? (
            <>
              <p className="text-sm font-bold text-muted">Libre de deudas en</p>
              <p className="text-4xl font-black">{monthsFromNow(r.months)}</p>
              <p className="font-bold text-muted">{durationLabel(r.months)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-black/20 p-3">
                  <p className="text-muted">Intereses</p>
                  <p className="font-black text-bad">{money(r.totalInterest)}</p>
                </div>
                <div className="rounded-2xl bg-black/20 p-3">
                  <p className="text-muted">Vs. solo cuotas</p>
                  <p className="font-black text-good">
                    {monthsSaved && monthsSaved > 0 ? `${monthsSaved} ${monthsSaved === 1 ? 'mes' : 'meses'} antes` : base.feasible ? 'Igual' : '¡Ahora sí terminas!'}
                  </p>
                  {interestSaved > 0.5 && <p className="text-xs font-bold text-good">ahorras {money(interestSaved)}</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-4xl">⚠️</p>
              <p className="mt-2 font-black">Así no terminas de pagar</p>
              <p className="text-sm text-muted">Los intereses crecen más rápido que tus pagos. Sube el pago extra hasta que aparezca una fecha.</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Comparación */}
      {results.avalancha.feasible && results.bola.feasible && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
          {STRATEGIES.map((s) => {
            const x = results[s.id]
            const other = results[s.id === 'avalancha' ? 'bola' : 'avalancha']
            const best = x.totalInterest < other.totalInterest - 0.5 || (Math.abs(x.totalInterest - other.totalInterest) <= 0.5 && x.months < other.months)
            return (
              <div key={s.id} className={`rounded-2xl p-3 ${best ? 'bg-good/15 ring-1 ring-good/50' : 'bg-card'}`}>
                <p className="font-black">
                  {s.emoji} {s.name}
                </p>
                <p className="text-muted">{durationLabel(x.months)}</p>
                <p className="font-bold">{money(x.totalInterest)} intereses</p>
                {best && <p className="mt-1 text-xs font-black text-good">Más barata</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Calendario: en qué mes se liquida cada deuda. La 🎯 es la que recibe el dinero extra hoy
          (no siempre es la primera en liquidarse: una deuda pequeña puede terminar antes con su sola cuota). */}
      {r.feasible && (
        <>
          <h2 className="mt-6 text-lg font-extrabold">Cuándo liquidas cada una</h2>
          <p className="mb-2 text-xs text-muted">🎯 = recibe tu pago extra ahora. Al liquidarla, el extra y su cuota pasan a la siguiente.</p>
          <div className="flex flex-col gap-2">
            {r.order.map((id, i) => {
              const d = nameOf(id)
              if (!d) return null
              const isTarget = id === targetId
              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 rounded-2xl p-3 ${isTarget ? 'bg-accent/15 ring-1 ring-accent' : 'bg-card'}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-sm font-black">{isTarget ? '🎯' : i + 1}</span>
                  <span className="text-xl">{d.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{d.name}</b>
                    <span className="text-xs text-muted">
                      {d.annualRate ? `${String(Math.round(d.annualRate * 10) / 10).replace('.', ',')}% · ` : ''}
                      {money(d.balance, { currency: d.currency })}
                    </span>
                  </span>
                  <span className="text-right text-xs font-bold text-good">
                    liquidada
                    <br />
                    {monthsFromNow(r.payoffMonth.get(id) ?? 0)}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {(noRate.length > 0 || skipped.length > 0) && (
        <div className="mt-4 rounded-2xl bg-card2 p-3 text-xs text-muted">
          {noRate.length > 0 && <p>ℹ️ Sin tasa de interés ({noRate.map((d) => d.name).join(', ')}): se asume 0%. Agrégala para un cálculo más real.</p>}
          {skipped.length > 0 && (
            <p className="mt-1">⚠️ No incluidas por falta de tasa de cambio a {main}: {skipped.map((d) => d.name).join(', ')}.</p>
          )}
        </div>
      )}

      <div className="mt-6">
        <BigButton
          onClick={async () => {
            await db.profiles.update(userId, { debtPlan: { strategy, extra } })
            celebrate.emit({ kind: 'info', text: `Plan ${strategy === 'avalancha' ? 'Avalancha' : 'Bola de nieve'} activado 🎯` })
            navigate('/deudas')
          }}
          disabled={!r.feasible}
        >
          Aplicar plan
        </BigButton>
        {profile.debtPlan && (
          <button
            type="button"
            onClick={async () => {
              await db.profiles.update(userId, { debtPlan: undefined })
              celebrate.emit({ kind: 'info', text: 'Plan quitado' })
            }}
            className="mt-3 w-full text-center text-sm font-bold text-muted"
          >
            Quitar plan actual
          </button>
        )}
      </div>
    </Page>
  )
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 p-2 text-muted" aria-label="Volver">
      <ArrowLeft />
    </button>
  )
}
