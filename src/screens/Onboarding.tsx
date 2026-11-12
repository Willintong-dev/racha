import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import { db } from '../lib/db'
import { addXp, createAccount, XP } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { AVATARS } from '../lib/catalog'
import { DEBT_PRESETS, FIXED_PRESETS } from '../lib/catalog'
import type { MonthlyItem } from '../lib/db'
import { sumItems, suggestedDailyLimit } from '../lib/finance'
import { MonthlyItems } from '../components/MonthlyItems'
import { CURRENCY_LIST, currencySymbol, formatTyping, getMainCurrency, money, parseAmount, setMainCurrency } from '../lib/format'
import { Avatar, BigButton, NumPad } from '../components/ui'
import { CurrencyPicker } from '../components/currency'

const TOTAL = 7

/** Moneda sugerida según la región del dispositivo (es-MX → MXN). Por defecto COP. */
function guessCurrency() {
  const region = navigator.language.split('-')[1]?.toUpperCase()
  return CURRENCY_LIST.find((c) => c.locale.split('-')[1] === region)?.code ?? 'COP'
}

export function Onboarding() {
  const userId = useAuth().user!.id
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(0)
  const [accName, setAccName] = useState('')
  const [currency, setCurrencyState] = useState(() => {
    const c = guessCurrency()
    setMainCurrency(c)
    return c
  })
  const chooseCurrency = (c: string) => {
    setMainCurrency(c)
    setCurrencyState(c)
  }
  const [accBalance, setAccBalance] = useState('')
  const [income, setIncome] = useState('')
  const [payday, setPayday] = useState(30)
  const [hasDebts, setHasDebts] = useState<boolean | null>(null)
  const [debtItems, setDebtItems] = useState<MonthlyItem[]>([])
  const [fixedItems, setFixedItems] = useState<MonthlyItem[]>([])
  const [savingsPct, setSavingsPct] = useState(10)
  const [limit, setLimit] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const incomeN = parseAmount(income) || undefined
  const debtsN = hasDebts ? sumItems(debtItems) : 0
  const fixedN = sumItems(fixedItems)
  const suggested = suggestedDailyLimit(incomeN, debtsN, savingsPct, fixedN)
  const next = () => setStep((s) => s + 1)

  const finish = async (dailyLimit?: number) => {
    if (busy) return
    setBusy(true)
    // Cuenta + perfil juntos: si algo falla, no quedan a medias
    await db.transaction('rw', db.accounts, db.profiles, async () => {
    await createAccount(userId, {
      name: accName || 'Nómina',
      type: 'banco',
      currency,
      initialBalance: parseAmount(accBalance),
      isPrimary: true,
    })
    await db.profiles.put({
      userId,
      name: name.trim() || 'Tú',
      avatar,
      xp: 0,
      currency,
      rates: {},
      monthlyIncome: incomeN,
      payday: incomeN ? payday : undefined,
      monthlyDebtPayments: hasDebts ? debtsN : undefined,
      debtItems: hasDebts ? debtItems : [],
      fixedExpenses: fixedItems,
      savingsPct: incomeN ? savingsPct : undefined,
      dailyLimit: dailyLimit && dailyLimit > 0 ? dailyLimit : undefined,
      onboarded: true,
    })
    })
    await addXp(userId, XP.onboarding, 'Bienvenida')
    celebrate.emit({ kind: 'levelup', level: 1 })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div key={i} className="h-1.5 flex-1 rounded-full" animate={{ background: i <= step ? '#8b5cf6' : '#2a2a42' }} />
          ))}
        </div>
        {step >= 2 && step < TOTAL - 1 && (
          <button type="button" onClick={next} className="text-sm font-bold text-muted">
            Saltar
          </button>
        )}
        {step === TOTAL - 1 && (
          <button type="button" onClick={() => finish(undefined)} className="text-sm font-bold text-muted">
            Saltar
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ x: 80, opacity: 0, rotate: 2 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          exit={{ x: -80, opacity: 0, rotate: -2 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="flex flex-1 flex-col pt-8"
        >
          {step === 0 && (
            <Card emoji="👋" title="¿Cómo te llamas?">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="rounded-2xl border border-line bg-card px-4 py-4 text-2xl font-extrabold"
              />
              <p className="mt-6 mb-3 font-bold text-muted">Elige tu compañero</p>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map((_, i) => (
                  <motion.div key={i} animate={{ scale: avatar === i ? 1.15 : 1, opacity: avatar === i ? 1 : 0.55 }}>
                    <Avatar index={i} size={46} onClick={() => setAvatar(i)} />
                  </motion.div>
                ))}
              </div>
              <Bottom>
                <BigButton onClick={next} disabled={!name.trim()}>
                  Siguiente
                </BigButton>
              </Bottom>
            </Card>
          )}

          {step === 1 && (
            <Card emoji="🏦" title="¿Cuál es tu cuenta de nómina?" sub="Será tu cuenta principal ★ y su moneda, tu moneda principal.">
              <div className="mb-4">
                <CurrencyPicker value={currency} onChange={chooseCurrency} />
              </div>
              <input
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Ej: Bancolombia nómina"
                className="rounded-2xl border border-line bg-card px-4 py-3.5 text-lg font-extrabold"
              />
              <p className="mt-4 text-sm font-bold text-muted">¿Cuánto tiene hoy?</p>
              <Amount value={accBalance} />
              <NumPad value={accBalance} onChange={setAccBalance} />
              <Bottom>
                <BigButton onClick={next}>Siguiente</BigButton>
              </Bottom>
            </Card>
          )}

          {step === 2 && (
            <Card emoji="💼" title="¿Cuánto ganas al mes?">
              <Amount value={income} />
              <NumPad value={income} onChange={setIncome} />
              <p className="mt-4 text-sm font-bold text-muted">Día de cobro: {payday}</p>
              <input
                type="range"
                min={1}
                max={31}
                value={payday}
                onChange={(e) => setPayday(Number(e.target.value))}
                className="mt-2 w-full accent-[#8b5cf6]"
              />
              <Bottom>
                <BigButton onClick={next} disabled={!incomeN}>
                  Siguiente
                </BigButton>
              </Bottom>
            </Card>
          )}

          {step === 3 && (
            <Card emoji="💳" title="¿Pagas deudas cada mes?" sub="Tarjetas, créditos, préstamos… Solo la cuota mensual; el saldo total lo agregas luego en Deudas.">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: 'Sí', emoji: '😅' },
                  { v: false, label: 'No', emoji: '😎' },
                ].map((o) => (
                  <motion.button
                    key={o.label}
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={() => {
                      setHasDebts(o.v)
                      if (!o.v) next()
                    }}
                    className={`rounded-3xl border-2 py-6 text-xl font-black ${
                      hasDebts === o.v ? 'border-accent bg-accent/15' : 'border-line bg-card'
                    }`}
                  >
                    <div className="text-4xl">{o.emoji}</div>
                    {o.label}
                  </motion.button>
                ))}
              </div>
              {hasDebts && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex flex-1 flex-col">
                  <MonthlyItems
                    items={debtItems}
                    onChange={setDebtItems}
                    presets={DEBT_PRESETS}
                    question="¿Cuánto pagas cada mes de"
                    hint="Toca cada deuda y escribe el valor de su cuota mensual en dinero (no el número de cuotas)."
                  />
                  <Bottom>
                    <BigButton onClick={next} disabled={debtItems.length === 0}>
                      Siguiente
                    </BigButton>
                  </Bottom>
                </motion.div>
              )}
            </Card>
          )}

          {step === 4 && (
            <Card emoji="📌" title="¿Qué pagas fijo cada mes?" sub="Lo que sale sí o sí: arriendo, servicios, suscripciones…">
              <MonthlyItems
                items={fixedItems}
                onChange={setFixedItems}
                presets={FIXED_PRESETS}
                question="¿Cuánto pagas al mes de"
                hint="Puedes renombrarlos: toca “Netflix, Spotify…” y escribe “Netflix”. Si un pago no aparece, usa “Otro”."
              />
              <p className="mt-3 text-xs text-muted">
                💡 Cuando registres un gasto de estas categorías, no se descuenta de tu límite diario: ya está presupuestado aquí.
              </p>
              <Bottom>
                <BigButton onClick={next}>{fixedItems.length ? 'Siguiente' : 'No tengo gastos fijos'}</BigButton>
              </Bottom>
            </Card>
          )}

          {step === 5 && (
            <Card emoji="🐷" title="¿Cuánto quieres ahorrar?" sub="Un porcentaje de tu ingreso mensual.">
              <motion.p key={savingsPct} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="text-center text-7xl font-black text-good">
                {savingsPct}%
              </motion.p>
              {incomeN && <p className="text-center font-bold text-muted">{money((incomeN * savingsPct) / 100)} al mes</p>}
              <input
                type="range"
                min={0}
                max={30}
                value={savingsPct}
                onChange={(e) => setSavingsPct(Number(e.target.value))}
                className="mt-6 w-full accent-[#34d399]"
              />
              <Bottom>
                <BigButton onClick={next}>Siguiente</BigButton>
              </Bottom>
            </Card>
          )}

          {step === 6 && (
            <LimitStep
              income={incomeN}
              debts={debtsN}
              fixed={fixedN}
              savingsPct={savingsPct}
              suggested={suggested}
              limit={limit}
              setLimit={setLimit}
              onFinish={finish}
              busy={busy}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function LimitStep({
  income,
  debts,
  fixed,
  savingsPct,
  suggested,
  limit,
  setLimit,
  onFinish,
  busy,
}: {
  income?: number
  debts: number
  fixed: number
  savingsPct: number
  suggested?: number
  limit: number | null
  setLimit: (n: number) => void
  onFinish: (n?: number) => void
  busy: boolean
}) {
  if (!income || suggested === undefined) {
    return (
      <Card emoji="🎯" title="Límite diario" sub="Sin tu ingreso no podemos sugerirlo. Puedes definirlo después en tu Perfil.">
        <Bottom>
          <BigButton onClick={() => onFinish(undefined)} disabled={busy}>
            Empezar 🚀
          </BigButton>
        </Bottom>
      </Card>
    )
  }

  const saving = (income * savingsPct) / 100
  const free = income - debts - fixed - saving
  const breakdown = (
    <div className="rounded-2xl bg-card p-4 text-sm font-bold tabular-nums">
      <Line delay={0.1} label="Ingreso" value={money(income)} />
      <Line delay={0.3} label="− Cuotas de deudas" value={money(debts)} tone="text-bad" />
      <Line delay={0.5} label="− Gastos fijos" value={money(fixed)} tone="text-bad" />
      <Line delay={0.7} label={`− Ahorro (${savingsPct}%)`} value={money(saving)} tone="text-good" />
      <div className="my-2 h-px bg-line" />
      <Line delay={0.9} label="Libre para el día a día" value={money(free)} tone={free > 0 ? 'text-ink' : 'text-bad'} />
      {free > 0 && <Line delay={1.0} label="÷ 30 días" value="" />}
    </div>
  )

  if (suggested <= 0) {
    return (
      <Card emoji="⚠️" title="Tus pagos superan tu ingreso" sub="No te preocupes: en la pestaña Deudas armamos un plan para salir más rápido.">
        {breakdown}
        <Bottom>
          <BigButton onClick={() => onFinish(undefined)} disabled={busy}>
            Empezar sin límite
          </BigButton>
        </Bottom>
      </Card>
    )
  }

  const value = limit ?? suggested
  const max = Math.max(suggested * 2, 10)
  return (
    <Card emoji="🎯" title="Tu límite diario sugerido">
      {breakdown}
      <motion.p
        key={value}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: limit === null ? 1.2 : 0, type: 'spring', damping: 10 }}
        className="mt-5 text-center text-6xl font-black"
      >
        {money(value)}
        <span className="text-xl text-muted">/día</span>
      </motion.p>
      <input
        type="range"
        min={0}
        max={max}
        step={Math.max(1, Math.round(max / 100))}
        value={value}
        onChange={(e) => setLimit(Number(e.target.value))}
        className="mt-6 w-full accent-[#8b5cf6]"
      />
      <Bottom>
        <BigButton onClick={() => onFinish(value)} disabled={busy}>
          Usar {money(value)} 🚀
        </BigButton>
      </Bottom>
    </Card>
  )
}

function Line({ label, value, delay, tone = 'text-ink' }: { label: string; value: string; delay: number; tone?: string }) {
  return (
    <motion.div className="flex justify-between gap-3 py-0.5" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay }}>
      <span className="text-muted">{label}</span>
      <span className={tone}>{value}</span>
    </motion.div>
  )
}

function Card({ emoji, title, sub, children }: { emoji: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10, delay: 0.1 }} className="text-5xl">
        {emoji}
      </motion.div>
      <h1 className="mt-3 text-3xl font-black">{title}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </div>
  )
}

function Amount({ value }: { value: string }) {
  return (
    <p className="my-3 text-center text-5xl font-black tabular-nums">
      <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(getMainCurrency())}</span>
      {formatTyping(value)}
    </p>
  )
}

function Bottom({ children }: { children: ReactNode }) {
  return <div className="mt-auto pt-6">{children}</div>
}
