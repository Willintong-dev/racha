import { useState } from 'react'
import { motion } from 'framer-motion'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '../lib/data'
import { db } from '../lib/db'
import { ACCOUNT_TYPES } from '../lib/catalog'
import { adjustBalance, setPrimary } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { formatTyping, money, parseAmount } from '../lib/format'
import { AnimatedMoney, BigButton, Empty, NumPad, Page, Sheet } from '../components/ui'
import { TxRow } from '../components/TxRow'
import { useQuickAdd } from '../components/QuickAdd'

export function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const quickAdd = useQuickAdd()
  const { accounts, txs, balances, userId } = useData()
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [real, setReal] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const acc = accounts.find((a) => a.id === id)
  if (!acc) return <Navigate to="/cuentas" replace />
  const balance = balances.get(acc.id) ?? 0
  const list = txs.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id)
  const t = ACCOUNT_TYPES[acc.type]

  const makePrimary = async () => {
    await setPrimary(userId, acc.id)
    celebrate.emit({ kind: 'info', text: `★ ${acc.name} es tu cuenta principal` })
  }

  const toggleArchive = async () => {
    await db.accounts.update(acc.id, { archived: !acc.archived })
    if (!acc.archived) navigate('/cuentas')
  }

  const remove = async () => {
    await db.accounts.delete(acc.id)
    navigate('/cuentas', { replace: true })
  }

  return (
    <Page>
      <button type="button" onClick={() => navigate('/cuentas')} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>

      <motion.div
        className="mt-2 rounded-[28px] p-6 shadow-2xl"
        style={{ background: `linear-gradient(135deg, ${acc.color}, ${acc.color}88 70%, #161625)` }}
      >
        <p className="font-bold text-white/80">
          {t.emoji} {acc.isPrimary && '★ '}
          {acc.name}
        </p>
        <AnimatedMoney value={balance} currency={acc.currency} className="mt-2 block text-4xl font-black text-white tabular-nums" />
        <p className="mt-1 text-xs text-white/70">
          {t.label} · {acc.currency}
          {acc.archived && ' · Archivada'}
        </p>
      </motion.div>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        <Action onClick={() => quickAdd({ mode: 'transferencia', fromId: acc.id })}>🔁 Transferir</Action>
        <Action onClick={() => setAdjustOpen(true)}>⚖️ Ajustar saldo</Action>
        {!acc.isPrimary && !acc.archived && <Action onClick={makePrimary}>★ Hacer principal</Action>}
        {!acc.isPrimary && <Action onClick={toggleArchive}>{acc.archived ? '📤 Desarchivar' : '🗄️ Archivar'}</Action>}
        {!acc.isPrimary && list.length === 0 && <Action onClick={() => setConfirmDelete(true)}>🗑️ Eliminar</Action>}
      </div>

      {confirmDelete && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-3 rounded-2xl bg-bad/15 p-3 text-sm">
          <span className="flex-1 font-bold">¿Eliminar {acc.name}? No se puede deshacer.</span>
          <button type="button" onClick={() => setConfirmDelete(false)} className="font-bold text-muted">
            No
          </button>
          <button type="button" onClick={remove} className="font-black text-bad">
            Sí, eliminar
          </button>
        </motion.div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-extrabold">Movimientos de esta cuenta</h2>
      {list.length === 0 ? (
        <Empty emoji="🫙" title="Sin movimientos todavía" />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card">
          {list.slice(0, 50).map((tx) => (
            <button key={tx.id} type="button" onClick={() => quickAdd({ edit: tx })} className="block w-full border-b border-white/5 text-left last:border-0">
              <TxRow tx={tx} />
            </button>
          ))}
        </div>
      )}

      <Sheet open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajustar saldo">
        <p className="text-sm text-muted">
          ¿Cuánto dice tu banco que tienes? La diferencia se guarda como <b className="text-ink">ajuste</b> y no cuenta como gasto ni ingreso.
        </p>
        <p className="mt-2 text-sm text-muted">Saldo en la app: {money(balance, { currency: acc.currency })}</p>
        <p className="my-4 text-center text-5xl font-black tabular-nums">{formatTyping(real)}</p>
        {real && (
          <p className="mb-3 text-center text-sm font-bold text-muted">
            Diferencia: {money(parseAmount(real) - balance, { sign: true, currency: acc.currency })}
          </p>
        )}
        <NumPad value={real} onChange={setReal} />
        <div className="mt-4">
          <BigButton
            disabled={!real}
            onClick={async () => {
              await adjustBalance(acc, balance, parseAmount(real))
              setReal('')
              setAdjustOpen(false)
              celebrate.emit({ kind: 'info', text: 'Saldo ajustado ✓' })
            }}
          >
            Ajustar a {money(parseAmount(real), { currency: acc.currency })}
          </BigButton>
        </div>
      </Sheet>
    </Page>
  )
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onClick} className="shrink-0 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-extrabold">
      {children}
    </motion.button>
  )
}
