import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider, useStore } from '@/context/StoreContext'
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

function StoreConsumer() {
  const { selectedStoreId, selectedStore, setSelectedStoreId, canSelectAllStores } =
    useStore()

  return (
    <div>
      <div data-testid="selected-id">{selectedStoreId ?? 'ALL'}</div>
      <div data-testid="selected-name">{selectedStore?.name ?? 'Consolidated'}</div>
      <div data-testid="can-select-all">{canSelectAllStores ? 'yes' : 'no'}</div>
      <button onClick={() => setSelectedStoreId('bks-1')}>Select Bekasi</button>
      <button onClick={() => setSelectedStoreId('kmg-2')}>Select Kemang</button>
      <button onClick={() => setSelectedStoreId(undefined)}>Select All</button>
    </div>
  )
}

function renderStoreContext(role: 'OWNER' | 'MANAGER' = 'OWNER') {
  localStorage.setItem(
    'pos_admin_user',
    JSON.stringify({ id: 'u1', name: 'User 1', email: 'u1@toko.id', role })
  )
  localStorage.setItem('pos_admin_stores', JSON.stringify(mockStores))
  localStorage.setItem('pos_access_token', 'token')
  localStorage.removeItem('pos_admin_selected_store_id')

  return render(
    <AuthProvider>
      <StoreProvider>
        <StoreConsumer />
      </StoreProvider>
    </AuthProvider>
  )
}

describe('StoreContext & Global Switcher', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes with undefined (All Stores) for Owner with multiple stores', () => {
    renderStoreContext('OWNER')
    expect(screen.getByTestId('selected-id')).toHaveTextContent('ALL')
    expect(screen.getByTestId('selected-name')).toHaveTextContent('Consolidated')
    expect(screen.getByTestId('can-select-all')).toHaveTextContent('yes')
  })

  it('updates selectedStoreId when store is selected', async () => {
    const user = userEvent.setup()
    renderStoreContext('OWNER')

    await act(async () => {
      await user.click(screen.getByText('Select Bekasi'))
    })

    expect(screen.getByTestId('selected-id')).toHaveTextContent('bks-1')
    expect(screen.getByTestId('selected-name')).toHaveTextContent('Cabang Bekasi')
    expect(localStorage.getItem('pos_admin_selected_store_id')).toBe('bks-1')

    await act(async () => {
      await user.click(screen.getByText('Select All'))
    })

    expect(screen.getByTestId('selected-id')).toHaveTextContent('ALL')
    expect(screen.getByTestId('selected-name')).toHaveTextContent('Consolidated')
  })
})
