import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Wardrobe } from '../lib/db'
import { healthScore, isoWeek, leagueOf, LEAGUES, PART_MAX, type HealthScore, type League, type LeagueId, type ScorePart } from '../lib/score'
import { celebrate } from '../lib/celebrate'
import { Avatar, BigButton, Chip, Page } from '../components/ui'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { avatarIndex } from '../lib/catalog'
import { cleanWardrobe } from '../lib/game'

// ---------------------------------------------------------------------------
// Participación (solo en este dispositivo; no tocamos el perfil sincronizado)
// ---------------------------------------------------------------------------

const KEY = (userId: string) => `racha_ranking:${userId}`
interface Participation {
  alias: string
}
function readParticipation(userId: string): Participation | null {
  try {
    const raw = localStorage.getItem(KEY(userId))
    const p = raw ? (JSON.parse(raw) as Participation) : null
    // Un alias guardado por una versión vieja puede traer caracteres invisibles: se limpia o se pide de nuevo
    return p && typeof p.alias === 'string' && validAlias(p.alias) ? { alias: cleanAlias(p.alias) } : null
  } catch {
    return null
  }
}
function writeParticipation(userId: string, p: Participation | null) {
  try {
    if (p) localStorage.setItem(KEY(userId), JSON.stringify(p))
    else localStorage.removeItem(KEY(userId))
  } catch {
    /* almacenamiento bloqueado: la participación dura lo que dure la pantalla */
  }
}

const ALIAS_MAX = 20
/** Caracteres de control e invisibles (ancho cero, cambios de dirección del texto): el servidor los rechaza */
// eslint-disable-next-line no-control-regex -- justamente queremos quitar los caracteres de control
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g
const cleanAlias = (s: string) => s.replace(/\s+/g, ' ').replace(INVISIBLE, '').replace(/ {2,}/g, ' ').trim()
const validAlias = (s: string) => {
  const n = [...cleanAlias(s)].length
  return n >= 2 && n <= ALIAS_MAX
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

interface Row {
  user_id: string
  alias: string
  avatar: number
  wardrobe: Wardrobe | null
  score: number
  level: number
}
type Status = 'loading' | 'ready' | 'offline' | 'missing' | 'error'
type PgError = { code?: string; message?: string } | null | undefined

/** El servidor limita a una publicación cada 30 s: no es un error para el usuario, se queda la fila anterior */
const isRateLimited = (e: PgError) => /rate_limited/i.test(e?.message ?? '')

const WEEK_RE = /^[0-9]{4}-W[0-9]{2}$/
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)))

/**
 * Las filas del ranking las escriben OTROS jugadores: no se confía en nada.
 * Alias limpio, avatar y ropa del catálogo, puntaje y nivel numéricos. Una fila sin id o sin puntaje se descarta.
 */
function sanitizeRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: Row[] = []
  for (const r of data) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.user_id !== 'string' || !o.user_id || seen.has(o.user_id) || !finite(o.score)) continue
    seen.add(o.user_id)
    const alias = typeof o.alias === 'string' ? [...cleanAlias(o.alias)].slice(0, ALIAS_MAX).join('') : ''
    out.push({
      user_id: o.user_id,
      alias: alias || 'Jugador',
      avatar: avatarIndex(o.avatar),
      wardrobe: cleanWardrobe(o.wardrobe) ?? null,
      score: clampInt(o.score, 0, 100),
      level: finite(o.level) ? clampInt(o.level, 1, 999) : 1,
    })
  }
  return out
}

/** Clasifica un error de Supabase/red para mostrar un mensaje amable */
function classify(e: PgError): Status {
  const msg = e?.message ?? ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(msg)) return 'missing'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (/failed to fetch|network|load failed|fetch failed/i.test(msg)) return 'offline'
  return 'error'
}

const LIST_LIMIT = 100

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export function Ranking() {
  const { userId, profile, txs, debts, fixedCats, toMain, streak, level } = useData()
  const { mode, user } = useAuth()
  const navigate = useNavigate()
  const health = useMemo(
    () => healthScore({ txs, debts, dailyLimit: profile.dailyLimit, fixedCats, toMain, streak: streak.current }),
    [txs, debts, profile.dailyLimit, fixedCats, toMain, streak],
  )
  const myLeague = leagueOf(health.score)
  const cloud = mode === 'supabase' && !!supabase && !!user
  const [part, setPart] = useState<Participation | null>(() => readParticipation(userId))

  return (
    <Page>
      <button type="button" onClick={() => navigate('/perfil')} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>
      <h1 className="text-2xl font-black">🏆 Ranking</h1>
      <p className="text-sm text-muted">Salud financiera · semana {isoWeek().split('-W')[1]}</p>

      {!cloud ? (
        <>
          <Notice emoji="☁️" title="El ranking necesita una cuenta en la nube">
            Estás usando Racha en modo local: tus datos viven solo en este dispositivo. Cuando entres con una cuenta en la nube podrás unirte
            (si quieres) y compararte con otros jugadores.
          </Notice>
          <ScoreCard health={health} league={myLeague} />
        </>
      ) : !part ? (
        <OptIn
          defaultAlias={profile.name}
          health={health}
          onJoin={(alias) => {
            const p = { alias }
            writeParticipation(userId, p)
            setPart(p)
            celebrate.emit({ kind: 'info', text: `¡Bienvenido al ranking, ${alias}!` })
          }}
        />
      ) : (
        <Board
          uid={user!.id}
          alias={part.alias}
          health={health}
          myLeague={myLeague}
          avatar={profile.avatar}
          wardrobe={profile.wardrobe}
          level={level.level}
          onLeave={() => {
            writeParticipation(userId, null)
            setPart(null)
            celebrate.emit({ kind: 'info', text: 'Saliste del ranking' })
          }}
        />
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------

function OptIn({ defaultAlias, health, onJoin }: { defaultAlias: string; health: HealthScore; onJoin: (alias: string) => void }) {
  const [alias, setAlias] = useState(() => [...cleanAlias(defaultAlias)].slice(0, 20).join(''))
  const ok = validAlias(alias)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-3xl bg-gradient-to-br from-accent/25 to-accent2/15 p-5">
      <motion.div className="text-center text-6xl" animate={{ rotate: [0, -8, 8, 0], y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 1 }}>
        🏆
      </motion.div>
      <p className="mt-2 text-center text-xl font-black">¿Te mides con otros?</p>
      <p className="mt-2 text-sm text-muted">
        Únete al ranking semanal de salud financiera. Es <b className="text-ink">totalmente opcional</b> y puedes salir cuando quieras.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        <li>👀 Los demás solo ven tu <b>alias</b>, tu <b>avatar</b>, tu <b>nivel</b> y tu <b>puntaje</b> (0–100).</li>
        <li>🔒 <b>Nunca</b> se comparten montos, saldos, ingresos ni movimientos.</li>
        <li>🧮 El puntaje se calcula en tu teléfono con tus hábitos: presupuesto, racha, deudas al día y ahorro.</li>
      </ul>
      <p className="mt-4 text-center text-sm">
        Hoy tendrías <b className="text-accent">{health.score} puntos</b> · liga {leagueOf(health.score).emoji} {leagueOf(health.score).name}
      </p>
      <label className="mt-4 block text-sm font-bold" htmlFor="alias">
        Tu alias público
      </label>
      <input
        id="alias"
        value={alias}
        maxLength={20}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Ej. Ahorrador123"
        className="mt-1 w-full rounded-2xl border border-line bg-card2 px-4 py-3 font-bold outline-none focus:border-accent"
      />
      <p className="mt-1 text-xs text-muted">Entre 2 y 20 caracteres. Puedes usar un apodo en lugar de tu nombre real.</p>
      <div className="mt-4">
        <BigButton disabled={!ok} onClick={() => ok && onJoin(cleanAlias(alias))}>
          Unirme
        </BigButton>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------

function Board({
  uid,
  alias,
  health,
  myLeague,
  avatar,
  wardrobe,
  level,
  onLeave,
}: {
  uid: string
  alias: string
  health: HealthScore
  myLeague: League
  avatar: number
  wardrobe?: Wardrobe
  level: number
  onLeave: () => void
}) {
  const week = isoWeek()
  // Semana con la que el servidor guardó tu fila (manda la suya: cerca de la medianoche del domingo puede diferir)
  const [listWeek, setListWeek] = useState(week)
  const [league, setLeague] = useState<LeagueId>(myLeague.id)
  const [status, setStatus] = useState<Status>('loading')
  const [synced, setSynced] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [retry, setRetry] = useState(0)

  // Al abrir la pantalla: publicamos tu fila (puntaje, avatar, nivel, semana). Nunca montos.
  useEffect(() => {
    let cancelled = false
    setSynced(false)
    setStatus('loading')
    setListWeek(week)
    // Valores dentro de los límites del servidor (0003_hardening.sql)
    const row = {
      user_id: uid,
      alias: [...cleanAlias(alias)].slice(0, ALIAS_MAX).join(''),
      avatar: avatarIndex(avatar),
      wardrobe: cleanWardrobe(wardrobe) ?? {},
      score: clampInt(finite(health.score) ? health.score : 0, 0, 100),
      level: clampInt(finite(level) ? level : 1, 1, 999),
      week,
    }
    supabase!
      .from('leaderboard')
      .upsert(row, { onConflict: 'user_id' })
      .select('week')
      .then(
        ({ data, error }) => {
          if (cancelled) return
          // Publicaste hace menos de 30 s: el servidor conserva la fila anterior y seguimos normal
          if (error && !isRateLimited(error)) return setStatus(classify(error))
          const w = (data as { week?: unknown }[] | null)?.[0]?.week
          if (typeof w === 'string' && WEEK_RE.test(w)) setListWeek(w)
          setSynced(true)
        },
        (e: Error) => !cancelled && setStatus(classify(e)),
      )
    return () => {
      cancelled = true
    }
    // Solo al abrir (o al reintentar / cambiar alias): no re-publicamos con cada cambio de datos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, alias, week, retry])

  const load = useCallback(
    async (id: LeagueId) => {
      const l = LEAGUES.find((x) => x.id === id)!
      setStatus('loading')
      try {
        const { data, error } = await supabase!
          .from('leaderboard')
          .select('user_id, alias, avatar, wardrobe, score, level')
          .eq('week', listWeek)
          .gte('score', l.min)
          .lte('score', l.max)
          .order('score', { ascending: false })
          .order('level', { ascending: false })
          .order('updated_at', { ascending: true })
          .limit(LIST_LIMIT)
        if (error) return setStatus(classify(error))
        setRows(sanitizeRows(data))
        setStatus('ready')
      } catch (e) {
        setStatus(classify(e as Error))
      }
    },
    [listWeek],
  )

  useEffect(() => {
    if (synced) load(league)
  }, [synced, league, load])

  const leave = async () => {
    setLeaving(true)
    try {
      const { error } = await supabase!.from('leaderboard').delete().eq('user_id', uid)
      // Si la tabla aún no existe no hay nada que borrar
      if (error && classify(error) !== 'missing') {
        setStatus(classify(error))
        setLeaving(false)
        return
      }
      onLeave()
    } catch (e) {
      setStatus(classify(e as Error))
      setLeaving(false)
    }
  }

  const sel = LEAGUES.find((l) => l.id === league)!
  const myIndex = rows.findIndex((r) => r.user_id === uid)
  // Si estás en esta liga pero fuera del top que bajamos, te mostramos igual al final
  const showMeExtra = status === 'ready' && myIndex < 0 && league === myLeague.id
  const meRow: Row = { user_id: uid, alias, avatar, wardrobe: wardrobe ?? null, score: health.score, level }

  return (
    <>
      <ScoreCard health={health} league={myLeague} alias={alias} />
      <LeaguesInfo />

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
        {LEAGUES.map((l) => (
          <Chip key={l.id} active={league === l.id} onClick={() => setLeague(l.id)}>
            {l.emoji} {l.id === myLeague.id ? 'Tu liga' : l.name}
          </Chip>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Liga {sel.emoji} {sel.name} · {sel.min}–{sel.max} puntos · se reinicia cada lunes
      </p>

      <div className="mt-3">
        {status === 'loading' && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} className="h-16 rounded-2xl bg-card" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }} />
            ))}
          </div>
        )}
        {status === 'missing' && (
          <Notice emoji="🛠️" title="El ranking aún no está activado en el servidor">
            Falta crear la tabla del ranking. Tu participación quedó guardada: en cuanto esté lista, aparecerás aquí.
          </Notice>
        )}
        {status === 'offline' && (
          <Notice emoji="📡" title="Sin conexión" onRetry={() => setRetry((n) => n + 1)}>
            Necesitas internet para ver el ranking. Tus finanzas siguen funcionando sin conexión.
          </Notice>
        )}
        {status === 'error' && (
          <Notice emoji="😵" title="No pudimos cargar el ranking" onRetry={() => setRetry((n) => n + 1)}>
            Algo falló al hablar con el servidor. Inténtalo de nuevo en un momento.
          </Notice>
        )}
        {status === 'ready' && rows.length === 0 && !showMeExtra && (
          <Notice emoji="🌱" title="Nadie por aquí todavía">
            Aún no hay jugadores en la liga {sel.name} esta semana.
          </Notice>
        )}
        {status === 'ready' && (rows.length > 0 || showMeExtra) && (
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <SafeRow key={r.user_id}>
                <PlayerRow row={r} rank={i + 1} me={r.user_id === uid} index={i} />
              </SafeRow>
            ))}
            {showMeExtra && (
              <SafeRow>
                <PlayerRow row={meRow} rank={null} me index={rows.length} />
              </SafeRow>
            )}
          </ol>
        )}
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait" initial={false}>
          {!confirmLeave ? (
            <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <BigButton variant="ghost" onClick={() => setConfirmLeave(true)}>
                Salir del ranking
              </BigButton>
            </motion.div>
          ) : (
            <motion.div key="b" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-3xl border border-bad/30 bg-bad/10 p-4">
              <p className="font-bold">¿Salir del ranking?</p>
              <p className="text-sm text-muted">Borramos tu alias y puntaje del servidor. Puedes volver a unirte cuando quieras.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={leaving} onClick={leave} className="rounded-xl bg-bad px-4 py-2 font-extrabold text-white disabled:opacity-50">
                  {leaving ? 'Saliendo…' : 'Sí, salir'}
                </button>
                <button type="button" onClick={() => setConfirmLeave(false)} className="rounded-xl px-4 py-2 font-bold text-muted">
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

/** Una fila rota (datos raros de otro jugador) no tumba la lista: se muestra un hueco discreto */
function SafeRow({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={() => <li className="rounded-2xl bg-card px-3 py-4 text-center text-xs text-muted">Jugador no disponible</li>}>
      {children}
    </ErrorBoundary>
  )
}

/** Tu fila va "pegada" abajo (sticky) mientras está fuera de la pantalla */
function PlayerRow({ row, rank, me, index }: { row: Row; rank: number | null; me: boolean; index: number }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 15) * 0.03 }}
      data-me={me || undefined}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        me
          ? 'sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-10 border border-accent/60 bg-[#2a1f4d] shadow-lg shadow-accent/20'
          : 'bg-card'
      }`}
    >
      <span className="w-8 text-center text-lg font-black tabular-nums">{medal ?? (rank ? rank : `${LIST_LIMIT}+`)}</span>
      <Avatar index={row.avatar} size={40} look={row.wardrobe ?? undefined} still />
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold">
          {row.alias}
          {me && <span className="ml-1 text-xs font-bold text-accent">(tú)</span>}
        </p>
        <p className="text-xs text-muted">Nivel {row.level}</p>
      </div>
      <span className="text-xl font-black tabular-nums text-accent">{row.score}</span>
    </motion.li>
  )
}

// ---------------------------------------------------------------------------

const PARTS: { id: ScorePart; emoji: string; name: string; tip: (h: HealthScore) => string }[] = [
  {
    id: 'budget',
    emoji: '🎯',
    name: 'Presupuesto',
    tip: (h) =>
      h.flags.noLimit
        ? 'Define un límite diario en tu Perfil para ganar estos puntos completos.'
        : 'Días de los últimos 30 en que tu gasto del día a día quedó dentro del límite.',
  },
  { id: 'streak', emoji: '🔥', name: 'Racha', tip: () => 'Registra tus movimientos cada día: 30 días seguidos dan el máximo.' },
  {
    id: 'debts',
    emoji: '💳',
    name: 'Deudas al día',
    tip: (h) => (h.flags.noActiveDebts ? '¡Sin deudas activas! Puntos completos.' : 'Paga la cuota completa de cada deuda antes de su fecha de vencimiento.'),
  },
  {
    id: 'savings',
    emoji: '🐷',
    name: 'Ahorro',
    tip: (h) =>
      h.flags.noIncome
        ? 'Registra tus ingresos de los últimos 30 días para que cuente tu ahorro.'
        : 'Guarda al menos el 20% de lo que ingresas (después de gastos y cuotas).',
  },
]

function ScoreCard({ health, league, alias }: { health: HealthScore; league: League; alias?: string }) {
  const [tip, setTip] = useState<ScorePart | null>(null)
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-5 rounded-3xl bg-gradient-to-br from-accent/25 to-accent2/15 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-muted">{alias ? `Tu puntaje, ${alias}` : 'Tu puntaje'}</p>
          <motion.p key={health.score} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-black tabular-nums">
            {health.score}
            <span className="text-xl text-muted">/100</span>
          </motion.p>
        </div>
        <motion.div
          className="flex flex-col items-center rounded-2xl bg-black/20 px-4 py-2"
          animate={{ rotate: [0, -4, 4, 0] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.6 }}
        >
          <span className="text-4xl">{league.emoji}</span>
          <span className="text-xs font-black">Liga {league.name}</span>
        </motion.div>
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {PARTS.map((p) => {
          const v = health.parts[p.id]
          const max = PART_MAX[p.id]
          return (
            <button key={p.id} type="button" className="text-left" onClick={() => setTip(tip === p.id ? null : p.id)}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>
                  {p.emoji} {p.name}
                </span>
                <span className="flex items-center gap-1 text-muted">
                  {Math.round(v)}/{max}
                  <ChevronDown size={12} className={`transition-transform ${tip === p.id ? 'rotate-180' : ''}`} />
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="grad h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(v / max) * 100}%` }}
                  transition={{ type: 'spring', damping: 20, stiffness: 60 }}
                />
              </div>
              <AnimatePresence>
                {tip === p.id && (
                  <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pt-1 text-xs text-muted">
                    💡 {p.tip(health)}
                  </motion.p>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">Toca cada barra para ver cómo mejorarla. Solo se comparte el puntaje, nunca montos.</p>
    </motion.div>
  )
}

function LeaguesInfo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 rounded-2xl bg-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        ¿Cómo funcionan las ligas?
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3 text-sm text-muted">
            <p>Cada semana (de lunes a domingo) compites con quienes tienen un puntaje parecido al tuyo:</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-bold text-ink">
              {LEAGUES.map((l) => (
                <li key={l.id}>
                  {l.emoji} {l.name}: {l.id === 'diamante' ? `${l.min}+` : l.min === 0 ? `< ${l.max + 1}` : `${l.min}–${l.max}`}
                </li>
              ))}
            </ul>
            <p className="mt-2">Tu puntaje se actualiza cada vez que abres el Ranking. Si mejoras tus hábitos, subes de liga.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Notice({ emoji, title, children, onRetry }: { emoji: string; title: string; children: ReactNode; onRetry?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex flex-col items-center rounded-3xl bg-card p-5 text-center">
      <motion.div className="text-5xl" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>
        {emoji}
      </motion.div>
      <p className="mt-2 font-black">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl bg-card2 px-4 py-2 text-sm font-bold">
          Reintentar
        </button>
      )}
    </motion.div>
  )
}
