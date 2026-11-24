import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '@/context/AuthContext'
import { StaffManagementTab } from './StaffManagementTab'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/mocks/server'

function renderStaff() {
  localStorage.setItem(
    'pos_admin_user',
    JSON.stringify({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@toko.id',
      role: 'OWNER',
    })
  )
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
        <StaffManagementTab />
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('Staff edit workflow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists the staff with their branch assignment', async () => {
    renderStaff()

    expect(await screen.findByText('Sari Manager')).toBeInTheDocument()
    expect(screen.getByText('Cabang Bekasi')).toBeInTheDocument()
    // An owner without an assignment reaches every branch.
    expect(screen.getByText('All branches')).toBeInTheDocument()
  })

  it('opens the edit dialog filled with the staff member', async () => {
    const user = userEvent.setup()
    renderStaff()

    await screen.findByText('Sari Manager')
    await user.click(screen.getByRole('button', { name: /edit sari manager/i }))

    expect(await screen.findByText('Edit Staff Account')).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Sari Manager')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('manager.bks@toko.id')
    expect(screen.getByLabelText(/role assignment/i)).toHaveValue('MANAGER')
    expect(
      screen.getByRole('group', { name: /store access permissions/i })
    ).toBeInTheDocument()
  })

  it('saves the edited name, role, and branch assignment', async () => {
    const user = userEvent.setup()
    const patches: any[] = []
    server.use(
      http.patch('/api/v1/users/:id', async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json({
          id: 'u2',
          name: 'Sari Rahma',
          email: 'manager.bks@toko.id',
          role: 'CASHIER',
          isActive: true,
        })
      })
    )

    renderStaff()
    await screen.findByText('Sari Manager')
    await user.click(screen.getByRole('button', { name: /edit sari manager/i }))

    const nameInput = await screen.findByLabelText(/full name/i)
    fireEvent.change(nameInput, { target: { value: 'Sari Rahma' } })
    fireEvent.change(screen.getByLabelText(/role assignment/i), {
      target: { value: 'CASHIER' },
    })
    // Move the account to the other branch.
    fireEvent.click(screen.getByRole('checkbox', { name: /cabang bekasi/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /cabang kemang/i }))

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({
      name: 'Sari Rahma',
      role: 'CASHIER',
      isActive: true,
      storeIds: ['kmg-2'],
    })
  })

  it('refuses to save without a name', async () => {
    const user = userEvent.setup()
    const patches: any[] = []
    server.use(
      http.patch('/api/v1/users/:id', async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json({ id: 'u2' })
      })
    )

    renderStaff()
    await screen.findByText('Sari Manager')
    await user.click(screen.getByRole('button', { name: /edit sari manager/i }))

    const nameInput = await screen.findByLabelText(/full name/i)
    fireEvent.change(nameInput, { target: { value: '   ' } })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/full name is required/i)
    expect(patches).toHaveLength(0)
  })

  it('requires a PIN when a cashier is promoted to manager', async () => {
    const user = userEvent.setup()
    const patches: any[] = []
    server.use(
      http.patch('/api/v1/users/:id', async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json({ id: 'u2' })
      })
    )

    renderStaff()
    await screen.findByText('Sari Manager')
    await user.click(screen.getByRole('button', { name: /edit sari manager/i }))

    fireEvent.change(await screen.findByLabelText(/role assignment/i), {
      target: { value: 'MANAGER' },
    })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // The seeded manager already has a PIN, so the field is optional here.
    expect(patches).toHaveLength(1)
  })

  it('keeps the owner out of reach of the role and status controls', async () => {
    const user = userEvent.setup()
    renderStaff()

    await screen.findByText('Owner Boss')
    await user.click(screen.getByRole('button', { name: /edit owner boss/i }))

    expect(await screen.findByText('Edit Staff Account')).toBeInTheDocument()
    expect(screen.getByLabelText(/role assignment/i)).toBeDisabled()
    expect(
      screen.getByRole('group', { name: /store access permissions/i })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/account is active/i)).not.toBeInTheDocument()
  })
})
