import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BigButton } from '../components/ui'

export function AuthForm({ kind }: { kind: 'registro' | 'login' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState<string>((location.state as { email?: string } | null)?.email ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<{ text: string; n: number; exists?: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isReg = kind === 'registro'

  const fail = (text: string, exists?: boolean) => setError((e) => ({ text, exists, n: (e?.n ?? 0) + 1 }))

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setNotice(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('Escribe un correo válido')
    setBusy(true)
    if (isReg) {
      const r = await auth.signUp(email, password)
      if (r.error) fail(r.error, r.exists)
      else if (r.needsConfirm) setNotice('Te enviamos un correo. Confírmalo y luego inicia sesión.')
    } else {
      const r = await auth.signIn(email, password)
      if (r.error) fail(r.error)
    }
    setBusy(false)
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

      {auth.mode === 'supabase' && (
        <>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={google}
            className="mt-8 flex items-center justify-center gap-3 rounded-2xl bg-white py-4 font-extrabold text-black"
          >
            <span className="text-lg font-black text-[#4285f4]">G</span> Continuar con Google
          </motion.button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" /> o con tu correo <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={`flex flex-col gap-3 ${auth.mode === 'local' ? 'mt-8' : ''}`}>
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
