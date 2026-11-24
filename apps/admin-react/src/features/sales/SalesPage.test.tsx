import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '@/context/AuthContext'
import { StoreProvider } from '@/context/StoreContext'
import { SalesPage } from './SalesPage'
import userEvent from '@testing-library/user-event'
import { Store } from '@/api/types'
import { server } from '@/test/mocks/server'

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

const sampleSale = {
  id: 'sale-1',
  receiptNo: 'BKS-2026-11-24-001',
  storeId: 'bks-1',
  storeName: 'Cabang Bekasi',
  cashierId: 'u3',
  cashierName: 'Kasir Satu',
  subtotal: 18000,
  taxTotal: 1980,
  discountTotal: 0,
  grandTotal: 19980,
  paymentMethod: 'CASH' as const,
  status: 'COMPLETED' as const,
  createdAt: '2026-11-24T04:30:00.000Z',
  items: [],
}

function renderSales() {
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
          <SalesPage />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

/** Records every sales query the page makes. */
function captureSalesQueries(total = 0) {
  const urls: URL[] = []
  server.use(
    http.get('/api/v1/sales', ({ request }) => {
      urls.push(new URL(request.url))
      return HttpResponse.json({
        items: total > 0 ? [sampleSale] : [],
        total,
        page: 1,
        limit: 15,
      })
    })
  )
  return urls
}

describe('Sales date range filter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sends the picked days to the API as inclusive local-day bounds', async () => {
    const urls = captureSalesQueries()
    renderSales()

    expect(await screen.findByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-24' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-24' } })

    await waitFor(() => {
      const last = urls[urls.length - 1]
      expect(last.searchParams.get('from')).toBeTruthy()
      expect(last.searchParams.get('to')).toBeTruthy()
    })

    const last = urls[urls.length - 1]
    const from = new Date(last.searchParams.get('from')!)
    const to = new Date(last.searchParams.get('to')!)

    // The whole picked day is inside the range, not only its first instant.
    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
    expect(to.getSeconds()).toBe(59)
    expect(to.getMilliseconds()).toBe(999)
  })

  it('clears the date range and the status filter', async () => {
    const user = userEvent.setup()
    captureSalesQueries()
    renderSales()

    expect(await screen.findByLabelText('From')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-24' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'COMPLETED' } })
    await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('2026-11-24'))

    await user.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(screen.getByLabelText('From')).toHaveValue('')
    expect(screen.getByLabelText('To')).toHaveValue('')
    expect(screen.getByLabelText('Status')).toHaveValue('')
  })

  it('refuses a reversed range and does not send it to the API', async () => {
    const urls = captureSalesQueries()
    renderSales()

    await waitFor(() => expect(urls.length).toBeGreaterThan(0))

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-25' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-24' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /start date is after the end date/i
    )

    // No query ever carried both bounds of the reversed range.
    const withBothBounds = urls.filter(
      (url) => url.searchParams.get('from') && url.searchParams.get('to')
    )
    expect(withBothBounds).toHaveLength(0)
  })

  it('goes back to the first page when the range changes', async () => {
    const user = userEvent.setup()
    const urls = captureSalesQueries(40)
    renderSales()

    expect(await screen.findByText(/total receipts/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^next$/i }))
    await waitFor(() =>
      expect(urls[urls.length - 1].searchParams.get('page')).toBe('2')
    )

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-24' } })

    await waitFor(() =>
      expect(urls[urls.length - 1].searchParams.get('page')).toBe('1')
    )
  })

  it('names the reason when no receipt matches the filters', async () => {
    captureSalesQueries(0)
    renderSales()

    await screen.findByLabelText('From')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-24' } })

    expect(
      await screen.findByText(/no receipts match the selected filters/i)
    ).toBeInTheDocument()
  })
})
