import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AccountType } from '../lib/db'
import { ACCOUNT_TYPES } from '../lib/catalog'
import { addXp, createAccount, setRate, XP } from '../lib/actions'
import { useData } from '../lib/data'
import { currencySymbol, formatTyping, parseAmount } from '../lib/format'
import { rateOf } from '../lib/finance'
import { BigButton, NumPad, Sheet } from './ui'
import { CurrencyPicker, RateInput } from './currency'

export function NewAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Nueva cuenta">
      {open && <Wizard onDone={onClose} />}
    </Sheet>
  )
}

const STEPS = 4

function Wizard({ onDone }: { onDone: () => void }) {
  const { userId, main, profile } = useData()
  const [step, setStep] = useState(0)
  const [type, setType] = useState<AccountType>('banco')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(main)
  const [rate, setRateValue] = useState<number | undefined>(undefined)
  const [balance, setBalance] = useState('')

  const knownRate = rateOf(currency, main, profile.rates)
  const needsRate = currency !== main && !knownRate

  const finish = async () => {
    if (needsRate && rate) await setRate(userId, currency, rate)
    await createAccount(userId, { name, type, currency, initialBalance: parseAmount(balance) })
    await addXp(userId, XP.newAccount, 'Nueva cuenta')
    onDone()
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: STEPS }).map((_, i) => (
          <motion.div key={i} className="h-1.5 flex-1 rounded-full" animate={{ background: i <= step ? '#8b5cf6' : '#2a2a42' }} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {step === 0 && (
            <>
              <p className="mb-3 font-bold text-muted">¿Qué tipo de cuenta es?</p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
                  <motion.button
                    key={t}
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={() => {
                      setType(t)
                      setStep(1)
                    }}
                    className="flex flex-col items-center gap-2 rounded-3xl border-2 p-5 font-extrabold"
                    style={{ borderColor: ACCOUNT_TYPES[t].color + '80', background: ACCOUNT_TYPES[t].color + '1a' }}
                  >
                    <span className="text-4xl">{ACCOUNT_TYPES[t].emoji}</span>
                    {ACCOUNT_TYPES[t].label}
                  </motion.button>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setStep(2)
              }}
              className="flex flex-col gap-4"
            >
              <p className="font-bold text-muted">¿Cómo se llama?</p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'banco' ? 'Ej: Bancolombia' : ACCOUNT_TYPES[type].label}
                className="rounded-2xl border border-line bg-card2 px-4 py-4 text-xl font-extrabold"
              />
              <BigButton type="submit">Siguiente</BigButton>
            </form>
          )}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="font-bold text-muted">¿En qué moneda está?</p>
              <CurrencyPicker
                value={currency}
                onChange={(c) => {
                  setCurrency(c)
                  setRateValue(undefined)
                }}
              />
              <AnimatePresence>
                {needsRate && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <p className="mb-2 text-sm text-muted">
                      Tasa de cambio para sumarla a tus totales en {main}. Opcional: si la dejas vacía, la app la aprende con tu primera transferencia.
                    </p>
                    <RateInput key={currency} foreign={currency} main={main} onChange={setRateValue} />
                  </motion.div>
                )}
              </AnimatePresence>
              <BigButton onClick={() => setStep(3)}>Siguiente</BigButton>
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="font-bold text-muted">¿Cuánto dinero tiene hoy?</p>
              <p className="text-center text-5xl font-black tabular-nums">
                <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(currency)}</span>
                {formatTyping(balance)}
                <span className="ml-1 text-lg opacity-70">{currency}</span>
              </p>
              <NumPad value={balance} onChange={setBalance} />
              <BigButton onClick={finish}>Crear cuenta {ACCOUNT_TYPES[type].emoji}</BigButton>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
