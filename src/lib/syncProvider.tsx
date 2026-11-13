import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from './auth'
import { db } from './db'
import { supabase } from './supabase'
import {
  findImportCandidate,
  firstPullUnfinished,
  importLocalData,
  skipImport,
  SyncEngine,
  supabaseRemote,
  type ImportCandidate,
  type PullProgress,
  type SyncState,
} from './sync'
import { Splash } from '../screens/Splash'
import { BigButton } from '../components/ui'

interface SyncCtx extends SyncState {
  syncNow: () => void
}

const Ctx = createContext<SyncCtx | null>(null)

/** Estado de la sincronización. null en modo local (no hay nube). */
export function useSync() {
  return useContext(Ctx)
}

/**
 * Primera bajada: si pasa este tiempo sin que llegue NINGUNA página (ni el conteo), mostramos la pantalla
 * de "no pudimos traer tus datos" (la bajada sigue por detrás y, si avanza, volvemos a "Descargando…").
 * Con miles de documentos y un servidor lejano cada página tarda 1–2 s: lo que cuenta es que avance.
 */
const STALL_MS = 15_000
/** Al reintentar a mano, mínimo de tiempo mostrando "Conectando…" */
const RETRY_MIN_MS = 700

type Gate =
  | { uid: string; phase: 'ready' }
  | { uid: string; phase: 'loading' }
  /** canStartFresh: la nube CONFIRMÓ que no hay perfil de este usuario (solo así se ofrece "Empezar de cero") */
  | { uid: string; phase: 'offline'; canStartFresh: boolean }
  | { uid: string; phase: 'import'; candidate: ImportCandidate }

/**
 * Sincroniza los datos del usuario de Supabase con la nube.
 * En modo local (o sin sesión) no hace nada y deja pasar a la app tal cual.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useAuth()
  const uid = mode === 'supabase' && user ? user.id : null
  const [gate, setGate] = useState<Gate | null>(null)
  const [state, setState] = useState<SyncState>({ status: 'idle', lastSyncAt: null })
  const engine = useRef<SyncEngine | null>(null)
  const retryPull = useRef<(() => void) | null>(null)
  /** Hay un intento de bajada en curso (en la pantalla sin conexión: botón "Conectando…") */
  const [pulling, setPulling] = useState(false)

  useEffect(() => {
    db.syncUserId = uid
    if (!uid || !supabase) return
    const eng = new SyncEngine(db, supabaseRemote(supabase), uid)
    engine.current = eng
    setState(eng.state)
    const unsub = eng.subscribe(setState)
    let cancelled = false

    // Dispositivo sin perfil: antes de dejar pasar, hay que bajar lo que tenga la nube.
    // Mientras la bajada avance mostramos "Descargando tus datos…". Solo si FALLA o no avanza en STALL_MS
    // mostramos "No pudimos traer tus datos". NUNCA mandamos al onboarding sin haber confirmado con la nube
    // que no hay perfil: un perfil nuevo creado aquí pisaría el de la nube.
    let waiting = false // mostrando la pantalla de "no pudimos traer tus datos"
    let inFlight = false // la primera bajada está corriendo
    let lastProgressAt = 0
    let lastProgress: PullProgress | undefined

    const showOffline = async (askCloud: boolean) => {
      waiting = true
      setPulling(false)
      setGate({ uid, phase: 'offline', canStartFresh: false })
      if (!askCloud) return
      // "Empezar de cero" solo si la nube responde y CONFIRMA que no hay perfil. Si no se pudo preguntar, no se ofrece.
      try {
        const has = await eng.cloudHasProfile()
        if (cancelled || has || inFlight || !waiting) return
        setGate((g) => (g && g.uid === uid && g.phase === 'offline' ? { ...g, canStartFresh: true } : g))
      } catch {
        /* no se sabe si hay perfil: solo Reintentar */
      }
    }

    const initialPull = async (minMs = 0) => {
      if (inFlight || cancelled) return
      inFlight = true
      lastProgressAt = Date.now()
      setPulling(true)
      if (!waiting) setGate({ uid, phase: 'loading' })
      const stall = setInterval(() => {
        if (!cancelled && inFlight && !waiting && Date.now() - lastProgressAt > STALL_MS) void showOffline(false)
      }, 500)
      let ok = false
      try {
        // Al reintentar a mano, que se alcance a ver el estado de carga aunque falle al instante
        const [res] = await Promise.all([eng.syncNow(), new Promise((r) => setTimeout(r, minMs))])
        ok = res
      } catch {
        ok = false
      } finally {
        clearInterval(stall)
        inFlight = false
        if (!cancelled) setPulling(false)
      }
      if (cancelled) return
      if (!ok) return void showOffline(true)
      try {
        waiting = false
        // Solo ofrecemos importar si confirmamos que la nube no tiene perfil
        if (!(await db.profiles.get(uid))) {
          const candidate = await findImportCandidate(db, uid)
          if (cancelled) return
          if (candidate) {
            setGate({ uid, phase: 'import', candidate })
            return
          }
        }
        if (!cancelled) setGate({ uid, phase: 'ready' })
      } catch {
        if (!cancelled) void showOffline(false)
      }
    }
    retryPull.current = () => {
      if (inFlight) {
        // La bajada sigue viva pero sin avanzar: le damos otra ventana
        waiting = false
        lastProgressAt = Date.now()
        setPulling(true)
        setGate({ uid, phase: 'loading' })
        return
      }
      void initialPull(RETRY_MIN_MS)
    }
    // Mientras esperamos: reintentar al volver internet, o si el reintento automático del motor salió bien
    const onOnline = () => {
      if (waiting) retryPull.current?.()
    }
    window.addEventListener('online', onOnline)
    const unsubWait = eng.subscribe((s) => {
      const fresh = !!s.progress && s.progress !== lastProgress
      if (fresh) {
        // Llegó una página (o el conteo): la nube responde
        lastProgress = s.progress
        lastProgressAt = Date.now()
      }
      if (inFlight) {
        if (fresh && waiting) {
          waiting = false
          setGate({ uid, phase: 'loading' })
        }
      } else if (waiting && ((fresh && s.progress!.pages > 0) || (s.status === 'idle' && s.lastSyncAt))) {
        // El reintento automático del motor ya está recibiendo páginas (o terminó): lo seguimos con "Descargando…"
        waiting = false
        void initialPull()
      }
    })

    ;(async () => {
      // Con perfil local entramos directo y sincronizamos por detrás… salvo que la primera bajada
      // haya quedado a medias (el perfil llegó pero faltan datos): entonces la terminamos primero.
      const hadProfile = !!(await db.profiles.get(uid)) && !(await firstPullUnfinished(db, uid))
      await eng.start()
      if (cancelled) return
      if (hadProfile) {
        setGate({ uid, phase: 'ready' })
        void eng.syncNow()
        return
      }
      await initialPull()
    })().catch(() => {
      if (!cancelled) void showOffline(false)
    })

    return () => {
      cancelled = true
      unsub()
      unsubWait()
      window.removeEventListener('online', onOnline)
      retryPull.current = null
      eng.stop()
      engine.current = null
      db.syncUserId = null
    }
  }, [uid])

  if (!uid) return <>{children}</>
  if (!gate || gate.uid !== uid) return <Splash />
  if (gate.phase === 'loading') return <PullScreen progress={state.progress} />
  if (gate.phase === 'offline') {
    return (
      <OfflinePrompt
        retrying={pulling}
        canStartFresh={gate.canStartFresh && !pulling}
        onRetry={() => retryPull.current?.()}
        onStartFresh={() => setGate({ uid, phase: 'ready' })}
      />
    )
  }
  if (gate.phase === 'import') {
    return (
      <ImportPrompt
        candidate={gate.candidate}
        onImport={async () => {
          await importLocalData(db, gate.candidate.localUser.id, uid)
          setGate({ uid, phase: 'ready' })
          void engine.current?.syncNow()
        }}
        onSkip={async () => {
          await skipImport(db, uid)
          setGate({ uid, phase: 'ready' })
        }}
      />
    )
  }
  return <Ctx.Provider value={{ ...state, syncNow: () => void engine.current?.syncNow() }}>{children}</Ctx.Provider>
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function ImportPrompt({ candidate, onImport, onSkip }: { candidate: ImportCandidate; onImport: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const { accounts, transactions, debts } = candidate
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-7xl">📦</div>
        <h1 className="mt-6 text-2xl font-black">Encontramos datos guardados en este dispositivo</h1>
        <p className="mt-3 text-muted">
          Son de la cuenta local <b className="text-ink">{candidate.localUser.email}</b>. ¿Importarlos a tu cuenta?
        </p>
        <div className="mt-5 rounded-3xl bg-card p-4 text-sm">
          <p className="font-bold">👤 {candidate.profileName}</p>
          <p className="mt-1 text-muted">
            {plural(accounts, 'cuenta', 'cuentas')} · {plural(transactions, 'movimiento', 'movimientos')} · {plural(debts, 'deuda', 'deudas')}
          </p>
        </div>
        <p className="mt-4 text-xs text-muted">Al importarlos se guardan en la nube y los verás en todos tus dispositivos.</p>
      </motion.div>
      <div className="mt-8 flex flex-col gap-3">
        <BigButton onClick={run(onImport)} disabled={busy}>
          Importar
        </BigButton>
        <BigButton variant="ghost" onClick={run(onSkip)} disabled={busy}>
          Empezar de cero
        </BigButton>
      </div>
    </div>
  )
}

const num = (n: number) => n.toLocaleString('es')

/** Primera bajada en curso: "Descargando tus datos…" con el avance. */
function PullScreen({ progress }: { progress?: PullProgress }) {
  const docs = progress?.docs ?? 0
  const total = progress?.total ?? null
  const pct = total ? Math.min(100, Math.round((docs / total) * 100)) : null
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <motion.div className="text-7xl" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          ☁️
        </motion.div>
        <h1 className="mt-6 text-2xl font-black">{progress ? 'Descargando tus datos…' : 'Conectando con la nube…'}</h1>
        <p className="mt-3 text-muted" aria-live="polite">
          {total !== null
            ? `${num(Math.min(docs, total))} de ${num(total)} registros${pct !== null ? ` (${pct} %)` : ''}`
            : docs > 0
              ? `${num(docs)} registros recibidos`
              : 'La primera vez puede tardar un poco.'}
        </p>
        {pct !== null && (
          <div
            className="mx-auto mt-5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-card"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="grad h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Si se corta, la próxima vez sigue desde donde iba.</p>
      </motion.div>
    </div>
  )
}

function OfflinePrompt({
  retrying,
  canStartFresh,
  onRetry,
  onStartFresh,
}: {
  retrying: boolean
  /** Solo true si la nube confirmó que no hay perfil de este usuario */
  canStartFresh: boolean
  onRetry: () => void
  onStartFresh: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-7xl">☁️</div>
        <h1 className="mt-6 text-2xl font-black">No pudimos traer tus datos de la nube</h1>
        <p className="mt-3 text-muted">Revisa tu conexión. Si ya usaste Racha en otro dispositivo, tus datos te esperan allá.</p>
      </motion.div>
      <div className="mt-8 flex flex-col gap-3">
        <BigButton onClick={onRetry} disabled={retrying}>
          {retrying ? 'Conectando…' : 'Reintentar'}
        </BigButton>
        {/* "Empezar de cero" solo aparece si la nube confirmó que no hay perfil: si no se sabe, podría pisar tus datos */}
        {!canStartFresh ? null : confirming ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-card p-4 text-center text-sm">
            <p className="text-muted">
              La nube no tiene datos tuyos. Si usas Racha en otro dispositivo que aún no ha subido sus datos, empezar de cero aquí puede{' '}
              <b className="text-ink">reemplazarlos</b>.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <BigButton variant="danger" onClick={onStartFresh} disabled={retrying}>
                Sí, empezar de cero
              </BigButton>
              <button type="button" onClick={() => setConfirming(false)} className="py-2 text-xs text-muted underline">
                Cancelar
              </button>
            </div>
          </motion.div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} disabled={retrying} className="py-2 text-xs text-muted underline disabled:opacity-40">
            Empezar de cero en este dispositivo
          </button>
        )}
      </div>
    </div>
  )
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 45) return 'hace un momento'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${plural(d, 'día', 'días')}`
}

/** Indicador discreto del estado de la sincronización (no muestra nada en modo local). */
export function SyncBadge() {
  const sync = useSync()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!sync) return null
  const label =
    sync.status === 'syncing'
      ? '☁️ Sincronizando…'
      : sync.status === 'offline'
        ? '📴 Sin conexión — se sincroniza al volver'
        : sync.status === 'error'
          ? '⚠️ No se pudo sincronizar — reintentando'
          : sync.lastSyncAt
            ? `☁️ Sincronizado ${ago(sync.lastSyncAt)}`
            : '☁️ Sincronización activa'
  return (
    <button type="button" onClick={sync.syncNow} className="text-xs text-muted" aria-label="Sincronizar ahora">
      {label}
    </button>
  )
}
