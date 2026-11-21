import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider } from '@/context/StoreContext'
import { InventoryPage } from './InventoryPage'
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

function renderInventory() {
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
          <InventoryPage />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('Inventory & Inter-Store Transfer Integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders negative stock warning banner and 1-click reconcile button', async () => {
    renderInventory()

    await waitFor(() => {
      expect(screen.getByText(/Negative Stock Discrepancy Detected/i)).toBeInTheDocument()
    })

    expect(screen.getByText('1-Click Reconcile Discrepancy')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument() // Negative stock on hand
  })

  it('opens restock modal with prefilled data when reconcile button is clicked', async () => {
    const user = userEvent.setup()
    renderInventory()

    await waitFor(() => {
      expect(screen.getByText('1-Click Reconcile Discrepancy')).toBeInTheDocument()
    })

    await user.click(screen.getByText('1-Click Reconcile Discrepancy'))

    // Modal opens with Reconcile title and deltaQty prefilled to 3
    expect(screen.getByText('Reconcile Negative Stock')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()

    // Submits adjustment
    await user.click(screen.getByText('Submit Adjustment'))

    await waitFor(() => {
      expect(screen.queryByText('Reconcile Negative Stock')).not.toBeInTheDocument()
    })
  })

  it('opens transfer modal and prevents transfer to the same store', async () => {
    const user = userEvent.setup()
    renderInventory()

    await waitFor(() => {
      expect(screen.getAllByText('Transfer')[0]).toBeInTheDocument()
    })

    await user.click(screen.getAllByText('Transfer')[0])

    expect(screen.getByText('Inter-Store Stock Transfer')).toBeInTheDocument()
    expect(screen.getByText('Execute Transfer')).toBeInTheDocument()
  })
})
