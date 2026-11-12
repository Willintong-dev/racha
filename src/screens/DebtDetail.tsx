import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '../lib/data'
import { deleteDebt, payDebt, updateDebt } from '../lib/actions'
import { celebrate } from '../lib/celebrate'
import { dueInfo, dueLabel, durationLabel, monthsFromNow, shortDate, simulate } from '../lib/debts'
import { currencySymbol, dayLabel, formatTyping, money, parseAmount } from '../lib/format'
import { AnimatedMoney, BigButton, Empty, NumPad, Page, Ring, Sheet } from '../components/ui'
import { DebtWizard } from '../components/DebtWizard'
import { useQuickAdd } from '../components/QuickAdd'

type SheetKind = 'extra' | 'ajuste' | 'editar' | null

export function DebtDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const quickAdd = useQuickAdd()
  const { debts, txs, accounts, balances } = useData()
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [value, setValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const debt = debts.find((d) => d.id === id)
  const payments = useMemo(() => txs.filter((t) => t.type === 'pago_deuda' && t.debtId === id), [txs, id])
  const forecast = useMemo(
    () =>
      debt && debt.balance > 0
        ? simulate([{ id: debt.id, balance: debt.balance, payment: debt.monthlyPayment, rate: debt.annualRate ?? 0 }], 0, 'avalancha', false)
        : null,
    [debt],
  )
  if (!debt) return <Navigate to="/deudas" replace />

  const cur = debt.currency
  const info = dueInfo(debt, txs)
  const pct = debt.originalBalance > 0 ? (debt.originalBalance - debt.balance) / debt.originalBalance : 1
  const account = accounts.find((a) => a.id === debt.payFromAccountId)
  const accBalance = balances.get(debt.payFromAccountId) ?? 0
  const paidOff = debt.balance <= 0
  const cuotaAmount = info.paidThisMonth ? Math.min(debt.monthlyPayment, debt.balance) : info.remainingThisMonth

  const open = (k: SheetKind, initial = '') => {
    setValue(initial)
    setSheet(k)
  }

  const payCuota = async () => {
    if (busy) return
    setBusy(true)
    navigator.vibrate?.([10, 40, 20])
    await payDebt(debt, cuotaAmount, info.paidThisMonth ? 'extra' : 'cuota')
    setBusy(false)
  }

  return (
    <Page>
      <button type="button" onClick={() => navigate('/deudas')} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>

      <div className="mt-1 flex items-center gap-5 rounded-[28px] bg-card p-5">
        <Ring value={pct} max={1} size={110} stroke={12} color={paidOff ? '#34d399' : '#8b5cf6'}>
          <span>
            <span className="block text-3xl">{debt.emoji}</span>
            <span className="text-sm font-black">{Math.round(pct * 100)}%</span>
          </span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">{debt.name}</p>
          {paidOff ? (
            <p className="mt-1 text-2xl font-black text-good">Liquidada ✓</p>
          ) : (
            <>
              <p className="text-xs font-bold text-muted uppercase">Te falta</p>
              <AnimatedMoney value={debt.balance} currency={cur} className="block text-3xl font-black tabular-nums" />
            </>
          )}
          <p className="text-xs text-muted">de {money(debt.originalBalance, { currency: cur })}</p>
        </div>
      </div>

      {!paidOff && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Info label="Cuota" value={money(debt.monthlyPayment, { currency: cur })} />
            <Info label="Vence" value={`día ${debt.dueDay}`} />
            <Info label="Interés" value={debt.annualRate ? `${String(Math.round(debt.annualRate * 100) / 100).replace('.', ',')}% anual` : 'Sin dato'} />
          </div>

          <div
            className={`mt-3 rounded-2xl p-3 text-center text-sm font-bold ${
              info.paidThisMonth ? 'bg-good/15 text-good' : info.overdue ? 'bg-bad/15 text-bad' : 'bg-card2 text-ink'
            }`}
          >
            {dueLabel(info)} · próxima fecha {shortDate(info.dueDate)}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <BigButton onClick={payCuota} disabled={busy || cuotaAmount <= 0}>
              {info.paidThisMonth ? `Adelantar cuota · ${money(cuotaAmount, { currency: cur })}` : `Pagar cuota · ${money(cuotaAmount, { currency: cur })}`}
            </BigButton>
            <p className="text-center text-xs text-muted">
              Sale de {account?.name ?? '—'} ({money(accBalance, { currency: account?.currency ?? cur })})
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BigButton variant="ghost" onClick={() => open('extra')}>
                💪 Pago extra
              </BigButton>
              <BigButton variant="ghost" onClick={() => open('ajuste', String(debt.balance))}>
                ⚖️ Ajustar saldo
              </BigButton>
            </div>
          </div>

          {forecast && (
            <div className="mt-4 rounded-2xl bg-card p-4 text-sm">
              {forecast.feasible ? (
                <p>
                  Pagando solo la cuota terminas en <b>{monthsFromNow(forecast.months)}</b> ({durationLabel(forecast.months)})
                  {forecast.totalInterest > 0.5 && (
                    <>
                      {' '}
                      y pagas unos <b className="text-bad">{money(forecast.totalInterest, { currency: cur })}</b> en intereses
                    </>
                  )}
                  .
                </p>
              ) : (
                <p className="font-bold text-bad">⚠️ La cuota no cubre los intereses: así la deuda nunca baja. Sube la cuota o haz pagos extra.</p>
              )}
              {!debt.annualRate && <p className="mt-1 text-xs text-muted">Sin tasa de interés el cálculo asume 0%. Agrégala en Editar.</p>}
            </div>
          )}
        </>
      )}

      <h2 className="mt-6 mb-2 text-lg font-extrabold">Pagos</h2>
      {payments.length === 0 ? (
        <Empty emoji="🧾" title="Aún no hay pagos" text="Cada pago que registres aquí baja el saldo y suma XP." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card">
          {payments.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => quickAdd({ edit: t })}
              className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left last:border-0"
            >
              <span>
                <b className="block">{t.note ?? 'Pago'}</b>
                <span className="text-xs text-muted capitalize">{dayLabel(t.date)}</span>
              </span>
              <span className="font-extrabold text-good tabular-nums">−{money(t.amount, { currency: cur })}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <BigButton variant="ghost" onClick={() => setSheet('editar')}>
          ✏️ Editar
        </BigButton>
        <BigButton variant="danger" onClick={() => setConfirmDelete(true)}>
          🗑️ Eliminar
        </BigButton>
      </div>
      {confirmDelete && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl bg-bad/15 p-3 text-sm">
          <p className="font-bold">¿Eliminar {debt.name}?</p>
          <p className="text-muted">Los pagos ya registrados se quedan en tus movimientos.</p>
          <div className="mt-2 flex justify-end gap-4">
            <button type="button" onClick={() => setConfirmDelete(false)} className="font-bold text-muted">
              No
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteDebt(debt.id)
                navigate('/deudas', { replace: true })
              }}
              className="font-black text-bad"
            >
              Sí, eliminar
            </button>
          </div>
        </motion.div>
      )}

      <Sheet open={sheet === 'extra' || sheet === 'ajuste'} onClose={() => setSheet(null)} title={sheet === 'extra' ? 'Pago extra' : 'Ajustar saldo'}>
        <p className="text-sm text-muted">
          {sheet === 'extra'
            ? 'Todo lo que pagues por encima de la cuota va directo a bajar la deuda.'
            : '¿Cuánto dice tu banco que debes hoy? Úsalo si te cobraron intereses o hiciste más compras.'}
        </p>
        <p className="my-4 text-center text-5xl font-black tabular-nums">
          <span className="mr-1 align-top text-2xl opacity-70">{currencySymbol(cur)}</span>
          {formatTyping(value)}
        </p>
        {sheet === 'extra' && parseAmount(value) > debt.balance && (
          <p className="mb-2 text-center text-xs font-bold text-warn">Solo debes {money(debt.balance, { currency: cur })}: se registra ese monto.</p>
        )}
        <NumPad value={value} onChange={setValue} />
        <div className="mt-4">
          <BigButton
            disabled={busy || (sheet === 'extra' ? parseAmount(value) <= 0 : value === '')}
            onClick={async () => {
              setBusy(true)
              if (sheet === 'extra') await payDebt(debt, parseAmount(value), 'extra')
              else {
                await updateDebt(debt.id, { balance: parseAmount(value) })
                celebrate.emit({ kind: 'info', text: 'Saldo de la deuda ajustado ✓' })
              }
              setBusy(false)
              setSheet(null)
            }}
          >
            {sheet === 'extra' ? `Abonar ${money(Math.min(parseAmount(value), debt.balance), { currency: cur })}` : `Ajustar a ${money(parseAmount(value), { currency: cur })}`}
          </BigButton>
        </div>
      </Sheet>

      <Sheet open={sheet === 'editar'} onClose={() => setSheet(null)} title="Editar deuda">
        {sheet === 'editar' && <DebtWizard debt={debt} onDone={() => setSheet(null)} />}
      </Sheet>
    </Page>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-2.5">
      <p className="text-[10px] font-bold text-muted uppercase">{label}</p>
      <p className="truncate text-sm font-extrabold">{value}</p>
    </div>
  )
}
