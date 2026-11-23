import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider } from '@/context/StoreContext'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { RoleGuard } from '@/features/auth/RoleGuard'
import { LoginPage } from '@/features/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { SalesPage } from '@/features/sales/SalesPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // POS sales are synced asynchronously; keep the admin view fresh when
      // the operator returns to the tab and after short-lived staleness.
      staleTime: 1000 * 15,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
})

/**
 * Drops every cached query whenever the session identity changes. Combined
 * with the session-scoped query keys this prevents one user's cached data from
 * rendering for another after logout or an unauthorized event.
 */
function SessionCacheReset() {
  const client = useQueryClient()

  useEffect(() => {
    const handler = () => client.clear()
    window.addEventListener('auth:session-changed', handler)
    window.addEventListener('auth:unauthorized', handler)
    return () => {
      window.removeEventListener('auth:session-changed', handler)
      window.removeEventListener('auth:unauthorized', handler)
    }
  }, [client])

  return null
}

const ADMIN_ROLES: Array<'OWNER' | 'MANAGER'> = ['OWNER', 'MANAGER']

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheReset />
      <AuthProvider>
        <StoreProvider>
          <BrowserRouter>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected app routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route
                  path="dashboard"
                  element={
                    <RoleGuard allowedRoles={ADMIN_ROLES}>
                      <DashboardPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="sales"
                  element={
                    <RoleGuard allowedRoles={ADMIN_ROLES}>
                      <SalesPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="products"
                  element={
                    <RoleGuard allowedRoles={ADMIN_ROLES}>
                      <ProductsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <RoleGuard allowedRoles={ADMIN_ROLES}>
                      <InventoryPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RoleGuard allowedRoles={['OWNER']}>
                      <SettingsPage />
                    </RoleGuard>
                  }
                />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
