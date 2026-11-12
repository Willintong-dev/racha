import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BigButton } from '../components/ui'

const COOLDOWN = 60

type Err = { text: string; n: number; exists?: boolean; unconfirmed?: boolean }

export function AuthForm({ kind }: { kind: 'registro' | 'login' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState<string>((location.state as { email?: string } | null)?.email ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<Err | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** correo al que mandamos el enlace de confirmación (pantalla "Revisa tu correo") */
  const [sent, setSent] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const isReg = kind === 'registro'
  const showGoogle = auth.mode === 'supabase' && auth.providers?.google === true

  // /registro y /login comparten la misma instancia: al cambiar de pantalla limpiamos los avisos
  useEffect(() => {
    setError(null)
    setNotice(null)
    setSent(null)
  }, [kind])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const fail = (text: string, extra?: Omit<Err, 'text' | 'n'>) => setError((e) => ({ text, ...extra, n: (e?.n ?? 0) + 1 }))

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setNotice(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('Escribe un correo válido')
    setBusy(true)
    if (isReg) {
      const r = await auth.signUp(email, password)
      if (r.error) fail(r.error, { exists: r.exists })
      else if (r.needsConfirm) {
        setError(null)
        setSent(email.trim().toLowerCase())
        setCooldown(COOLDOWN)
      }
    } else {
      const r = await auth.signIn(email, password)
      if (r.error) fail(r.error, { unconfirmed: r.unconfirmed })
    }
    setBusy(false)
  }

  const resend = async (to: string) => {
    if (cooldown > 0 || busy) return
    setBusy(true)
    const r = await auth.resendConfirmation(to)
    setBusy(false)
    if (r.error) {
      fail(r.error)
      return
    }
    setError(null)
    setSent(to)
    setCooldown(COOLDOWN)
    setNotice('Te enviamos otro correo.')
  }

  const forgot = async () => {
    if (!email) return fail('Escribe tu correo primero')
    const r = await auth.resetPassword(email)
    if (r.error) fail(r.error)
    else setNotice('Revisa tu correo: te enviamos un enlace para cambiar la contraseña.')
  }

  const google = async () => {
    const r = await auth.signInWithGoogle()
    if (r.error) fail(r.error)
  }

  const goLogin = () => {
    setSent(null)
    setError(null)
    setNotice(null)
    setPassword('')
    if (isReg) navigate('/login', { state: { email: sent ?? email } })
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button type="button" onClick={() => setSent(null)} className="-ml-2 w-fit p-2 text-muted" aria-label="Volver">
          <ArrowLeft />
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col items-center justify-center text-center"
        >
          <motion.div
            className="text-8xl"
            initial={{ scale: 0.4, rotate: -12 }}
            animate={{ scale: 1, rotate: 0, y: [0, -10, 0] }}
            transition={{ scale: { type: 'spring', damping: 10 }, y: { repeat: Infinity, duration: 2.4, delay: 0.5 } }}
          >
            ✉️
          </motion.div>
          <h1 className="mt-6 text-3xl font-black">Revisa tu correo</h1>
          <p className="mt-3 max-w-80 text-muted">
            Te enviamos un enlace a <span className="font-extrabold break-all text-ink">{sent}</span>. Tócalo para activar
            tu cuenta.
          </p>
          <p className="mt-2 text-xs text-muted">¿No llega? Mira en spam o promociones.</p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {error && (
            <motion.p key={error.n} animate={{ x: [0, -10, 10, -6, 6, 0] }} className="text-center text-sm font-bold text-bad">
              {error.text}
            </motion.p>
          )}
          {notice && <p className="text-center text-sm font-bold text-good">{notice}</p>}
          <BigButton onClick={goLogin}>Ya lo confirmé → Iniciar sesión</BigButton>
          <BigButton variant="ghost" onClick={() => resend(sent)} disabled={cooldown > 0 || busy}>
            {busy ? '…' : cooldown > 0 ? `Reenviar correo (${cooldown} s)` : 'Reenviar correo'}
          </BigButton>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-8">
      <button type="button" onClick={() => navigate('/bienvenida')} className="-ml-2 w-fit p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
        <div className="text-5xl">{isReg ? '👋' : '🔥'}</div>
        <h1 className="mt-3 text-3xl font-black">{isReg ? 'Crea tu cuenta' : 'Qué bueno verte'}</h1>
        <p className="mt-1 text-muted">{isReg ? 'Toma menos de un minuto.' : 'Tu racha te espera.'}</p>
      </motion.div>

      <div className="h-8 shrink-0" />
      <AnimatePresence initial={false}>
        {showGoogle && (
          <motion.div
            key="google"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={google}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-4 font-extrabold text-black"
            >
              <span className="text-lg font-black text-[#4285f4]">G</span> Continuar con Google
            </motion.button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-line" /> o con tu correo <div className="h-px flex-1 bg-line" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="rounded-2xl border border-line bg-card px-4 py-4 font-semibold"
        />
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            autoComplete={isReg ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isReg ? 'Contraseña (mínimo 6)' : 'Contraseña'}
            className="w-full rounded-2xl border border-line bg-card px-4 py-4 pr-12 font-semibold"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-muted"
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {show ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {error && (
          <motion.div
            key={error.n}
            animate={{ x: [0, -10, 10, -6, 6, 0] }}
            transition={{ duration: 0.35 }}
            className="text-sm font-bold text-bad"
          >
            {error.text}
            {error.exists && isReg && (
              <Link to="/login" state={{ email }} className="ml-1 text-accent underline">
                Inicia sesión
              </Link>
            )}
            {error.unconfirmed && (
              <button
                type="button"
                onClick={() => resend(email.trim().toLowerCase())}
                disabled={cooldown > 0 || busy}
                className="ml-1 text-accent underline disabled:opacity-50"
              >
                {cooldown > 0 ? `Reenviar correo (${cooldown} s)` : 'Reenviar correo'}
              </button>
            )}
          </motion.div>
        )}
        {notice && <p className="text-sm font-bold text-good">{notice}</p>}

        {!isReg && (
          <button type="button" onClick={forgot} className="w-fit text-sm font-bold text-accent">
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <div className="mt-3">
          <BigButton type="submit" disabled={busy}>
            {busy ? '…' : isReg ? 'Crear cuenta' : 'Entrar'}
          </BigButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isReg ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
        <Link to={isReg ? '/login' : '/registro'} state={{ email }} className="font-extrabold text-accent">
          {isReg ? 'Inicia sesión' : 'Créala aquí'}
        </Link>
      </p>

      {auth.mode === 'local' && (
        <p className="mt-auto pt-8 text-center text-xs text-muted">
          Modo local: tu cuenta y tus datos viven solo en este dispositivo.
        </p>
      )}
    </div>
  )
}
