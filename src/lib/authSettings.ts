export interface AuthProviders {
  google: boolean
}

const CACHE_KEY = 'racha_auth_providers'
let memo: Promise<AuthProviders> | null = null

async function query(url: string, key: string, fetcher: typeof fetch): Promise<AuthProviders | null> {
  try {
    const res = await fetcher(`${url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: key } })
    if (!res.ok) return null
    const json = (await res.json()) as { external?: Record<string, unknown> }
    return { google: json?.external?.google === true }
  } catch {
    return null
  }
}

/** Pregunta a Supabase qué proveedores de inicio de sesión están activos. Nunca lanza: si falla, asume que no hay. */
export async function fetchAuthProviders(url: string, key: string, fetcher: typeof fetch = fetch): Promise<AuthProviders> {
  return (await query(url, key, fetcher)) ?? { google: false }
}

/** Igual que fetchAuthProviders pero se pide una sola vez por sesión (memoria + sessionStorage). */
export function getAuthProviders(url: string, key: string): Promise<AuthProviders> {
  if (memo) return memo
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as AuthProviders
      if (typeof parsed?.google === 'boolean') return (memo = Promise.resolve(parsed))
    }
  } catch {
    /* sin sessionStorage */
  }
  memo = query(url, key, (...a) => fetch(...a)).then((p) => {
    if (!p) {
      memo = null // los fallos no se guardan: se reintenta la próxima vez
      return { google: false }
    }
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(p))
    } catch {
      /* sin sessionStorage */
    }
    return p
  })
  return memo
}
