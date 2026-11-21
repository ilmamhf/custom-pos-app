import React, { createContext, useContext, useState, useEffect } from 'react'
import { apiClient, setTokens, clearTokens, getAccessToken } from '@/api/client'
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Restore session on mount
    const token = getAccessToken()
    const storedUser = localStorage.getItem(USER_STORAGE_KEY)
    const storedStores = localStorage.getItem(STORES_STORAGE_KEY)

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser))
        if (storedStores) {
          setStores(JSON.parse(storedStores))
        }
      } catch {
        clearTokens()
        localStorage.removeItem(USER_STORAGE_KEY)
        localStorage.removeItem(STORES_STORAGE_KEY)
      }
    }
    setIsLoading(false)

    // Listen to unauthorized event from Axios interceptor
    const handleUnauthorized = () => {
      setUser(null)
      setStores([])
      localStorage.removeItem(USER_STORAGE_KEY)
      localStorage.removeItem(STORES_STORAGE_KEY)
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => {
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

    setUser(mappedUser)
    setStores(data.stores || [])

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mappedUser))
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(data.stores || []))
  }

  const logout = () => {
    clearTokens()
    setUser(null)
    setStores([])
    localStorage.removeItem(USER_STORAGE_KEY)
    localStorage.removeItem(STORES_STORAGE_KEY)
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
