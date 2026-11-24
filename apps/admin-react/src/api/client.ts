import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios'
import { AuthRefreshResponse } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const IS_TEST = import.meta.env.MODE === 'test'

// The refresh token is never stored in JavaScript-accessible storage in the
// browser: login asks the API for cookie mode (`X-Auth-Refresh-Mode: cookie`)
// and the API returns it only inside an HttpOnly cookie. The access token lives
// in memory for the tab's lifetime. Tests keep using localStorage so the
// existing suite can seed an authenticated session without a live API.
export const ACCESS_TOKEN_KEY = 'pos_access_token'
const LEGACY_REFRESH_TOKEN_KEY = 'pos_refresh_token'
const CSRF_COOKIE_NAME = 'pos_csrf_token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'

let accessToken: string | null = null

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export function getAccessToken(): string | null {
  if (IS_TEST) {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  }
  return accessToken
}

export function setTokens(nextAccessToken: string) {
  accessToken = nextAccessToken
  if (IS_TEST) {
    localStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken)
  }
}

export function clearTokens() {
  accessToken = null
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  // Drop a token persisted by an older build; the refresh token now lives in
  // an HttpOnly cookie the browser clears on logout.
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY)
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null
  }
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE_NAME)
  return token ? { [CSRF_HEADER_NAME]: token } : {}
}

// Attach the in-memory access token and (when present) the CSRF double-submit
// header to every request.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.headers) {
      const token = getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      const csrf = csrfHeaders()
      for (const [header, value] of Object.entries(csrf)) {
        config.headers.set(header, value)
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

/**
 * Rotates the session using the HttpOnly refresh cookie. Returns the new access
 * token, or null when the cookie is missing/expired/revoked.
 *
 * Uses a bare axios call so a failed refresh cannot re-enter the 401
 * interceptor below.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<AuthRefreshResponse>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true, headers: csrfHeaders() }
    )
    if (!data.accessToken) {
      return null
    }
    setTokens(data.accessToken)
    return data.accessToken
  } catch {
    return null
  }
}

// Automatic 401 token refresh queue
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error)
    } else if (token) {
      promise.resolve(token)
    }
  })
  failedQueue = []
}

function rejectSession(error: unknown) {
  clearTokens()
  window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  return Promise.reject(error)
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((newToken) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
            }
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const newToken = await refreshAccessToken()
        if (!newToken) {
          processQueue(error, null)
          return rejectSession(error)
        }

        processQueue(null, newToken)

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }

        return apiClient(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        return rejectSession(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
