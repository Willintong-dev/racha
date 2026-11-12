import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import type { MonthlyItem } from '../lib/db'
import type { MonthlyPreset } from '../lib/catalog'
import { currencySymbol, formatTyping, getMainCurrency, money, parseAmount, uid } from '../lib/format'
import { sumItems } from '../lib/finance'
import { AnimatedMoney, BigButton, NumPad } from './ui'

/**
 * Lista de pagos mensuales armada a punta de toques:
 * tocas un chip → escribes cuánto pagas AL MES → queda en la lista con el total sumado.
 */
export function MonthlyItems({
  items,
  onChange,
  presets,
  question,
  hint,
}: {
  items: MonthlyItem[]
  onChange: (items: MonthlyItem[]) => void
  presets: MonthlyPreset[]
  /** Ej: "¿Cuánto pagas al mes de" → "¿Cuánto pagas al mes de Arriendo?" */
  question: string
  hint?: string
}) {
  const [editing, setEditing] = useState<{ preset: MonthlyPreset; name: string; amount: string; id?: string } | null>(null)
  const total = sumItems(items)

  const save = () => {
    if (!editing) return
    const amount = parseAmount(editing.amount)
    if (amount <= 0) return
    const item: MonthlyItem = {
      id: editing.id ?? uid(),
      name: editing.name.trim() || editing.preset.name,
      emoji: editing.preset.emoji,
      categoryId: editing.preset.categoryId,
      amount,
    }
    onChange(editing.id ? items.map((i) => (i.id === editing.id ? item : i)) : [...items, item])
    setEditing(null)
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div
          key="edit"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-card2 px-3">
            <span className="text-2xl">{editing.preset.emoji}</span>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder={editing.preset.name}
              className="min-w-0 flex-1 bg-transparent py-3 text-lg font-extrabold"
            />
          </div>
          <p className="text-sm font-bold text-muted">
            {question} <span className="text-ink">{editing.name || editing.preset.name}</span>?
          </p>
          <p className="text-center text-5xl font-black tabular-nums">
            <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(getMainCurrency())}</span>
            {formatTyping(editing.amount)}
            <span className="ml-1 text-lg text-muted">/mes</span>
          </p>
          <NumPad value={editing.amount} onChange={(amount) => setEditing({ ...editing, amount })} />
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-2xl bg-card2 px-5 font-bold text-muted">
              Cancelar
            </button>
            <BigButton onClick={save} disabled={parseAmount(editing.amount) <= 0}>
              {editing.id ? 'Guardar' : 'Agregar'}
            </BigButton>
          </div>
        </motion.div>
      ) : (
        <motion.div key="list" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          {hint && <p className="mb-3 rounded-2xl bg-accent/10 p-3 text-sm font-semibold text-ink/90">{hint}</p>}
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <motion.button
                key={p.name}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setEditing({ preset: p, name: p.name, amount: '' })}
                className="flex items-center gap-1.5 rounded-full border border-line bg-card2 px-3.5 py-2 text-sm font-bold"
              >
                <span>{p.emoji}</span>
                {p.name}
                <Plus size={14} className="text-muted" />
              </motion.button>
            ))}
          </div>

          {items.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-3xl bg-card">
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <motion.div
                    key={i.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() =>
                        setEditing({
                          preset: { name: i.name, emoji: i.emoji, categoryId: i.categoryId },
                          name: i.name,
                          amount: String(i.amount),
                          id: i.id,
                        })
                      }
                    >
                      <span className="text-xl">{i.emoji}</span>
                      <span className="flex-1 truncate font-bold">{i.name}</span>
                      <span className="font-extrabold tabular-nums">{money(i.amount)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${i.name}`}
                      onClick={() => onChange(items.filter((x) => x.id !== i.id))}
                      className="p-1 text-muted"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="flex items-center justify-between bg-card2 px-4 py-3">
                <span className="font-bold text-muted">Total al mes</span>
                <AnimatedMoney value={total} className="text-lg font-black tabular-nums" />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
