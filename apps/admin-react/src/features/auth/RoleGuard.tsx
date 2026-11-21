import React from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Role } from '@/api/types'

interface RoleGuardProps {
  allowedRoles: Role[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallback,
}) => {
  const { role } = useAuth()

  if (!role || !allowedRoles.includes(role)) {
    if (fallback !== undefined) {
      return <>{fallback}</>
    }

    return (
      <div className="p-8 max-w-lg mx-auto mt-12 bg-white rounded-lg border border-slate-200 text-center shadow-sm">
        <div className="h-12 w-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Access Restricted</h2>
        <p className="mt-2 text-sm text-slate-600">
          This section requires <strong>{allowedRoles.join(' or ')}</strong> privileges.
          Your current role is <strong>{role || 'Unknown'}</strong>.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
