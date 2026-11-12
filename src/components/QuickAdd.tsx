import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { useData } from '../lib/data'
import type { Transaction } from '../lib/db'
import { CATEGORIES, catById } from '../lib/catalog'
import { addDays, currencySymbol, dayLabel, formatTyping, money, parseAmount, todayStr, uid } from '../lib/format'
import { rateOf } from '../lib/finance'
import { deleteTransaction, saveTransaction } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { BigButton, Chip, NumPad, Sheet } from './ui'

type Mode = 'gasto' | 'ingreso' | 'transferencia'
export interface QuickAddOptions {
  mode?: Mode
  fromId?: string
  toId?: string
  edit?: Transaction
}

const Ctx = createContext<(o?: QuickAddOptions) => void>(() => {})
export const useQuickAdd = () => useContext(Ctx)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: QuickAddOptions; key: number }>({
    open: false,
    opts: {},
    key: 0,
  })
  const open = (opts: QuickAddOptions = {}) => setState((s) => ({ open: true, opts, key: s.key + 1 }))
  const close = () => setState((s) => ({ ...s, open: false }))
  const e = state.opts.edit
  const title = e ? (e.type === 'ajuste' ? 'Ajuste de saldo' : 'Editar movimiento') : undefined

  return (
    <Ctx.Provider value={open}>
      {children}
      <Sheet open={state.open} onClose={close} title={title}>
        {e?.type === 'ajuste' ? (
          <AdjustmentView key={state.key} tx={e} onClose={close} />
        ) : (
          <QuickAddForm key={state.key} opts={state.opts} onClose={close} />
        )}
      </Sheet>
    </Ctx.Provider>
  )
}

const MODES: { id: Mode; label: string; color: string }[] = [
  { id: 'gasto', label: 'Gasto', color: '#f87171' },
  { id: 'ingreso', label: 'Ingreso', color: '#34d399' },
  { id: 'transferencia', label: 'Transferencia', color: '#8b5cf6' },
]

function QuickAddForm({ opts, onClose }: { opts: QuickAddOptions; onClose: () => void }) {
  const { userId, accounts, txs, balances, currencyOf, main, profile, toMain, fixedCats } = useData()
  const active = accounts.filter((a) => !a.archived)
  const primary = active.find((a) => a.isPrimary) ?? active[0]
  const e = opts.edit

  const [mode, setMode] = useState<Mode>(
    e ? (e.type === 'ingreso' || e.type === 'transferencia' ? e.type : 'gasto') : (opts.mode ?? 'gasto'),
  )
  const [amount, setAmount] = useState(e ? String(e.amount) : '')
  const [toAmount, setToAmount] = useState(e?.toAmount ? String(e.toAmount) : '')
  const [field, setField] = useState<'from' | 'to'>('from')
  const [categoryId, setCategoryId] = useState(e?.categoryId)
  const [accountId, setAccountId] = useState(e?.accountId ?? opts.fromId ?? primary?.id)
  const [toAccountId, setToAccountId] = useState(
    e?.toAccountId ?? opts.toId ?? active.find((a) => a.id !== (opts.fromId ?? primary?.id))?.id,
  )
  const [date, setDate] = useState(e?.date ?? todayStr())
  const [note, setNote] = useState(e?.note ?? '')
  const [showAccounts, setShowAccounts] = useState(false)
  const [showNote, setShowNote] = useState(!!e?.note)
  const [saving, setSaving] = useState(false)

  // Categorías más usadas primero
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txs) if (t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    return m
  }, [txs])
  const cats = CATEGORIES.filter((c) => c.kind === mode).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))

  const changeMode = (m: Mode) => {
    if (m === mode) return
    navigator.vibrate?.(10)
    setMode(m)
    if (catById(categoryId)?.kind !== m) setCategoryId(undefined)
  }

  const amt = parseAmount(amount)
  const isTransfer = mode === 'transferencia'
  const fromCur = currencyOf(accountId)
  const toCur = currencyOf(toAccountId)
  // Transferencia entre monedas: pedimos cuánto llegó; lo estimamos con la tasa si la conocemos
  const cross = isTransfer && fromCur !== toCur
  const rTo = rateOf(toCur, main, profile.rates)
  const inMain = accountId ? toMain(amt, accountId) : 0
  const estimate = cross && amt > 0 && rTo && inMain > 0 ? Math.round((inMain / rTo) * 100) / 100 : undefined
  const toAmt = parseAmount(toAmount) || estimate || 0
  const valid =
    amt > 0 &&
    (isTransfer
      ? !!accountId && !!toAccountId && accountId !== toAccountId && (!cross || toAmt > 0)
      : !!categoryId && !!accountId)
  const color = MODES.find((m) => m.id === mode)!.color
  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '—'

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const tx: Transaction = {
      id: e?.id ?? uid(),
      userId,
      type: mode,
      amount: amt,
      accountId: accountId!,
      toAccountId: isTransfer ? toAccountId : undefined,
      toAmount: cross ? toAmt : undefined,
      categoryId: isTransfer ? undefined : categoryId,
      date,
      note: note.trim() || undefined,
      createdAt: e?.createdAt ?? Date.now(),
    }
    await saveTransaction(tx, !e)
    navigator.vibrate?.([10, 40, 20])
    onClose()
  }

  const remove = async () => {
    if (!e) return
    await deleteTransaction(e.id)
    celebrate.emit({ kind: 'info', text: 'Movimiento eliminado' })
    onClose()
  }

  if (isTransfer && active.length < 2) {
    return (
      <div>
        <ModeTabs mode={mode} onChange={changeMode} />
        <p className="py-10 text-center text-muted">
          Necesitas al menos 2 cuentas para transferir.
          <br />
          Crea otra en la pestaña <b className="text-ink">Cuentas</b>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ModeTabs mode={mode} onChange={changeMode} />

      {/* Monto: desliza → ingreso, ← gasto */}
      {cross ? (
        <div className="flex flex-col gap-2">
          <CrossAmount label="Sale" code={fromCur} text={formatTyping(amount)} active={field === 'from'} onClick={() => setField('from')} />
          <CrossAmount
            label="Llega"
            code={toCur}
            text={toAmount ? formatTyping(toAmount) : estimate ? `≈ ${money(estimate, { currency: toCur })}` : '¿Cuánto llegó?'}
            muted={!toAmount}
            active={field === 'to'}
            onClick={() => setField('to')}
          />
          {!estimate && !toAmount && amt > 0 && (
            <p className="text-center text-xs text-muted">Escribe cuánto llegó: con eso la app aprende la tasa {fromCur}→{toCur}.</p>
          )}
        </div>
      ) : (
      <motion.div
        drag={isTransfer ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.35}
        onDragEnd={(_, i) => {
          if (i.offset.x > 60) changeMode('ingreso')
          else if (i.offset.x < -60) changeMode('gasto')
        }}
        className="cursor-grab touch-pan-y py-2 text-center select-none"
      >
        <motion.p
          key={mode}
          initial={{ scale: 0.9, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-black tabular-nums"
          style={{ color }}
        >
          {mode === 'gasto' ? '−' : mode === 'ingreso' ? '+' : ''}
          <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(fromCur)}</span>
          {formatTyping(amount)}
          {fromCur !== main && <span className="ml-1 text-lg opacity-70">{fromCur}</span>}
        </motion.p>
        {!isTransfer && <p className="mt-1 text-xs text-muted">← gasto · desliza · ingreso →</p>}
      </motion.div>
      )}

      {isTransfer ? (
        <div className="flex flex-col gap-3">
          <AccountRow label="De" value={accountId} onChange={setAccountId} exclude={undefined} balances={balances} />
          <AccountRow label="A" value={toAccountId} onChange={setToAccountId} exclude={accountId} balances={balances} />
        </div>
      ) : (
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {cats.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} color={c.color} onClick={() => setCategoryId(c.id)}>
              <span>{c.emoji}</span>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
      {mode === "gasto" && categoryId && fixedCats.has(categoryId) && (
        <p className="-mt-2 text-center text-xs font-bold text-muted">📌 Gasto fijo: ya está en tu presupuesto mensual, no cuenta en tu límite diario.</p>
      )}

      <NumPad value={cross && field === 'to' ? toAmount : amount} onChange={cross && field === 'to' ? setToAmount : setAmount} />

      {/* Opciones que casi nunca hace falta tocar */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {!isTransfer && (
          <Chip active={showAccounts} onClick={() => setShowAccounts((s) => !s)} color="#2a2a42">
            💳 {accName(accountId)} <ChevronDown size={14} />
          </Chip>
        )}
        <Chip active={date === todayStr()} onClick={() => setDate(todayStr())}>
          Hoy
        </Chip>
        <Chip active={date === addDays(todayStr(), -1)} onClick={() => setDate(addDays(todayStr(), -1))}>
          Ayer
        </Chip>
        <label className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card2 px-3.5 py-2 text-sm font-bold">
          📅 {date !== todayStr() && date !== addDays(todayStr(), -1) ? dayLabel(date) : 'Otra fecha'}
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(ev) => ev.target.value && setDate(ev.target.value)}
            className="absolute inset-0 opacity-0"
          />
        </label>
        <Chip active={showNote} onClick={() => setShowNote((s) => !s)} color="#2a2a42">
          ✏️ Nota
        </Chip>
      </div>

      <AnimatePresence>
        {!isTransfer && showAccounts && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <AccountRow
              label="Cuenta"
              value={accountId}
              onChange={(id) => {
                setAccountId(id)
                setShowAccounts(false)
              }}
              balances={balances}
            />
          </motion.div>
        )}
        {showNote && (
          <motion.input
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 48, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            autoFocus={!e}
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Ej: almuerzo con el equipo"
            className="rounded-2xl border border-line bg-card2 px-4 font-semibold"
          />
        )}
      </AnimatePresence>

      <BigButton onClick={save} disabled={!valid || saving}>
        <span className="inline-flex items-center gap-2">
          <Check size={20} strokeWidth={3} />
          {e ? 'Guardar cambios' : 'Guardar'}
        </span>
      </BigButton>
      {e && (
        <BigButton variant="danger" onClick={remove}>
          <span className="inline-flex items-center gap-2">
            <Trash2 size={18} /> Eliminar
          </span>
        </BigButton>
      )}
    </div>
  )
}

function CrossAmount({
  label,
  code,
  text,
  active,
  muted,
  onClick,
}: {
  label: string
  code: string
  text: string
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      animate={{ borderColor: active ? '#8b5cf6' : '#2a2a42' }}
      className="flex items-center gap-3 rounded-2xl border-2 bg-card2 px-4 py-3 text-left"
    >
      <span className="w-12 text-xs font-bold text-muted uppercase">{label}</span>
      <span className={`flex-1 truncate text-2xl font-black tabular-nums ${muted ? 'text-muted' : ''}`}>{text}</span>
      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-black">{code}</span>
    </motion.button>
  )
}

/**
 * Ojo: la píldora NO usa layoutId. Una animación compartida (layoutId) dentro de una hoja que se cierra
 * deja la animación de salida colgada y el fondo invisible queda encima bloqueando toda la app.
 */
function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const index = MODES.findIndex((m) => m.id === mode)
  return (
    <div className="relative grid grid-cols-3 rounded-2xl bg-card2 p-1">
      <motion.div
        className="absolute top-1 bottom-1 left-1 rounded-xl"
        style={{ width: 'calc((100% - 0.5rem) / 3)' }}
        initial={false}
        animate={{ x: `${index * 100}%`, background: MODES[index].color }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      />
      {MODES.map((m) => (
        <button key={m.id} type="button" onClick={() => onChange(m.id)} className="relative py-2.5 text-sm font-extrabold">
          <span className={mode === m.id ? 'text-black' : 'text-muted'}>{m.label}</span>
        </button>
      ))}
    </div>
  )
}

function AccountRow({
  label,
  value,
  onChange,
  exclude,
  balances,
}: {
  label: string
  value?: string
  onChange: (id: string) => void
  exclude?: string
  balances: Map<string, number>
}) {
  const { accounts } = useData()
  const list = accounts.filter((a) => !a.archived && a.id !== exclude)
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">{label}</p>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {list.map((a) => (
          <Chip key={a.id} active={value === a.id} color={a.color} onClick={() => onChange(a.id)}>
            {a.isPrimary && '★ '}
            {a.name}
            <span className="font-semibold opacity-70">{money(balances.get(a.id) ?? 0, { currency: a.currency })}</span>
          </Chip>
        ))}
      </div>
    </div>
  )
}

function AdjustmentView({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { accounts, currencyOf } = useData()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Ajuste en <b className="text-ink">{accounts.find((a) => a.id === tx.accountId)?.name}</b> el {dayLabel(tx.date)}:
      </p>
      <p className="text-center text-4xl font-black">{money(tx.amount, { sign: true, currency: currencyOf(tx.accountId) })}</p>
      <p className="text-sm text-muted">Los ajustes no cuentan como ingreso ni gasto. Si lo eliminas, el saldo vuelve a como estaba.</p>
      <BigButton
        variant="danger"
        onClick={async () => {
          await deleteTransaction(tx.id)
          onClose()
        }}
      >
        Eliminar ajuste
      </BigButton>
    </div>
  )
}
