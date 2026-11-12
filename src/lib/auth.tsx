import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, supabaseEnabled } from './supabase'
import { db } from './db'
import { uid } from './format'

export interface AuthUser {
  id: string
  email: string
}

type Result = { error?: string }

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  mode: 'supabase' | 'local'
  signUp(email: string, password: string): Promise<Result & { needsConfirm?: boolean; exists?: boolean }>
  signIn(email: string, password: string): Promise<Result>
  signInWithGoogle(): Promise<Result>
  resetPassword(email: string): Promise<Result>
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

function translate(msg: string) {
  if (/invalid login/i.test(msg)) return 'Correo o contraseña incorrectos'
  if (/already registered/i.test(msg)) return 'Este correo ya tiene cuenta'
  if (/password/i.test(msg) && /6/.test(msg)) return 'La contraseña necesita al menos 6 caracteres'
  if (/email not confirmed/i.test(msg)) return 'Confirma tu correo antes de entrar'
  return msg
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const u = data.session?.user
        setUser(u ? { id: u.id, email: u.email ?? '' } : null)
        setLoading(false)
      })
      const { data } = supabase.auth.onAuthStateChange((_e, session) => {
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

    async signUp(email, password) {
      email = email.trim().toLowerCase()
      if (password.length < 6) return { error: 'La contraseña necesita al menos 6 caracteres' }
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          const t = translate(error.message)
          return { error: t, exists: t === 'Este correo ya tiene cuenta' }
        }
        // Supabase devuelve un usuario sin identidades si el correo ya existe
        if (data.user && data.user.identities?.length === 0) return { error: 'Este correo ya tiene cuenta', exists: true }
        return { needsConfirm: !data.session }
      }
      const exists = await db.localUsers.where('email').equals(email).first()
      if (exists) return { error: 'Este correo ya tiene cuenta', exists: true }
      const u = { id: uid(), email, passwordHash: await hash(email + password), createdAt: Date.now() }
      await db.localUsers.add(u)
      localStorage.setItem(SESSION_KEY, u.id)
      setUser({ id: u.id, email })
      return {}
    },

    async signIn(email, password) {
      email = email.trim().toLowerCase()
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error ? { error: translate(error.message) } : {}
      }
      const u = await db.localUsers.where('email').equals(email).first()
      if (!u || u.passwordHash !== (await hash(email + password))) return { error: 'Correo o contraseña incorrectos' }
      localStorage.setItem(SESSION_KEY, u.id)
      setUser({ id: u.id, email })
      return {}
    },

    async signInWithGoogle() {
      if (!supabase) return { error: 'Google necesita Supabase configurado' }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      return error ? { error: translate(error.message) } : {}
    },

    async resetPassword(email) {
      if (!supabase) return { error: 'La recuperación por correo necesita Supabase configurado' }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: window.location.origin,
      })
      return error ? { error: translate(error.message) } : {}
    },

    async signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(SESSION_KEY)
      setUser(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}
