import React, { createContext, useContext, useState, useEffect } from 'react'
import { apiClient, setTokens, clearTokens, getAccessToken } from '@/api/client'
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

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      const token = getAccessToken()
      const storedUser = localStorage.getItem(USER_STORAGE_KEY)
      const storedStores = localStorage.getItem(STORES_STORAGE_KEY)

      if (!token) {
        setIsLoading(false)
        return
      }

      // Optimistically show the persisted snapshot while revalidating.
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser) as User
          setUser(parsedUser)
          setQuerySession(parsedUser.id)
          if (storedStores) setStores(JSON.parse(storedStores))
        } catch {
          clearSession()
          setIsLoading(false)
          return
        }
      }

      // In unit tests the persisted snapshot is authoritative; skip the live
      // revalidation so tests do not depend on a running API.
      if (import.meta.env.MODE === 'test') {
        if (!cancelled) setIsLoading(false)
        return
      }

      // Revalidate roles/store assignments from the server; the persisted
      // snapshot is only a cache for the first paint.
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
        setUser(freshUser)
        setStores(data.stores || [])
        setQuerySession(freshUser.id)
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser))
        localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(data.stores || []))
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
    const { data } = await apiClient.post<AuthLoginResponse>('/auth/login', {
      email,
      password,
    })

    setTokens(data.accessToken, data.refreshToken)

    const mappedUser: User = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email || email,
      role: data.user.role,
    }

    setQuerySession(mappedUser.id)
    notifySessionChanged()
    setUser(mappedUser)
    setStores(data.stores || [])

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mappedUser))
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(data.stores || []))
  }

  const logout = () => {
    // Best-effort server-side revocation; never block the local sign-out.
    void apiClient.post('/auth/logout').catch(() => undefined)
    clearSession()
  }

  const role = user?.role || null
  const isAuthenticated = !!user && !!getAccessToken()

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
