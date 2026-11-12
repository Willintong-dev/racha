import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useData } from '../lib/data'
import type { Debt } from '../lib/db'
import { DEBT_PRESETS } from '../lib/catalog'
import { createDebt, updateDebt } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { currencySymbol, formatTyping, money, parseAmount } from '../lib/format'
import { parseLocaleNumber } from '../lib/parse'
import { BigButton, Chip, NumPad } from './ui'

export interface DebtSeed {
  name?: string
  emoji?: string
  monthlyPayment?: number
}

const STEPS = 4

/**
 * Crear o editar una deuda en 4 tarjetas. Con `seed` se precarga desde una cuota del onboarding;
 * con `debt` se edita una existente.
 */
export function DebtWizard({ seed, debt, onDone }: { seed?: DebtSeed; debt?: Debt; onDone: (d?: Debt) => void }) {
  const { userId, accounts, balances } = useData()
  const active = accounts.filter((a) => !a.archived)
  const primary = active.find((a) => a.isPrimary) ?? active[0]

  const [step, setStep] = useState(0)
  const [emoji, setEmoji] = useState(debt?.emoji ?? seed?.emoji ?? '💳')
  const [name, setName] = useState(debt?.name ?? seed?.name ?? '')
  const [accountId, setAccountId] = useState(debt?.payFromAccountId ?? primary?.id)
  const [balance, setBalance] = useState(debt ? String(debt.balance) : '')
  const [monthly, setMonthly] = useState(
    debt ? String(debt.monthlyPayment) : seed?.monthlyPayment ? String(seed.monthlyPayment) : '',
  )
  const [dueDay, setDueDay] = useState(debt?.dueDay ?? 15)
  const [rateMode, setRateMode] = useState<'anual' | 'mensual'>('anual')
  const [rateText, setRateText] = useState(debt?.annualRate ? String(debt.annualRate).replace('.', ',') : '')
  const [busy, setBusy] = useState(false)

  const account = accounts.find((a) => a.id === accountId)
  const currency = account?.currency ?? 'COP'
  const balanceN = parseAmount(balance)
  const monthlyN = parseAmount(monthly)
  const rateN = parseLocaleNumber(rateText.replace('%', ''))
  // El simulador trabaja con tasa nominal anual: una tasa mensual se multiplica por 12
  const annualRate = rateN > 0 ? (rateMode === 'mensual' ? rateN * 12 : rateN) : undefined
  const monthlyInterest = annualRate ? (balanceN * annualRate) / 100 / 12 : 0
  const cuotaTooLow = annualRate !== undefined && monthlyN > 0 && monthlyN <= monthlyInterest

  const save = async () => {
    if (busy || !accountId) return
    setBusy(true)
    const data = {
      name: name.trim() || 'Deuda',
      emoji,
      currency,
      balance: balanceN,
      monthlyPayment: monthlyN,
      dueDay,
      annualRate,
      payFromAccountId: accountId,
    }
    if (debt) {
      await updateDebt(debt.id, data)
      celebrate.emit({ kind: 'info', text: 'Deuda actualizada ✓' })
      onDone()
    } else {
      onDone(await createDebt(userId, data))
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: STEPS }).map((_, i) => (
          <motion.button
            key={i}
            type="button"
            aria-label={`Paso ${i + 1}`}
            onClick={() => i < step && setStep(i)}
            className="h-1.5 flex-1 rounded-full"
            animate={{ background: i <= step ? '#8b5cf6' : '#2a2a42' }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-4"
        >
          {step === 0 && (
            <>
              <p className="font-bold text-muted">¿Qué tipo de deuda es?</p>
              <div className="flex flex-wrap gap-2">
                {DEBT_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    active={emoji === p.emoji && (name === p.name || !DEBT_PRESETS.some((x) => x.name === name))}
                    onClick={() => {
                      setEmoji(p.emoji)
                      if (!name || DEBT_PRESETS.some((x) => x.name === name)) setName(p.name)
                    }}
                  >
                    {p.emoji} {p.name}
                  </Chip>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-card2 px-3">
                <span className="text-2xl">{emoji}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Tarjeta Visa Bancolombia"
                  className="min-w-0 flex-1 bg-transparent py-3.5 text-lg font-extrabold"
                />
              </div>
              <BigButton onClick={() => setStep(1)} disabled={!name.trim()}>
                Siguiente
              </BigButton>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">Se paga desde</p>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                  {active.map((a) => (
                    <Chip key={a.id} active={accountId === a.id} color={a.color} onClick={() => setAccountId(a.id)}>
                      {a.isPrimary && '★ '}
                      {a.name}
                      <span className="font-semibold opacity-70">{money(balances.get(a.id) ?? 0, { currency: a.currency })}</span>
                    </Chip>
                  ))}
                </div>
              </div>
              <p className="font-bold text-muted">¿Cuánto debes hoy en total?</p>
              <Amount value={balance} currency={currency} />
              <NumPad value={balance} onChange={setBalance} />
              <p className="-mt-1 text-xs text-muted">Es el saldo pendiente que aparece en tu extracto o app del banco.</p>
              <BigButton onClick={() => setStep(2)} disabled={balanceN <= 0}>
                Siguiente
              </BigButton>
            </>
          )}

          {step === 2 && (
            <>
              <p className="font-bold text-muted">¿Cuánto pagas de cuota cada mes?</p>
              <Amount value={monthly} currency={currency} suffix="/mes" />
              <NumPad value={monthly} onChange={setMonthly} />
              <div>
                <p className="text-sm font-bold">
                  Vence el día <span className="text-accent">{dueDay}</span> de cada mes
                </p>
                <input
                  type="range"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="mt-2 w-full accent-[#8b5cf6]"
                />
              </div>
              {monthlyN > balanceN && balanceN > 0 && (
                <p className="text-xs font-bold text-warn">La cuota es mayor que lo que debes: la liquidas con un solo pago.</p>
              )}
              <BigButton onClick={() => setStep(3)} disabled={monthlyN <= 0}>
                Siguiente
              </BigButton>
            </>
          )}

          {step === 3 && (
            <>
              <p className="font-bold text-muted">¿Qué tasa de interés tiene? (opcional)</p>
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card2 p-1">
                {(['anual', 'mensual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRateMode(m)}
                    className={`rounded-xl py-2 text-sm font-extrabold ${rateMode === m ? 'bg-accent text-white' : 'text-muted'}`}
                  >
                    {m === 'anual' ? 'Anual (E.A. / TEA)' : 'Mensual (M.V.)'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-card2 px-4">
                <input
                  inputMode="decimal"
                  value={rateText}
                  onChange={(e) => setRateText(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder={rateMode === 'anual' ? 'Ej: 28,5' : 'Ej: 2,1'}
                  className="min-w-0 flex-1 bg-transparent py-4 text-3xl font-black"
                />
                <span className="text-2xl font-black text-muted">%</span>
              </div>
              <p className="text-xs text-muted">
                Aparece en tu extracto. Sirve para que el simulador sepa qué deuda te cuesta más. Si no la sabes, déjala vacía.
              </p>
              {annualRate !== undefined && balanceN > 0 && (
                <p className="rounded-2xl bg-card2 p-3 text-sm">
                  Este mes te cobran unos <b className="text-bad">{money(monthlyInterest, { currency })}</b> de intereses.
                </p>
              )}
              {cuotaTooLow && (
                <p className="text-sm font-bold text-bad">
                  ⚠️ Tu cuota no alcanza a cubrir los intereses: la deuda crece cada mes. Revisa el simulador.
                </p>
              )}
              <BigButton onClick={save} disabled={busy}>
                {debt ? 'Guardar cambios' : `Registrar deuda ${emoji}`}
              </BigButton>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Amount({ value, currency, suffix }: { value: string; currency: string; suffix?: string }) {
  return (
    <p className="text-center text-5xl font-black tabular-nums">
      <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(currency)}</span>
      {formatTyping(value)}
      {suffix && <span className="ml-1 text-lg text-muted">{suffix}</span>}
    </p>
  )
}
