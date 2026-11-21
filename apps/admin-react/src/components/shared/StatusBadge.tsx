import React from 'react'
import { cn } from '@/lib/utils'

export type StatusVariant =
  | 'COMPLETED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'NEGATIVE'
  | 'WARNING'
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'

interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
  className?: string
}

const variantStyles: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIALLY_REFUNDED: 'bg-amber-50 text-amber-700 border-amber-200',
  WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
  REFUNDED: 'bg-rose-50 text-rose-700 border-rose-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  NEGATIVE: 'bg-red-50 text-red-700 border-red-200 font-semibold',
  OWNER: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold',
  MANAGER: 'bg-blue-50 text-blue-700 border-blue-200',
  CASHIER: 'bg-slate-100 text-slate-700 border-slate-200',
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  className,
}) => {
  const key = variant || status
  const style =
    variantStyles[key] || 'bg-slate-50 text-slate-700 border-slate-200'

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium uppercase tracking-wide',
        style,
        className
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
