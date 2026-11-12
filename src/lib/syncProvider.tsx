import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from './auth'
import { db } from './db'
import { supabase } from './supabase'
import { findImportCandidate, importLocalData, skipImport, SyncEngine, supabaseRemote, type ImportCandidate, type SyncState } from './sync'
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

/** Si la primera bajada tarda más que esto (p. ej. sin internet), seguimos sin esperarla. */
const INITIAL_PULL_TIMEOUT = 8000
/** Al reintentar a mano, mínimo de tiempo mostrando "Conectando…" */
const RETRY_MIN_MS = 700

type Gate =
  | { uid: string; phase: 'ready' }
  | { uid: string; phase: 'offline' }
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
  const [pulling, setPulling] = useState(false)

  useEffect(() => {
    db.syncUserId = uid
    if (!uid || !supabase) return
    const eng = new SyncEngine(db, supabaseRemote(supabase), uid)
    engine.current = eng
    setState(eng.state)
    const unsub = eng.subscribe(setState)
    let cancelled = false

    // Dispositivo sin perfil: antes de dejar pasar, hay que confirmar con la nube si ya tiene los datos.
    // Si no se pudo confirmar (error, sin internet o tardó demasiado) NO mandamos al onboarding:
    // un perfil nuevo creado aquí pisaría el de la nube.
    let waiting = false // mostrando la pantalla de "no pudimos traer tus datos"
    let pulling = false
    const showOffline = () => {
      waiting = true
      setGate({ uid, phase: 'offline' })
    }
    const initialPull = async (minMs = 0) => {
      if (pulling || cancelled) return
      pulling = true
      setPulling(true)
      try {
        const pull = Promise.race([eng.syncNow(), new Promise<false>((r) => setTimeout(() => r(false), INITIAL_PULL_TIMEOUT))])
        // Al reintentar a mano, que se alcance a ver el estado de carga aunque falle al instante
        const [ok] = await Promise.all([pull, new Promise((r) => setTimeout(r, minMs))])
        if (cancelled) return
        if (!ok) return showOffline()
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
        if (!cancelled) showOffline()
      } finally {
        pulling = false
        if (!cancelled) setPulling(false)
      }
    }
    retryPull.current = () => void initialPull(RETRY_MIN_MS)
    // Mientras esperamos: reintentar al volver internet, o si el reintento automático del motor salió bien
    const onOnline = () => {
      if (waiting) void initialPull()
    }
    window.addEventListener('online', onOnline)
    const unsubWait = eng.subscribe((s) => {
      if (waiting && !pulling && s.status === 'idle' && s.lastSyncAt) void initialPull()
    })

    ;(async () => {
      const hadProfile = await db.profiles.get(uid)
      await eng.start()
      if (cancelled) return
      if (hadProfile) {
        setGate({ uid, phase: 'ready' })
        void eng.syncNow()
        return
      }
      await initialPull()
    })().catch(() => {
      if (!cancelled) showOffline()
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
  if (gate.phase === 'offline') {
    return <OfflinePrompt retrying={pulling} onRetry={() => retryPull.current?.()} onStartFresh={() => setGate({ uid, phase: 'ready' })} />
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

function OfflinePrompt({ retrying, onRetry, onStartFresh }: { retrying: boolean; onRetry: () => void; onStartFresh: () => void }) {
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
        {confirming ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-card p-4 text-center text-sm">
            <p className="text-muted">
              Si ya tienes datos en otro dispositivo, empezar de cero aquí puede <b className="text-ink">reemplazarlos</b> en todos tus dispositivos.
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
