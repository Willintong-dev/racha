import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useData } from '../lib/data'
import type { Transaction, TxType } from '../lib/db'
import { catById } from '../lib/catalog'
import { dayLabel, money, monthLabel, todayStr, uid } from '../lib/format'
import { deleteTransaction, restoreTransaction, saveTransaction } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { Chip, Empty, Page } from '../components/ui'
import { TxRow } from '../components/TxRow'
import { useQuickAdd } from '../components/QuickAdd'

type TypeFilter = 'todos' | 'gasto' | 'ingreso' | 'transferencia' | 'pago_deuda'
type DonutKind = 'todo' | 'gasto' | 'ingreso'
/** Un trozo de la dona */
interface Seg {
  id: string
  value: number
  color: string
  emoji: string
  name: string
}

export function Movements() {
  const { txs, accounts, toMain, main, currencyOf } = useData()
  const quickAdd = useQuickAdd()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [type, setType] = useState<TypeFilter>('todos')
  const [cat, setCat] = useState<string | undefined>()
  /** Qué muestra la dona: gastos o ingresos por categoría */
  const [donutKind, setDonutKind] = useState<DonutKind>('todo')
  const [acc, setAcc] = useState<string | undefined>()
  const [q, setQ] = useState('')
  const [undo, setUndo] = useState<Transaction | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const monthTxs = useMemo(() => txs.filter((t) => t.date.startsWith(monthKey)), [txs, monthKey])

  const summary = useMemo(() => {
    let inc = 0
    let exp = 0
    let debt = 0
    let foreign = false
    const byCat = { gasto: new Map<string, number>(), ingreso: new Map<string, number>() }
    for (const t of monthTxs) {
      // Todo se suma en la moneda principal
      const v = toMain(t.amount, t.accountId)
      if (currencyOf(t.accountId) !== main && t.type !== 'transferencia') foreign = true
      if (t.type === 'pago_deuda') debt += v
      if (t.type === 'gasto' || t.type === 'ingreso') {
        if (t.type === 'gasto') exp += v
        else inc += v
        const id = t.categoryId ?? (t.type === 'gasto' ? 'otros_g' : 'otros_i')
        byCat[t.type].set(id, (byCat[t.type].get(id) ?? 0) + v)
      }
    }
    const toSegments = (m: Map<string, number>): Seg[] =>
      [...m.entries()]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, v]) => {
          const c = catById(id)!
          return { id, value: v, color: c.color, emoji: c.emoji, name: c.name }
        })
    // Vista "Todo": el mes completo en una dona (los ids con "k:" son tipos, no categorías)
    const todo: Seg[] = [
      { id: 'k:ingreso', value: inc, color: '#34d399', emoji: '💰', name: 'Ingresos' },
      { id: 'k:gasto', value: exp, color: '#f87171', emoji: '💸', name: 'Gastos' },
      { id: 'k:pago_deuda', value: debt, color: '#fbbf24', emoji: '📉', name: 'Pagos de deuda' },
    ].filter((s) => s.value > 0)
    return { inc, exp, debt, foreign, segments: { todo, gasto: toSegments(byCat.gasto), ingreso: toSegments(byCat.ingreso) } }
  }, [monthTxs, toMain, currencyOf, main])

  const segments = summary.segments[donutKind]
  const donutTotal = segments.reduce((s, x) => s + x.value, 0)
  const balance = summary.inc - summary.exp - summary.debt
  /** Cambia la vista de la dona y filtra la lista al mismo tipo */
  const showKind = (k: DonutKind) => {
    setDonutKind(k)
    setCat(undefined)
    setType(k === 'todo' ? 'todos' : k)
  }
  const onSegment = (id: string) => {
    if (!id.startsWith('k:')) return setCat(id === cat ? undefined : id)
    const kind = id.slice(2) as 'ingreso' | 'gasto' | 'pago_deuda'
    if (kind === 'pago_deuda') setType(type === 'pago_deuda' ? 'todos' : 'pago_deuda')
    else showKind(kind)
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return monthTxs.filter((t) => {
      if (type !== 'todos' && t.type !== (type as TxType)) return false
      if (cat && t.categoryId !== cat) return false
      if (acc && t.accountId !== acc && t.toAccountId !== acc) return false
      if (ql) {
        const hay = `${t.note ?? ''} ${catById(t.categoryId)?.name ?? ''} ${t.amount}`.toLowerCase()
        if (!hay.includes(ql)) return false
      }
      return true
    })
  }, [monthTxs, type, cat, acc, q])

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of filtered) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [filtered])

  const shiftMonth = (n: number) => {
    const d = new Date(month.getFullYear(), month.getMonth() + n, 1)
    if (d > new Date()) return
    setMonth(d)
  }

  const remove = async (tx: Transaction) => {
    navigator.vibrate?.(15)
    await deleteTransaction(tx.id)
    setUndo(tx)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000)
  }

  const duplicate = async (tx: Transaction) => {
    navigator.vibrate?.(15)
    await saveTransaction({ ...tx, id: uid(), date: todayStr(), createdAt: Date.now() }, true)
    celebrate.emit({ kind: 'info', text: 'Duplicado para hoy' })
  }

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  return (
    <Page>
      <h1 className="text-2xl font-black">Movimientos</h1>

      {/* Resumen del mes: desliza para cambiar de mes */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, i) => {
          if (i.offset.x < -50) shiftMonth(1)
          else if (i.offset.x > 50) shiftMonth(-1)
        }}
        className="mt-4 cursor-grab touch-pan-y rounded-3xl bg-card p-4 select-none"
      >
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="p-1 text-muted" aria-label="Mes anterior">
            <ChevronLeft />
          </button>
          <AnimatePresence mode="wait">
            <motion.p key={monthKey} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="font-extrabold">
              {monthLabel(month)}
            </motion.p>
          </AnimatePresence>
          <button type="button" onClick={() => shiftMonth(1)} className="p-1 text-muted" aria-label="Mes siguiente">
            <ChevronRight />
          </button>
        </div>

        {/* Vista de la dona: todo el mes o el detalle por categoría */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-card2 p-1" onPointerDown={(e) => e.stopPropagation()}>
          {(
            [
              ['todo', 'Todo'],
              ['gasto', 'Gastos'],
              ['ingreso', 'Ingresos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                showKind(k)
              }}
              className={`rounded-xl py-1.5 text-xs font-extrabold transition-colors ${donutKind === k ? 'bg-accent text-white' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={donutKind}
              initial={{ rotate: -90, scale: 0.8, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Donut
                segments={segments}
                total={donutTotal}
                centerLabel={donutKind === 'todo' ? 'BALANCE' : donutKind === 'gasto' ? 'GASTOS' : 'INGRESOS'}
                centerValue={
                  donutKind === 'todo' ? (
                    <span className={balance >= 0 ? 'text-good' : 'text-bad'}>{money(balance, { sign: true })}</span>
                  ) : (
                    money(donutTotal)
                  )
                }
                selected={donutKind === 'todo' ? (type === 'pago_deuda' ? 'k:pago_deuda' : undefined) : cat}
                onSelect={onSegment}
              />
            </motion.div>
          </AnimatePresence>
          <div className="flex flex-1 flex-col gap-1 text-sm">
            <Stat label="Ingresos" value={summary.inc} color="text-good" active={donutKind === 'ingreso'} onClick={() => showKind('ingreso')} />
            <Stat label="Gastos" value={summary.exp} color="text-bad" active={donutKind === 'gasto'} onClick={() => showKind('gasto')} />
            <Stat
              label="Pagos de deuda"
              value={summary.debt}
              color="text-warn"
              active={type === 'pago_deuda'}
              onClick={() => onSegment('k:pago_deuda')}
            />
          </div>
        </div>

        {/* Leyenda: cada categoría con su % — tocar filtra la lista */}
        {segments.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
            {segments.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSegment(s.id)
                }}
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-opacity ${
                  cat && cat !== s.id ? 'opacity-40' : ''
                }`}
                style={{ background: s.color + '33' }}
              >
                {s.emoji} {s.name} <span className="text-muted">{pct(s.value, donutTotal)}</span>
              </motion.button>
            ))}
          </div>
        )}
        {summary.foreign && <p className="mt-2 text-center text-xs text-muted">Montos en otras monedas convertidos a {main}</p>}
      </motion.div>

      {/* Filtros */}
      <div className="relative mt-4">
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nota, categoría o monto"
          className="w-full rounded-2xl border border-line bg-card py-3 pr-4 pl-10 font-semibold"
        />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ['todos', 'Todos'],
            ['gasto', 'Gastos'],
            ['ingreso', 'Ingresos'],
            ['transferencia', 'Transferencias'],
            ['pago_deuda', 'Pagos de deuda'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} active={type === id} onClick={() => setType(id)}>
            {label}
          </Chip>
        ))}
        {accounts.length > 1 &&
          accounts.map((a) => (
            <Chip key={a.id} active={acc === a.id} color={a.color} onClick={() => setAcc(acc === a.id ? undefined : a.id)}>
              💳 {a.name}
            </Chip>
          ))}
      </div>
      <AnimatePresence>
        {cat && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2">
            <Chip active color={catById(cat)?.color} onClick={() => setCat(undefined)}>
              {catById(cat)?.emoji} {catById(cat)?.name} <X size={14} />
            </Chip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista agrupada por día */}
      {groups.length === 0 ? (
        <Empty emoji="🔎" title="Nada por aquí" text={monthTxs.length ? 'Prueba quitando algún filtro.' : 'No hay movimientos este mes.'} />
      ) : (
        <>
          <p className="mt-4 text-center text-xs text-muted">← desliza para borrar · desliza para duplicar →</p>
          {groups.map(([date, list]) => {
            const net = list.reduce((s, t) => {
              const v = toMain(t.amount, t.accountId)
              return s + (t.type === 'ingreso' ? v : t.type === 'gasto' || t.type === 'pago_deuda' ? -v : 0)
            }, 0)
            return (
              <div key={date} className="mt-4">
                <div className="mb-2 flex justify-between px-1 text-sm">
                  <span className="font-extrabold capitalize">{dayLabel(date)}</span>
                  <span className={`font-bold tabular-nums ${net >= 0 ? 'text-good' : 'text-muted'}`}>{money(net, { sign: true })}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {list.map((tx) => (
                      <SwipeRow key={tx.id} tx={tx} onDelete={() => remove(tx)} onDuplicate={() => duplicate(tx)} onTap={() => quickAdd({ edit: tx })} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Deshacer */}
      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-30 mx-auto flex max-w-sm items-center justify-between rounded-2xl bg-ink px-4 py-3 font-bold text-bg shadow-2xl"
          >
            Movimiento borrado
            <button
              type="button"
              className="font-black text-accent"
              onClick={async () => {
                await restoreTransaction(undo)
                setUndo(null)
              }}
            >
              Deshacer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  )
}

/** Porcentaje legible: un monto real nunca se muestra como "0%" */
function pct(value: number, total: number) {
  const p = (value / total) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

function Stat({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string
  value: number
  color: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <motion.button
      type="button"
      disabled={!onClick}
      whileTap={onClick ? { scale: 0.96 } : undefined}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={`flex justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors ${
        active ? 'bg-white/10' : ''
      } ${onClick ? '' : 'cursor-default'}`}
    >
      <span className={active ? 'font-bold text-ink' : 'text-muted'}>
        {active && '● '}
        {label}
      </span>
      <span className={`font-extrabold tabular-nums ${color}`}>{money(value)}</span>
    </motion.button>
  )
}

function Donut({
  segments,
  total,
  centerLabel,
  centerValue,
  selected,
  onSelect,
}: {
  segments: Seg[]
  total: number
  centerLabel: string
  centerValue: React.ReactNode
  selected?: string
  onSelect: (id: string) => void
}) {
  const size = 112
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" />
        {segments.map((s) => {
          const len = (s.value / total) * c
          const gap = segments.length > 1 ? 2 : 0
          const el = (
            <motion.circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - gap, 0.1)} ${c}`}
              strokeDashoffset={-acc}
              initial={{ opacity: 0 }}
              animate={{ opacity: selected && selected !== s.id ? 0.25 : 1, strokeWidth: selected === s.id ? stroke + 4 : stroke }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(s.id)
              }}
              className="cursor-pointer"
            />
          )
          acc += len
          return el
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {selected && segments.some((s) => s.id === selected) ? (
          <span className="text-2xl">{segments.find((s) => s.id === selected)?.emoji}</span>
        ) : (
          <span className="text-[10px] font-bold text-muted">
            {centerLabel}
            <br />
            <span className="text-xs text-ink">{centerValue}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function SwipeRow({ tx, onDelete, onDuplicate, onTap }: { tx: Transaction; onDelete: () => void; onDuplicate: () => void; onTap: () => void }) {
  const x = useMotionValue(0)
  const delOpacity = useTransform(x, [-110, -30], [1, 0])
  const dupOpacity = useTransform(x, [30, 110], [0, 1])
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, height: 0, x: -300 }} className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 flex items-center justify-between px-5 font-extrabold">
        <motion.span style={{ opacity: dupOpacity }} className="text-accent">
          📋 Duplicar
        </motion.span>
        <motion.span style={{ opacity: delOpacity }} className="text-bad">
          Borrar 🗑️
        </motion.span>
      </div>
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={(_, i) => {
          if (i.offset.x < -110) onDelete()
          else if (i.offset.x > 110) onDuplicate()
        }}
        onTap={onTap}
        className="relative cursor-pointer bg-card"
      >
        <TxRow tx={tx} />
      </motion.div>
    </motion.div>
  )
}
