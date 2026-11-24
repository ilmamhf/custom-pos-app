import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  apiClient,
  setTokens,
  clearTokens,
  getAccessToken,
  refreshAccessToken,
} from '@/api/client'
import { setQuerySession } from '@/api/queries/queryKeys'
import { User, Store, Role, AuthLoginResponse } from '@/api/types'

interface AuthContextType {
  user: User | null
  stores: Store[]
  role: Role | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setStores: React.Dispatch<React.SetStateAction<Store[]>>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const USER_STORAGE_KEY = 'pos_admin_user'
const STORES_STORAGE_KEY = 'pos_admin_stores'
const IS_TEST = import.meta.env.MODE === 'test'

function notifySessionChanged() {
  window.dispatchEvent(new CustomEvent('auth:session-changed'))
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const clearSession = () => {
    clearTokens()
    setUser(null)
    setStores([])
    setQuerySession(null)
    localStorage.removeItem(USER_STORAGE_KEY)
    localStorage.removeItem(STORES_STORAGE_KEY)
    notifySessionChanged()
  }

  const applySession = (nextUser: User, nextStores: Store[]) => {
    setUser(nextUser)
    setStores(nextStores)
    setQuerySession(nextUser.id)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser))
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(nextStores))
  }

  useEffect(() => {
    let cancelled = false

    const restoreCachedSnapshot = () => {
      const storedUser = localStorage.getItem(USER_STORAGE_KEY)
      if (!storedUser) return
      try {
        const parsedUser = JSON.parse(storedUser) as User
        setUser(parsedUser)
        setQuerySession(parsedUser.id)
        const storedStores = localStorage.getItem(STORES_STORAGE_KEY)
        if (storedStores) setStores(JSON.parse(storedStores) as Store[])
      } catch {
        clearSession()
      }
    }

    const restore = async () => {
      // Unit tests seed the access token + user in localStorage and never hit
      // a live API, so the snapshot is authoritative there.
      if (IS_TEST) {
        if (getAccessToken()) {
          restoreCachedSnapshot()
        }
        setIsLoading(false)
        return
      }

      // Browser: exchange the HttpOnly refresh cookie for an access token. The
      // cookie is the only durable credential, so no token is read from storage.
      const token = await refreshAccessToken()
      if (cancelled) return
      if (!token) {
        clearSession()
        setIsLoading(false)
        return
      }

      // Optimistic snapshot for the first paint while /auth/me is in flight.
      restoreCachedSnapshot()

      try {
        const { data } = await apiClient.get<{ user: User; stores: Store[] }>(
          '/auth/me'
        )
        if (cancelled) return
        const freshUser: User = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
        }
        applySession(freshUser, data.stores || [])
      } catch (err: any) {
        // 401 means the session is gone; a transport failure keeps the cached
        // snapshot so a transient outage does not sign the user out.
        if (err?.response?.status === 401) {
          clearSession()
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    restore()

    const handleUnauthorized = () => {
      clearSession()
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener('auth:unauthorized', handleUnauthorized)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await apiClient.post<AuthLoginResponse>(
      '/auth/login',
      { email, password },
      // Ask the API to keep the refresh token in an HttpOnly cookie instead of
      // returning it in the body.
      { headers: { 'X-Auth-Refresh-Mode': 'cookie' } }
    )

    setTokens(data.accessToken)

    const mappedUser: User = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email || email,
      role: data.user.role,
    }

    notifySessionChanged()
    applySession(mappedUser, data.stores || [])
  }

  const logout = () => {
    // Best-effort server-side revocation; never block the local sign-out.
    void apiClient.post('/auth/logout').catch(() => undefined)
    clearSession()
  }

  const role = user?.role || null
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider
      value={{
        user,
        stores,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        setStores,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
