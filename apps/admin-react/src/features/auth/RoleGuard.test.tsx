import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoleGuard } from './RoleGuard'
import { AuthProvider } from '@/context/AuthContext'
import { Role } from '@/api/types'

function renderWithAuth(
  ui: React.ReactElement,
  role: Role = 'MANAGER'
) {
  const mockUser = {
    id: 'user-1',
    name: 'Test Manager',
    email: 'test@toko.id',
    role,
  }
  localStorage.setItem('pos_admin_user', JSON.stringify(mockUser))
  localStorage.setItem('pos_access_token', 'mock-token')

  return render(<AuthProvider>{ui}</AuthProvider>)
}

describe('RoleGuard Component', () => {
  it('renders restricted fallback when user role is not permitted', () => {
    renderWithAuth(
      <RoleGuard allowedRoles={['OWNER']}>
        <div>Owner Secret Settings</div>
      </RoleGuard>,
      'MANAGER'
    )

    expect(screen.queryByText('Owner Secret Settings')).not.toBeInTheDocument()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
    expect(screen.getByText(/requires/i)).toBeInTheDocument()
  })

  it('renders children when user role is authorized', () => {
    renderWithAuth(
      <RoleGuard allowedRoles={['OWNER']}>
        <div>Owner Secret Settings</div>
      </RoleGuard>,
      'OWNER'
    )

    expect(screen.getByText('Owner Secret Settings')).toBeInTheDocument()
    expect(screen.queryByText('Access Restricted')).not.toBeInTheDocument()
  })

  it('renders custom fallback when provided and unauthorized', () => {
    renderWithAuth(
      <RoleGuard
        allowedRoles={['OWNER']}
        fallback={<div>Custom Unauthorized Message</div>}
      >
        <div>Owner Secret Settings</div>
      </RoleGuard>,
      'MANAGER'
    )

    expect(screen.queryByText('Owner Secret Settings')).not.toBeInTheDocument()
    expect(screen.getByText('Custom Unauthorized Message')).toBeInTheDocument()
  })
})
