/**
 * Kimlik doğrulama istemcisi — src/lib/supabase.ts'in yerine.
 *
 * Yüzeyi bilerek Supabase'in `supabase.auth` API'sine yakın tutuldu ki
 * çağıran 13 nokta mümkün olduğunca az değişsin.
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "")
const STORAGE_KEY = "leadpin.session"

export interface AuthUser {
  id: string
  email: string
  is_admin: boolean
  link_owner: boolean
}

export interface Session {
  access_token: string
  user: AuthUser
}

type Listener = (session: Session | null) => void
const listeners = new Set<Listener>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    return parsed?.access_token ? parsed : null
  } catch {
    // Bozuk JSON veya localStorage erişilemez — oturum yok say.
    return null
  }
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Gizli sekmede yazma engellenebilir; oturum yine de bellekte akar.
  }
  listeners.forEach((l) => l(session))
}

async function request<T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `İstek başarısız (${res.status})`)
  }
  return data as T
}

type AuthResponse = { token: string; user: AuthUser }

export const auth = {
  getSession: async (): Promise<Session | null> => read(),

  getUser: async (): Promise<AuthUser | null> => read()?.user ?? null,

  signIn: async (email: string, password: string): Promise<Session> => {
    const d = await request<AuthResponse>("/api/auth/login", "POST", { email, password })
    const session = { access_token: d.token, user: d.user }
    write(session)
    return session
  },

  signUp: async (email: string, password: string): Promise<Session> => {
    const d = await request<AuthResponse>("/api/auth/signup", "POST", { email, password })
    const session = { access_token: d.token, user: d.user }
    write(session)
    return session
  },

  signOut: async (): Promise<void> => write(null),

  updatePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    const token = read()?.access_token
    await request<{ ok: boolean }>(
      "/api/auth/password",
      "PUT",
      { currentPassword, newPassword },
      token,
    )
  },

  updateEmail: async (currentPassword: string, newEmail: string): Promise<void> => {
    const token = read()?.access_token
    const d = await request<AuthResponse>(
      "/api/auth/email",
      "PUT",
      { currentPassword, newEmail },
      token,
    )
    // E-posta jeton payload'ında olduğu için sunucu yeni jeton döner.
    write({ access_token: d.token, user: d.user })
  },

  /**
   * Supabase'in onAuthStateChange'ine karşılık gelir. Aboneliği iptal eden
   * fonksiyonu döner — Supabase'de bu `data.subscription.unsubscribe()` idi.
   */
  onAuthStateChange: (cb: Listener): (() => void) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },
}
