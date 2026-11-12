import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, LogOut } from 'lucide-react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { db, type MonthlyItem, type Profile as ProfileT } from '../lib/db'
import { AVATARS, DEBT_PRESETS, FIXED_PRESETS } from '../lib/catalog'
import { computeStreak, levelFromXp, suggestedDailyLimit, sumItems } from '../lib/finance'
import { currencyInfo, money } from '../lib/format'
import { celebrate } from '../lib/celebrate'
import { changeMainCurrency, setRate } from '../lib/actions'
import { Avatar, BigButton, Chip, Page, Sheet, XpBar } from '../components/ui'
import { RateInput } from '../components/currency'
import { MonthlyItems } from '../components/MonthlyItems'

export function Profile() {
  const { profile, txs, userId, accounts, main, toMain, fixedCats } = useData()
  const { signOut, mode, user } = useAuth()
  const navigate = useNavigate()
  const [limitOpen, setLimitOpen] = useState(false)
  const [itemsOpen, setItemsOpen] = useState<'debts' | 'fixed' | null>(null)
  /** Tras editar deudas o gastos fijos, ofrecemos actualizar el límite (nunca lo cambiamos solos) */
  const [offerLimit, setOfferLimit] = useState(false)
  const suggestedNow = suggestedLimitFor(profile)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [rateFor, setRateFor] = useState<string | null>(null)

  const lvl = levelFromXp(profile.xp)
  const streak = useMemo(() => computeStreak(txs, profile.dailyLimit, toMain, fixedCats), [txs, profile.dailyLimit, toMain, fixedCats])
  // Monedas que usas en tus cuentas activas
  const used = [...new Set([main, ...accounts.filter((a) => !a.archived).map((a) => a.currency)])]
  const foreign = used.filter((c) => c !== main)

  return (
    <Page>
      <button type="button" onClick={() => navigate(-1)} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>

      <div className="flex flex-col items-center text-center">
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
          <Avatar index={profile.avatar} size={110} onClick={() => setAvatarOpen(true)} />
        </motion.div>
        <p className="mt-3 text-2xl font-black">{profile.name}</p>
        <p className="text-sm text-muted">{user?.email}</p>
        <div className="mt-4 w-full max-w-xs">
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span className="text-accent">Nivel {lvl.level}</span>
            <span className="text-muted">
              {lvl.into} / {lvl.needed} XP
            </span>
          </div>
          <XpBar into={lvl.into} needed={lvl.needed} className="h-3" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat emoji="🔥" value={streak.current} label="Racha" />
        <Stat emoji="🏆" value={streak.best} label="Mejor racha" />
        <Stat emoji="⭐" value={profile.xp} label="XP total" />
      </div>

      <AnimatePresence>
        {offerLimit && suggestedNow !== undefined && suggestedNow > 0 && suggestedNow !== profile.dailyLimit && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 rounded-3xl border border-accent/40 bg-accent/10 p-4"
          >
            <p className="font-bold">
              ¿Actualizar tu límite diario a <span className="text-accent">{money(suggestedNow)}</span>?
            </p>
            <p className="text-sm text-muted">Con tus nuevos pagos mensuales, eso es lo que te queda libre por día.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await db.profiles.update(userId, { dailyLimit: suggestedNow })
                  setOfferLimit(false)
                  celebrate.emit({ kind: 'info', text: `Límite diario: ${money(suggestedNow)}` })
                }}
                className="grad rounded-xl px-4 py-2 font-extrabold text-white"
              >
                Sí, actualizar
              </button>
              <button type="button" onClick={() => setOfferLimit(false)} className="rounded-xl px-4 py-2 font-bold text-muted">
                No
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="mt-8 mb-2 text-lg font-extrabold">Ajustes</h2>
      <div className="overflow-hidden rounded-3xl bg-card">
        <Row label="Límite diario" value={profile.dailyLimit ? money(profile.dailyLimit) : 'Sin definir'} onClick={() => setLimitOpen(true)} />
        <Row
          label="💳 Cuotas de deudas"
          value={profile.debtItems?.length ? `${money(sumItems(profile.debtItems))}/mes` : 'Ninguna'}
          onClick={() => setItemsOpen('debts')}
        />
        <Row
          label="📌 Gastos fijos"
          value={profile.fixedExpenses?.length ? `${money(sumItems(profile.fixedExpenses))}/mes` : 'Ninguno'}
          onClick={() => setItemsOpen('fixed')}
        />
        <div className="border-t border-white/5 px-4 py-3">
          <p className="font-bold">Moneda principal</p>
          <p className="mb-2 text-xs text-muted">Totales, límite diario y estadísticas se muestran en esta moneda.</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {used.map((c) => {
              const canSwitch = c === main || !!profile.rates?.[c]
              return (
                <Chip
                  key={c}
                  active={main === c}
                  onClick={async () => {
                    if (c === main) return
                    if (!canSwitch) {
                      celebrate.emit({ kind: 'warn', text: `Primero define la tasa de ${c}` })
                      return
                    }
                    await changeMainCurrency(userId, c)
                    celebrate.emit({ kind: 'info', text: `Moneda principal: ${currencyInfo(c).flag} ${c}` })
                  }}
                >
                  {currencyInfo(c).flag} {c}
                </Chip>
              )
            })}
          </div>
          {used.length === 1 && <p className="mt-2 text-xs text-muted">Crea una cuenta en otra moneda para poder cambiarla.</p>}
        </div>
      </div>

      {foreign.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-lg font-extrabold">Tasas de cambio</h2>
          <div className="overflow-hidden rounded-3xl bg-card">
            {foreign.map((c) => {
              const r = profile.rates?.[c]
              return (
                <Row
                  key={c}
                  label={`${currencyInfo(c).flag} 1 ${c}`}
                  value={r ? `= ${money(r)}` : '⚠️ Sin definir'}
                  onClick={() => setRateFor(c)}
                />
              )
            })}
          </div>
          <p className="mt-2 px-1 text-xs text-muted">Se actualizan solas cuando transfieres entre cuentas de distinta moneda.</p>
        </>
      )}

      <h2 className="mt-8 mb-2 text-lg font-extrabold">Próximamente</h2>
      <div className="overflow-hidden rounded-3xl bg-card text-muted">
        <Row label="🏅 Logros y vestidor del avatar" value="Fase 3" />
        <Row label="🏆 Ranking de salud financiera" value="Fase 4" />
      </div>

      <div className="mt-8">
        <BigButton variant="danger" onClick={signOut}>
          <span className="inline-flex items-center gap-2">
            <LogOut size={18} /> Cerrar sesión
          </span>
        </BigButton>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        {mode === 'local' ? 'Modo local: tus datos viven solo en este dispositivo.' : 'Sesión con Supabase.'}
      </p>

      <Sheet open={avatarOpen} onClose={() => setAvatarOpen(false)} title="Elige tu compañero">
        <div className="grid grid-cols-3 gap-4 py-2">
          {AVATARS.map((_, i) => (
            <motion.div key={i} className="flex justify-center" animate={{ scale: profile.avatar === i ? 1.1 : 1, opacity: profile.avatar === i ? 1 : 0.6 }}>
              <Avatar
                index={i}
                size={80}
                onClick={() => {
                  db.profiles.update(userId, { avatar: i })
                  setAvatarOpen(false)
                }}
              />
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted">Ropa, fondos y mascotas se desbloquean subiendo de nivel (Fase 3).</p>
      </Sheet>

      <Sheet open={!!rateFor} onClose={() => setRateFor(null)} title={`Tasa de ${rateFor ?? ''}`}>
        {rateFor && <RateEditor code={rateFor} onDone={() => setRateFor(null)} />}
      </Sheet>

      <Sheet
        open={!!itemsOpen}
        onClose={() => setItemsOpen(null)}
        title={itemsOpen === 'debts' ? 'Cuotas de deudas' : 'Gastos fijos'}
      >
        {itemsOpen && (
          <ItemsEditor
            kind={itemsOpen}
            onDone={() => {
              setItemsOpen(null)
              setOfferLimit(true)
            }}
          />
        )}
      </Sheet>

      <Sheet open={limitOpen} onClose={() => setLimitOpen(false)} title="Límite diario">
        {limitOpen && <LimitEditor onDone={() => setLimitOpen(false)} />}
      </Sheet>
    </Page>
  )
}

function suggestedLimitFor(p: ProfileT) {
  const debts = p.debtItems ? sumItems(p.debtItems) : (p.monthlyDebtPayments ?? 0)
  return suggestedDailyLimit(p.monthlyIncome, debts, p.savingsPct ?? 0, sumItems(p.fixedExpenses))
}

function ItemsEditor({ kind, onDone }: { kind: 'debts' | 'fixed'; onDone: () => void }) {
  const { profile, userId } = useData()
  const [items, setItems] = useState<MonthlyItem[]>((kind === 'debts' ? profile.debtItems : profile.fixedExpenses) ?? [])
  const save = async () => {
    await db.profiles.update(
      userId,
      kind === 'debts' ? { debtItems: items, monthlyDebtPayments: sumItems(items) } : { fixedExpenses: items },
    )
    onDone()
  }
  return (
    <div className="flex flex-col gap-4">
      <MonthlyItems
        items={items}
        onChange={setItems}
        presets={kind === 'debts' ? DEBT_PRESETS : FIXED_PRESETS}
        question={kind === 'debts' ? '¿Cuánto pagas cada mes de' : '¿Cuánto pagas al mes de'}
        hint={
          kind === 'debts'
            ? 'Escribe el valor de la cuota mensual en dinero. El detalle completo de cada deuda llega en la pestaña Deudas (Fase 2).'
            : 'Los gastos de estas categorías no cuentan contra tu límite diario.'
        }
      />
      <BigButton onClick={save}>Guardar</BigButton>
    </div>
  )
}

function RateEditor({ code, onDone }: { code: string; onDone: () => void }) {
  const { profile, userId, main } = useData()
  const [rate, setRateValue] = useState(profile.rates?.[code])
  return (
    <div className="flex flex-col gap-4">
      <RateInput foreign={code} main={main} value={profile.rates?.[code]} onChange={setRateValue} />
      <p className="text-sm text-muted">Toca ⇄ para escribirla al revés si te resulta más fácil.</p>
      <BigButton
        disabled={!rate}
        onClick={async () => {
          await setRate(userId, code, rate)
          celebrate.emit({ kind: 'info', text: `1 ${code} = ${money(rate!)}` })
          onDone()
        }}
      >
        Guardar
      </BigButton>
    </div>
  )
}

function LimitEditor({ onDone }: { onDone: () => void }) {
  const { profile, userId } = useData()
  const suggested = suggestedLimitFor(profile)
  const [value, setValue] = useState(profile.dailyLimit ?? (suggested && suggested > 0 ? suggested : 0))
  const max = Math.max((suggested ?? value) * 2, value * 1.5, 100)

  const save = async (v?: number) => {
    await db.profiles.update(userId, { dailyLimit: v && v > 0 ? v : undefined })
    celebrate.emit({ kind: 'info', text: v ? `Límite diario: ${money(v)}` : 'Límite diario quitado' })
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <motion.p key={value} initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center text-5xl font-black">
        {money(value)}
        <span className="text-lg text-muted">/día</span>
      </motion.p>
      <input type="range" min={0} max={max} step={Math.max(1, Math.round(max / 100))} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-[#8b5cf6]" />
      {suggested !== undefined && suggested > 0 && (
        <button type="button" onClick={() => setValue(suggested)} className="rounded-2xl bg-card2 p-3 text-sm font-bold">
          💡 Sugerido según tu ingreso: <span className="text-accent">{money(suggested)}</span>
        </button>
      )}
      <BigButton onClick={() => save(value)}>Guardar</BigButton>
      {profile.dailyLimit && (
        <BigButton variant="ghost" onClick={() => save(undefined)}>
          Quitar límite
        </BigButton>
      )}
    </div>
  )
}

function Stat({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="rounded-3xl bg-card p-3">
      <div className="text-2xl">{emoji}</div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center justify-between border-b border-white/5 px-4 py-4 text-left last:border-0">
      <span className="font-bold">{label}</span>
      <span className="flex items-center gap-1 text-sm text-muted">
        {value}
        {onClick && <ChevronRight size={16} />}
      </span>
    </button>
  )
}
