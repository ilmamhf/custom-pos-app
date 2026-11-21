import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider } from '@/context/StoreContext'
import { ProductsPage } from '@/features/products/ProductsPage'
import { Sidebar } from '@/components/layout/Sidebar'
import { Role, Store } from '@/api/types'

const mockStores: Store[] = [
  {
    id: 'bks-1',
    name: 'Cabang Bekasi',
    code: 'BKS',
    taxRateBps: 1100,
    isActive: true,
  },
]

function renderWithRole(role: Role) {
  localStorage.setItem(
    'pos_admin_user',
    JSON.stringify({
      id: 'test-user',
      name: role === 'OWNER' ? 'Test Owner' : 'Test Manager',
      email: `${role.toLowerCase()}@toko.id`,
      role,
    })
  )
  localStorage.setItem('pos_admin_stores', JSON.stringify(mockStores))
  localStorage.setItem('pos_access_token', 'mock-token')

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <MemoryRouter>
            <Sidebar />
            <ProductsPage />
          </MemoryRouter>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('Role-Based UI Permissions (Owner vs Manager)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows Add Master Product and Store & Staff Settings for OWNER', async () => {
    renderWithRole('OWNER')

    await waitFor(() => {
      expect(screen.getByTestId('create-product-btn')).toBeInTheDocument()
    })

    // Sidebar contains Store & Staff navigation link
    expect(screen.getByText('Store & Staff')).toBeInTheDocument()
  })

  it('hides Add Master Product and Store & Staff Settings for MANAGER', async () => {
    renderWithRole('MANAGER')

    await waitFor(() => {
      expect(screen.getByText('Master Product Catalog')).toBeInTheDocument()
    })

    // MANAGER must not see Add Master Product button
    expect(screen.queryByTestId('create-product-btn')).not.toBeInTheDocument()

    // MANAGER must not see Store & Staff link in Sidebar
    expect(screen.queryByText('Store & Staff')).not.toBeInTheDocument()
  })
})
