import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData } from '../lib/data'
import type { Account } from '../lib/db'
import { ACCOUNT_TYPES } from '../lib/catalog'
import { currencyInfo, money } from '../lib/format'
import { AnimatedMoney, Page } from '../components/ui'
import { useQuickAdd } from '../components/QuickAdd'
import { NewAccountSheet } from '../components/NewAccountSheet'

export function Accounts() {
  const { accounts, balances, toMain, main, missing } = useData()
  const quickAdd = useQuickAdd()
  const [newOpen, setNewOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const active = accounts.filter((a) => !a.archived).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt - b.createdAt)
  const archived = accounts.filter((a) => a.archived)
  const available = active.reduce((s, a) => s + toMain(balances.get(a.id) ?? 0, a.id), 0)
  // Las deudas llegan en la Fase 2; por ahora patrimonio = disponible
  const debts = 0

  return (
    <Page>
      <h1 className="text-2xl font-black">Cuentas</h1>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs font-bold text-muted uppercase">Disponible</p>
          <AnimatedMoney value={available} className="mt-1 block text-xl font-black tabular-nums" />
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs font-bold text-muted uppercase">Patrimonio neto</p>
          <AnimatedMoney value={available - debts} className="mt-1 block text-xl font-black tabular-nums" />
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        Totales en {main}
        {missing.length > 0 && <span className="font-bold text-warn"> · sin tasa para {missing.join(', ')} (no se suman)</span>}
      </p>

      {active.length > 1 && (
        <p className="mt-5 text-center text-xs text-muted">Mantén presionada una cuenta y suéltala sobre otra para transferir 🔁</p>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {active.map((a, i) => (
          <AccountCard
            key={a.id}
            acc={a}
            index={i}
            balance={balances.get(a.id) ?? 0}
            highlighted={hoverId === a.id}
            onHover={setHoverId}
            onDropOn={(toId) => quickAdd({ mode: 'transferencia', fromId: a.id, toId })}
          />
        ))}
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setNewOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-5 font-extrabold text-muted"
      >
        <Plus size={20} /> Nueva cuenta
      </motion.button>

      {archived.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowArchived((s) => !s)} className="text-sm font-bold text-muted">
            {showArchived ? '▾' : '▸'} Archivadas ({archived.length})
          </button>
          <AnimatePresence>
            {showArchived && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 flex flex-col gap-2 opacity-60">
                {archived.map((a, i) => (
                  <AccountCard key={a.id} acc={a} index={i} balance={balances.get(a.id) ?? 0} draggable={false} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <NewAccountSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </Page>
  )
}

function findDropTarget(x: number, y: number, selfId: string) {
  for (const el of document.elementsFromPoint(x, y)) {
    const card = el.closest('[data-account-id]')
    const id = card?.getAttribute('data-account-id')
    if (id && id !== selfId) return id
  }
  return null
}

function AccountCard({
  acc,
  index,
  balance,
  highlighted,
  onHover,
  onDropOn,
  draggable = true,
}: {
  acc: Account
  index: number
  balance: number
  highlighted?: boolean
  onHover?: (id: string | null) => void
  onDropOn?: (toId: string) => void
  draggable?: boolean
}) {
  const navigate = useNavigate()
  const { main, toMain } = useData()
  const controls = useDragControls()
  const timer = useRef<number | undefined>(undefined)
  const dragging = useRef(false)
  const moved = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const [lifted, setLifted] = useState(false)
  const t = ACCOUNT_TYPES[acc.type]

  // Mientras se arrastra, bloquea el scroll táctil de la página
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const block = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault()
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  const cancelTimer = () => window.clearTimeout(timer.current)

  return (
    <motion.div
      ref={ref}
      data-account-id={acc.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: lifted ? 1.05 : highlighted ? 0.97 : 1,
        rotate: lifted ? -2 : 0,
        boxShadow: highlighted ? '0 0 0 3px #f4f4fb' : '0 10px 30px rgba(0,0,0,.35)',
      }}
      transition={{ delay: index * 0.05, type: 'spring', damping: 20, stiffness: 260 }}
      drag={draggable}
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      onPointerDown={(e) => {
        if (!draggable) return
        moved.current = false
        cancelTimer()
        timer.current = window.setTimeout(() => {
          dragging.current = true
          setLifted(true)
          navigator.vibrate?.(25)
          controls.start(e)
        }, 350)
      }}
      onPointerUp={cancelTimer}
      onPointerCancel={cancelTimer}
      onDrag={(_, info) => {
        moved.current = true
        onHover?.(findDropTarget(info.point.x - window.scrollX, info.point.y - window.scrollY, acc.id))
      }}
      onDragEnd={(_, info) => {
        dragging.current = false
        setLifted(false)
        onHover?.(null)
        const target = findDropTarget(info.point.x - window.scrollX, info.point.y - window.scrollY, acc.id)
        if (target) onDropOn?.(target)
      }}
      onClick={() => {
        if (!moved.current && !dragging.current) navigate(`/cuentas/${acc.id}`)
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ background: `linear-gradient(135deg, ${acc.color}, ${acc.color}88 70%, #161625)`, zIndex: lifted ? 20 : 1 }}
      className="relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-3xl p-5 select-none"
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl">{t.emoji}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold text-white">
          {acc.isPrimary && <span className="text-yellow-300">★ </span>}
          {acc.name}
        </p>
        <p className="text-xs font-semibold text-white/70">
          {acc.isPrimary ? 'Principal · ' : ''}
          {t.label} · {currencyInfo(acc.currency).flag} {acc.currency}
        </p>
      </div>
      <div className="text-right">
        <AnimatedMoney value={balance} currency={acc.currency} className="block text-lg font-black text-white tabular-nums" />
        {acc.currency !== main && toMain(1, acc.id) > 0 && (
          <span className="text-xs font-bold text-white/70">≈ {money(toMain(balance, acc.id))}</span>
        )}
      </div>
    </motion.div>
  )
}
