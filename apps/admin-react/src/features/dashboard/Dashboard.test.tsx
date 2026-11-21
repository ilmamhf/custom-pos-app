import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider, useStore } from '@/context/StoreContext'
import { DashboardPage } from './DashboardPage'
import userEvent from '@testing-library/user-event'
import { Store } from '@/api/types'

const mockStores: Store[] = [
  {
    id: 'bks-1',
    name: 'Cabang Bekasi',
    code: 'BKS',
    taxRateBps: 1100,
    isActive: true,
  },
  {
    id: 'kmg-2',
    name: 'Cabang Kemang',
    code: 'KMG',
    taxRateBps: 1100,
    isActive: true,
  },
]

function SwitcherControls() {
  const { setSelectedStoreId } = useStore()
  return (
    <div>
      <button onClick={() => setSelectedStoreId('bks-1')}>Switch to Bekasi</button>
      <button onClick={() => setSelectedStoreId(undefined)}>Switch to All</button>
    </div>
  )
}

function renderDashboard() {
  localStorage.setItem(
    'pos_admin_user',
    JSON.stringify({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@toko.id',
      role: 'OWNER',
    })
  )
  localStorage.setItem('pos_admin_stores', JSON.stringify(mockStores))
  localStorage.setItem('pos_access_token', 'mock-token')
  localStorage.removeItem('pos_admin_selected_store_id')

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
          <SwitcherControls />
          <DashboardPage />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('Dashboard Multi-Store Integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders consolidated metrics for All Stores and refetches when store changes', async () => {
    const user = userEvent.setup()
    renderDashboard()

    // Initially loads consolidated report (Rp 48.500.000)
    await waitFor(() => {
      expect(screen.getByText('Rp 48.500.000')).toBeInTheDocument()
    })
    expect(screen.getByText('Consolidated All Branches')).toBeInTheDocument()
    expect(screen.getByText('Rp 48.050.000')).toBeInTheDocument() // Net Sales

    // Switch store to Cabang Bekasi
    await user.click(screen.getByText('Switch to Bekasi'))

    // Refetches and updates with store-specific summary (Rp 25.000.000)
    await waitFor(() => {
      expect(screen.getByText('Rp 25.000.000')).toBeInTheDocument()
    })
    expect(screen.getByText('Rp 24.800.000')).toBeInTheDocument() // Net Sales for Bekasi
  })
})
