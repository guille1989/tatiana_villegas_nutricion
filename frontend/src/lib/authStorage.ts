export type AuthUser = {
  id: string
  role: 'admin' | 'member'
  name?: string
  email?: string
}

const TOKEN_KEY = 'tati_token'
const USER_KEY = 'tati_user'

export const getStoredToken = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const storeAuth = (token: string, user: AuthUser) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, token)
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const clearAuth = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
}
