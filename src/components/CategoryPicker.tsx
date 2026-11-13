import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useData } from '../lib/data'
import type { CustomCategory } from '../lib/db'
import { categoriesFor, CUSTOM_COLORS, CUSTOM_NAME_MAX, isOtros, otrosOf } from '../lib/catalog'

/** Ícono por defecto de una categoría nueva (neutro) */
const DEFAULT_EMOJI = '🏷️'
import { uid } from '../lib/format'
import { deleteCustomCategory, saveCustomCategory } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { Chip } from './ui'
import { EmojiGrid } from './EmojiGrid'

type Kind = 'gasto' | 'ingreso'
/** Panel abierto: crear una categoría desde "Otros" o editar una propia */
type Panel = { edit?: CustomCategory } | null

const LONG_PRESS_MS = 500

/**
 * Selector de categoría del registro rápido.
 * Tocar "Otros" lo deja elegido de una (nunca bloquea guardar) y abre un mini panel opcional
 * para ponerle nombre e ícono: así nace una categoría propia que queda para la próxima.
 * Mantener presionada una categoría propia permite editarla o borrarla.
 */
export function CategoryPicker({
  kind,
  value,
  onChange,
  usage,
}: {
  kind: Kind
  value?: string
  onChange: (id: string) => void
  /** Veces que se usó cada categoría: las más usadas van primero */
  usage: Map<string, number>
}) {
  const { userId, profile } = useData()
  const custom = profile.customCategories ?? []
  const otros = otrosOf(kind)
  const list = categoriesFor(kind, custom)
  // Más usadas primero, pero "Otros" siempre al final (es la puerta para crear categorías)
  const cats = [
    ...list.filter((c) => !isOtros(c.id)).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)),
    otros,
  ]

  const [panel, setPanel] = useState<Panel>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const press = useRef<number | undefined>(undefined)
  const pressed = useRef(false)

  const openNew = () => {
    setName('')
    setEmoji(DEFAULT_EMOJI)
    setConfirmDelete(false)
    setPanel({})
  }
  const openEdit = (c: CustomCategory) => {
    navigator.vibrate?.(20)
    setName(c.name)
    setEmoji(c.emoji)
    setConfirmDelete(false)
    setPanel({ edit: c })
  }

  const tap = (id: string) => {
    // El click que sigue a una pulsación larga no debe hacer nada más
    if (pressed.current) {
      pressed.current = false
      return
    }
    onChange(id)
    if (id === otros.id) {
      if (panel && !panel.edit) setPanel(null)
      else openNew()
    } else if (panel) setPanel(null)
  }

  const startPress = (c: CustomCategory) => {
    window.clearTimeout(press.current)
    pressed.current = false
    press.current = window.setTimeout(() => {
      pressed.current = true
      openEdit(c)
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => window.clearTimeout(press.current)

  const clean = name.trim().slice(0, CUSTOM_NAME_MAX)

  const submit = async () => {
    if (!clean) return
    const edit = panel?.edit
    if (edit) {
      await saveCustomCategory(userId, { ...edit, name: clean, emoji })
      celebrate.emit({ kind: 'info', text: 'Categoría actualizada' })
    } else {
      // Si ya existe una con ese nombre, la reusamos en vez de duplicarla
      const same = custom.find((c) => c.kind === kind && c.name.toLowerCase() === clean.toLowerCase())
      const cat: CustomCategory = same ?? {
        id: 'c_' + uid(),
        name: clean,
        emoji,
        color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length],
        kind,
      }
      if (!same) {
        await saveCustomCategory(userId, cat)
        celebrate.emit({ kind: 'info', text: `${cat.emoji} ${cat.name} creada` })
      }
      onChange(cat.id)
    }
    navigator.vibrate?.([10, 30, 10])
    setPanel(null)
  }

  const remove = async () => {
    const edit = panel?.edit
    if (!edit) return
    if (!confirmDelete) return setConfirmDelete(true)
    await deleteCustomCategory(userId, edit.id)
    if (value === edit.id) onChange(otros.id)
    celebrate.emit({ kind: 'info', text: `${edit.name} eliminada · sus movimientos quedan en Otros` })
    setPanel(null)
  }

  return (
    <div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {cats.map((c) => {
          const mine = custom.find((x) => x.id === c.id)
          return (
            <span
              key={c.id}
              className="shrink-0"
              data-cat={c.id}
              onPointerDown={mine ? () => startPress(mine) : undefined}
              onPointerUp={mine ? cancelPress : undefined}
              onPointerLeave={mine ? cancelPress : undefined}
              onPointerCancel={mine ? cancelPress : undefined}
              onContextMenu={
                mine
                  ? (ev) => {
                      ev.preventDefault()
                      cancelPress()
                      openEdit(mine)
                    }
                  : undefined
              }
            >
              <Chip active={value === c.id} color={c.color} onClick={() => tap(c.id)}>
                <span>{c.emoji}</span>
                {c.name}
                {isOtros(c.id) && <span className="opacity-60">＋</span>}
              </Chip>
            </span>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {panel && (
          <motion.div
            key={panel.edit?.id ?? 'new'}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-card2 p-3">
              <div className="flex items-center gap-2">
                <motion.span key={emoji} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="text-3xl">
                  {emoji}
                </motion.span>
                <input
                  value={name}
                  maxLength={CUSTOM_NAME_MAX}
                  onChange={(ev) => setName(ev.target.value)}
                  onKeyDown={(ev) => ev.key === 'Enter' && submit()}
                  placeholder={panel.edit ? 'Nombre' : '¿Qué fue? Ej: Mascota'}
                  aria-label="Nombre de la categoría"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 font-bold"
                />
              </div>
              <EmojiGrid value={emoji} onPick={setEmoji} />
              <div className="flex gap-2">
                {panel.edit ? (
                  <button
                    type="button"
                    onClick={remove}
                    className={`rounded-xl px-3 py-2.5 text-sm font-bold ${confirmDelete ? 'bg-bad text-white' : 'bg-bad/15 text-bad'}`}
                  >
                    {confirmDelete ? '¿Seguro? Toca otra vez' : 'Eliminar'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setPanel(null)} className="rounded-xl bg-card px-3 py-2.5 text-sm font-bold text-muted">
                    Solo "Otros"
                  </button>
                )}
                <motion.button
                  type="button"
                  whileTap={clean ? { scale: 0.95 } : undefined}
                  disabled={!clean}
                  onClick={submit}
                  className="grad flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
                >
                  {panel.edit ? 'Guardar' : 'Crear'}
                </motion.button>
              </div>
              {!panel.edit && custom.some((c) => c.kind === kind) && (
                <p className="text-center text-[11px] text-muted">Mantén presionada una categoría tuya para editarla.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
