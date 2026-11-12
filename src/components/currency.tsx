import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight, Search } from 'lucide-react'
import { currencyInfo, searchCurrencies } from '../lib/format'
import { parseLocaleNumber } from '../lib/parse'

export function CurrencyPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [q, setQ] = useState('')
  const list = searchCurrencies(q)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Si la moneda elegida está lejos en la lista (ej. QAR), la traemos a la vista
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div>
      <div className="relative mb-2">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar moneda o país (ej. Qatar, euro)"
          className="w-full rounded-xl border border-line bg-card2 py-2.5 pr-3 pl-9 text-sm font-semibold"
        />
      </div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
        {list.length === 0 && <p className="py-3 text-sm text-muted">No encontramos esa moneda.</p>}
        {list.map((c) => {
          const active = c.code === value
          return (
            <motion.button
              key={c.code}
              ref={active ? selectedRef : undefined}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange(c.code)}
              animate={{ scale: active ? 1.06 : 1 }}
              className={`flex shrink-0 flex-col items-center rounded-2xl border-2 px-3 py-2 ${
                active ? 'border-accent bg-accent/20' : 'border-line bg-card2'
              }`}
            >
              <span className="text-2xl leading-none">{c.flag}</span>
              <span className="mt-1 text-xs font-black">{c.code}</span>
            </motion.button>
          )
        })}
      </div>
      <p className="mt-1 text-sm font-bold text-muted">
        {currencyInfo(value).flag} {currencyInfo(value).name}
      </p>
    </div>
  )
}

const pretty = (n: number) => String(Number(n.toPrecision(6))).replace('.', ',')

/**
 * Tasa de cambio. Guarda siempre "1 extranjera = value principal", pero deja escribirla al revés
 * con ⇄ (ej. con principal USD es más fácil escribir "1 USD = 4.000 COP" que "1 COP = 0,00025 USD").
 */
export function RateInput({
  foreign,
  main,
  value,
  onChange,
}: {
  foreign: string
  main: string
  value?: number
  onChange: (rate: number | undefined) => void
}) {
  const [inverted, setInverted] = useState(value !== undefined && value < 1)
  const [text, setText] = useState(value ? pretty(inverted ? 1 / value : value) : '')

  const emit = (t: string, inv: boolean) => {
    const n = parseLocaleNumber(t)
    onChange(n > 0 ? (inv ? 1 / n : n) : undefined)
  }

  const [left, right] = inverted ? [main, foreign] : [foreign, main]
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-card2 p-3">
      <span className="shrink-0 font-extrabold">
        {currencyInfo(left).flag} 1 {left} =
      </span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '')
          setText(t)
          emit(t, inverted)
        }}
        placeholder="0"
        className="w-0 min-w-0 flex-1 rounded-xl bg-bg px-3 py-2 text-right text-lg font-black"
      />
      <span className="shrink-0 font-extrabold">{right}</span>
      <motion.button
        type="button"
        whileTap={{ rotate: 180, scale: 0.85 }}
        aria-label="Invertir tasa"
        onClick={() => {
          const n = parseLocaleNumber(text)
          const t = n > 0 ? pretty(1 / n) : ''
          setText(t)
          setInverted(!inverted)
          emit(t, !inverted)
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent"
      >
        <ArrowLeftRight size={16} />
      </motion.button>
    </div>
  )
}
