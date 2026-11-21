import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="sales" element={<SalesPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="inventory" element={<InventoryPage />} />
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
