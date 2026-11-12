import type { Transaction } from '../lib/db'
import { catById } from '../lib/catalog'
import { money } from '../lib/format'
import { useAccountName, useData } from '../lib/data'

export function txVisual(
  tx: Transaction,
  accName: (id?: string) => string,
  currencyOf: (id?: string) => string,
  debtOf: (id?: string) => { name: string; emoji: string } | undefined = () => undefined,
) {
  const cat = catById(tx.categoryId)
  const currency = currencyOf(tx.accountId)
  const toCurrency = currencyOf(tx.toAccountId)
  switch (tx.type) {
    case 'transferencia':
      return {
        emoji: '🔁',
        color: '#8b5cf6',
        title: 'Transferencia',
        sub:
          `${accName(tx.accountId)} → ${accName(tx.toAccountId)}` +
          (toCurrency !== currency ? ` · llegó ${money(tx.toAmount ?? tx.amount, { currency: toCurrency })}` : ''),
        amount: money(tx.amount, { currency }),
        tone: 'text-ink',
      }
    case 'ajuste':
      return {
        emoji: '⚖️',
        color: '#64748b',
        title: 'Ajuste de saldo',
        sub: accName(tx.accountId),
        amount: money(tx.amount, { sign: true, currency }),
        tone: 'text-muted',
      }
    case 'pago_deuda':
      return {
        emoji: debtOf(tx.debtId)?.emoji ?? '📉',
        color: '#f59e0b',
        title: debtOf(tx.debtId) ? `Pago · ${debtOf(tx.debtId)!.name}` : 'Pago de deuda',
        sub: accName(tx.accountId),
        amount: money(-tx.amount, { sign: true, currency }),
        tone: 'text-warn',
      }
    case 'ingreso':
      return {
        emoji: cat?.emoji ?? '💰',
        color: cat?.color ?? '#22c55e',
        title: cat?.name ?? 'Ingreso',
        sub: accName(tx.accountId),
        amount: money(tx.amount, { sign: true, currency }),
        tone: 'text-good',
      }
    default:
      return {
        emoji: cat?.emoji ?? '📦',
        color: cat?.color ?? '#64748b',
        title: cat?.name ?? 'Gasto',
        sub: accName(tx.accountId),
        amount: money(-tx.amount, { sign: true, currency }),
        tone: 'text-bad',
      }
  }
}

export function TxRow({ tx }: { tx: Transaction }) {
  const accName = useAccountName()
  const { currencyOf, debts } = useData()
  const v = txVisual(tx, accName, currencyOf, (id) => debts.find((d) => d.id === id))
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl"
        style={{ background: v.color + '2a' }}
      >
        {v.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{tx.note && tx.type !== 'ajuste' ? tx.note : v.title}</p>
        <p className="truncate text-xs text-muted">
          {tx.note && tx.type !== 'ajuste' ? `${v.title} · ` : ''}
          {v.sub}
        </p>
      </div>
      <p className={`shrink-0 font-extrabold tabular-nums ${v.tone}`}>{v.amount}</p>
    </div>
  )
}
