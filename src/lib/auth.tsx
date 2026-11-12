import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, supabaseEnabled, supabaseKey, supabaseUrl } from './supabase'
import { getAuthProviders, type AuthProviders } from './authSettings'
import { db } from './db'
import { uid } from './format'
import { ResetPassword } from '../screens/ResetPassword'

export interface AuthUser {
  id: string
  email: string
}

export type { AuthProviders }

type Result = { error?: string }

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  mode: 'supabase' | 'local'
  /** Proveedores externos activos en Supabase. null mientras se averigua. */
  providers: AuthProviders | null
  signUp(email: string, password: string): Promise<Result & { needsConfirm?: boolean; exists?: boolean }>
  signIn(email: string, password: string): Promise<Result & { unconfirmed?: boolean }>
  signInWithGoogle(): Promise<Result>
  resendConfirmation(email: string): Promise<Result>
  resetPassword(email: string): Promise<Result>
  /** true cuando el usuario llegó desde el enlace para cambiar la contraseña */
  recovering: boolean
  updatePassword(password: string): Promise<Result>
  finishRecovery(): void
  signOut(): Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)
const SESSION_KEY = 'racha_session'

async function hash(s: string) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback para http sin HTTPS (p. ej. probando desde el celular por IP local)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'f' + (h >>> 0).toString(16)
}

type ErrLike = { message?: string; status?: number; code?: string; name?: string }

const NOT_CONFIRMED = 'Confirma tu correo antes de entrar'
const EXISTS = 'Este correo ya tiene cuenta'
const SHORT = 'La contraseña necesita al menos 6 caracteres'

function translate(err: ErrLike | string) {
  const e: ErrLike = typeof err === 'string' ? { message: err } : err
  const msg = e.message ?? ''
  if (e.status === 429 || /rate limit|too many/i.test(msg) || /rate_limit/.test(e.code ?? ''))
    return 'Demasiados intentos, espera un momento'
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || /failed to fetch|networkerror|network request|load failed|fetch failed/i.test(msg))
    return 'Sin conexión. Inténtalo de nuevo.'
  if (/invalid login/i.test(msg) || e.code === 'invalid_credentials') return 'Correo o contraseña incorrectos'
  if (/email not confirmed/i.test(msg) || e.code === 'email_not_confirmed') return NOT_CONFIRMED
  if (/already registered/i.test(msg) || e.code === 'user_already_exists') return EXISTS
  if (/should be different/i.test(msg) || e.code === 'same_password') return 'Usa una contraseña distinta a la anterior'
  if (/password/i.test(msg) && /6/.test(msg)) return SHORT
  if (/session missing|session_not_found|expired/i.test(msg + (e.code ?? ''))) return 'El enlace expiró. Pide uno nuevo desde «¿Olvidaste tu contraseña?»'
  return msg || 'Algo salió mal. Inténtalo de nuevo.'
}

// Errores lanzados (no devueltos), p. ej. fetch sin red
const caught = (e: unknown) => ({ error: translate(e instanceof Error ? e : String(e)) })

// Se lee al cargar el módulo, antes de que supabase-js limpie el hash del enlace de recuperación
const recoveryInUrl = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search)

const redirectTo = () => window.location.origin

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<AuthProviders | null>(supabaseEnabled ? null : { google: false })
  const [recovering, setRecovering] = useState(Boolean(supabase) && recoveryInUrl)

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return
    let alive = true
    getAuthProviders(supabaseUrl, supabaseKey).then((p) => alive && setProviders(p))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const u = data.session?.user
        setUser(u ? { id: u.id, email: u.email ?? '' } : null)
        setLoading(false)
      })
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovering(true)
        const u = session?.user
        setUser(u ? { id: u.id, email: u.email ?? '' } : null)
      })
      return () => data.subscription.unsubscribe()
    }
    const id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      setLoading(false)
      return
    }
    db.localUsers.get(id).then((u) => {
      setUser(u ? { id: u.id, email: u.email } : null)
      setLoading(false)
    })
  }, [])

  const value: AuthCtx = {
    user,
    loading,
    mode: supabaseEnabled ? 'supabase' : 'local',
    providers,
    recovering,

    async signUp(email, password) {
      email = email.trim().toLowerCase()
      if (password.length < 6) return { error: SHORT }
      if (supabase) {
        let res
        try {
          res = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } })
        } catch (e) {
          return caught(e)
        }
        const { data, error } = res
        if (error) {
          const t = translate(error)
          return { error: t, exists: t === EXISTS }
        }
        // Supabase devuelve un usuario sin identidades si el correo ya existe
        if (data.user && data.user.identities?.length === 0) return { error: EXISTS, exists: true }
        return { needsConfirm: !data.session }
      }
      const exists = await db.localUsers.where('email').equals(email).first()
      if (exists) return { error: EXISTS, exists: true }
      const u = { id: uid(), email, passwordHash: await hash(email + password), createdAt: Date.now() }
      await db.localUsers.add(u)
      localStorage.setItem(SESSION_KEY, u.id)
      setUser({ id: u.id, email })
      return {}
    },

    async signIn(email, password) {
      email = email.trim().toLowerCase()
      if (supabase) {
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password })
          if (!error) return {}
          const t = translate(error)
          return { error: t, unconfirmed: t === NOT_CONFIRMED }
        } catch (e) {
          return caught(e)
        }
      }
      const u = await db.localUsers.where('email').equals(email).first()
      if (!u || u.passwordHash !== (await hash(email + password))) return { error: 'Correo o contraseña incorrectos' }
      localStorage.setItem(SESSION_KEY, u.id)
      setUser({ id: u.id, email })
      return {}
    },

    async signInWithGoogle() {
      if (!supabase) return { error: 'Google necesita Supabase configurado' }
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectTo() },
        })
        return error ? { error: translate(error) } : {}
      } catch (e) {
        return caught(e)
      }
    },

    async resendConfirmation(email) {
      if (!supabase) return {}
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: redirectTo() },
        })
        return error ? { error: translate(error) } : {}
      } catch (e) {
        return caught(e)
      }
    },

    async resetPassword(email) {
      if (!supabase) return { error: 'La recuperación por correo necesita Supabase configurado' }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: redirectTo(),
        })
        return error ? { error: translate(error) } : {}
      } catch (e) {
        return caught(e)
      }
    },

    async updatePassword(password) {
      if (password.length < 6) return { error: SHORT }
      if (!supabase) return { error: 'Cambiar la contraseña necesita Supabase configurado' }
      try {
        const { error } = await supabase.auth.updateUser({ password })
        return error ? { error: translate(error) } : {}
      } catch (e) {
        return caught(e)
      }
    },

    finishRecovery() {
      setRecovering(false)
    },

    async signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(SESSION_KEY)
      setRecovering(false)
      setUser(null)
    },
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {recovering && <ResetPassword />}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}
