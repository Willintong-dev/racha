import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Plus, X } from 'lucide-react'
import type { CustomCategory, MonthlyItem } from '../lib/db'
import { categoryForName, CUSTOM_NAME_MAX, type MonthlyPreset } from '../lib/catalog'
import { currencySymbol, formatTyping, getMainCurrency, money, parseAmount, uid } from '../lib/format'
import { monthlyImpact, sumItems, type ImpactBase } from '../lib/finance'
import { AnimatedMoney, BigButton, NumPad } from './ui'
import { EmojiGrid } from './EmojiGrid'

type Editing = {
  preset: MonthlyPreset
  name: string
  emoji: string
  amount: string
  id?: string
  categoryId?: string
  /** Cuadrícula de íconos abierta */
  picking: boolean
}

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
  categories,
  impact,
}: {
  items: MonthlyItem[]
  onChange: (items: MonthlyItem[]) => void
  presets: MonthlyPreset[]
  /** Ej: "¿Cuánto pagas al mes de" → "¿Cuánto pagas al mes de Arriendo?" */
  question: string
  hint?: string
  /**
   * Gastos fijos: un "Otro" con nombre propio queda atado a una categoría de gasto (existente o nueva),
   * así lo que registres en ella no cuenta contra el límite diario. `existing` incluye las aún sin guardar.
   */
  categories?: { existing: CustomCategory[]; onCreate: (cat: CustomCategory) => void }
  /** Muestra en vivo cómo cambia tu límite diario mientras escribes el monto. `noun`: "este gasto" / "esta cuota". */
  impact?: ImpactBase & { noun: string }
}) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const total = sumItems(items)

  const start = (p: MonthlyPreset) =>
    setEditing({ preset: p, name: p.custom ? '' : p.name, emoji: p.emoji, amount: '', categoryId: p.categoryId, picking: !!p.custom })

  const save = () => {
    if (!editing) return
    const amount = parseAmount(editing.amount)
    if (amount <= 0) return
    const name = editing.name.trim() || editing.preset.name
    let categoryId = editing.categoryId
    // "Otro" con nombre propio → su propia categoría (o la que ya se llame igual). Si se queda en "Otro", sin categoría.
    const generic = presets.find((p) => p.custom)?.name.toLocaleLowerCase()
    if (categories && !categoryId && editing.preset.custom && name.toLocaleLowerCase() !== generic) {
      const { cat, isNew } = categoryForName(name, editing.emoji, categories.existing, 'c_' + uid())
      if (isNew) categories.onCreate(cat)
      categoryId = cat.id
    }
    const item: MonthlyItem = { id: editing.id ?? uid(), name, emoji: editing.emoji, categoryId, amount }
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
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => setEditing({ ...editing, picking: !editing.picking })}
              aria-label="Cambiar ícono"
              aria-expanded={editing.picking}
              className={`relative -ml-1 grid size-11 shrink-0 place-items-center rounded-xl ${editing.picking ? 'bg-accent/25 ring-2 ring-accent' : 'bg-card'}`}
            >
              <motion.span key={editing.emoji} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="text-2xl">
                {editing.emoji}
              </motion.span>
              <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-accent text-white">
                <Pencil size={9} strokeWidth={3} />
              </span>
            </motion.button>
            <input
              value={editing.name}
              autoFocus={editing.preset.custom && !editing.id}
              maxLength={editing.preset.custom ? CUSTOM_NAME_MAX : undefined}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder={editing.preset.custom ? (presets.find((p) => p.custom)?.placeholder ?? 'Nombre') : editing.preset.name}
              aria-label="Nombre"
              className="min-w-0 flex-1 bg-transparent py-3 text-lg font-extrabold"
            />
          </div>
          <AnimatePresence initial={false}>
            {editing.picking && (
              <motion.div
                key="emojis"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-line bg-card2 p-3">
                  <EmojiGrid
                    value={editing.emoji}
                    onPick={(emoji) => {
                      navigator.vibrate?.(10)
                      setEditing({ ...editing, emoji, picking: false })
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-sm font-bold text-muted">
            {question} <span className="text-ink">{editing.name || editing.preset.name}</span>?
          </p>
          <p className="text-center text-5xl font-black tabular-nums">
            <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(getMainCurrency())}</span>
            {formatTyping(editing.amount)}
            <span className="ml-1 text-lg text-muted">/mes</span>
          </p>
          {impact && <ImpactLine impact={impact} before={total} after={total - (items.find((i) => i.id === editing.id)?.amount ?? 0) + parseAmount(editing.amount)} />}
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
                onClick={() => start(p)}
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
                          // Sin categoría = uno inventado ("Otro"/deuda): al guardarlo con nombre propio gana categoría
                          preset: { name: i.name, emoji: i.emoji, categoryId: i.categoryId, custom: !i.categoryId },
                          name: i.name,
                          emoji: i.emoji,
                          amount: String(i.amount),
                          id: i.id,
                          categoryId: i.categoryId,
                          picking: false,
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

/** "Tu límite diario pasa de $50 a $43" en vivo, o aviso en rojo si los pagos superan el ingreso */
function ImpactLine({ impact, before, after }: { impact: ImpactBase & { noun: string }; before: number; after: number }) {
  const r = monthlyImpact(impact, before, after)
  if (!r) return <p className="text-center text-xs text-muted">Agrega tu ingreso en Perfil para ver el impacto en tu límite diario.</p>
  if (r.over > 0)
    return (
      <p data-impact="over" className="rounded-xl bg-bad/15 px-3 py-2 text-center text-sm font-bold text-bad">
        Con {impact.noun} tus pagos fijos superan tu ingreso por {money(r.over)}
      </p>
    )
  return (
    <div data-impact="ok" className="rounded-xl bg-card2 px-3 py-2 text-center text-sm">
      <p className="font-bold">
        {r.from === r.to ? (
          <>
            Tu límite diario se queda en <span className="text-accent">{money(r.to)}</span>
          </>
        ) : (
          <>
            Tu límite diario pasa de <span className="tabular-nums">{money(r.from)}</span> a{' '}
            <span className={`tabular-nums ${r.to < r.from ? 'text-warn' : 'text-good'}`}>{money(r.to)}</span>
          </>
        )}{' '}
        <span className="font-semibold text-muted">· ahorro sin cambios</span>
      </p>
      <p className="text-xs text-muted">
        Te quedarán <b className="text-ink">{money(r.budget)}</b> para el día a día este mes
      </p>
    </div>
  )
}
