import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { clearAuth, getStoredToken, getStoredUser, storeAuth, type AuthUser } from '../lib/authStorage'

type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  isAdmin: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())

  const login = useCallback((nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken)
    setUser(nextUser)
    storeAuth(nextToken, nextUser)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    clearAuth()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [token, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
