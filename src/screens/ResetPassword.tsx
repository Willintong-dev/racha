import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BigButton } from '../components/ui'

/** Se muestra encima de todo cuando el usuario vuelve desde el enlace de "¿Olvidaste tu contraseña?". */
export function ResetPassword() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<{ text: string; n: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (password.length < 6) {
      setError((e) => ({ text: 'La contraseña necesita al menos 6 caracteres', n: (e?.n ?? 0) + 1 }))
      return
    }
    setBusy(true)
    const r = await auth.updatePassword(password)
    setBusy(false)
    if (r.error) setError((e) => ({ text: r.error!, n: (e?.n ?? 0) + 1 }))
    else setDone(true)
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva contraseña"
      className="fixed inset-0 z-[80] overflow-y-auto bg-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+48px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <motion.div className="text-7xl" animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.6 }}>
                ✅
              </motion.div>
              <h1 className="mt-6 text-3xl font-black">¡Listo!</h1>
              <p className="mt-2 text-muted">Tu contraseña quedó actualizada.</p>
              <div className="mt-10 w-full">
                <BigButton onClick={auth.finishRecovery}>Continuar</BigButton>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="text-5xl">🔑</div>
              <h1 className="mt-3 text-3xl font-black">Nueva contraseña</h1>
              <p className="mt-1 text-muted">Elige una que recuerdes. Mínimo 6 caracteres.</p>

              <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nueva contraseña"
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
                  </motion.div>
                )}

                <div className="mt-3 flex flex-col gap-3">
                  <BigButton type="submit" disabled={busy}>
                    {busy ? '…' : 'Guardar contraseña'}
                  </BigButton>
                  <BigButton variant="ghost" onClick={auth.finishRecovery}>
                    Ahora no
                  </BigButton>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
