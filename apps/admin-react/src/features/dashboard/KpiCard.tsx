import React from 'react'
import { Card } from '@/components/ui/Card'
import { MoneyText } from '@/components/shared/MoneyText'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: number
  isCurrency?: boolean
  subtitle?: string
  icon: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'primary'
  badge?: string
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  isCurrency = false,
  subtitle,
  icon: Icon,
  variant = 'default',
  badge,
}) => {
  const iconBg = {
    default: 'bg-slate-100 text-slate-700',
    primary: 'bg-indigo-50 text-indigo-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
  }[variant]

  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div className={cn('p-2 rounded-md', iconBg)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3">
        {isCurrency ? (
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            <MoneyText amount={value} />
          </div>
        ) : (
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {value.toLocaleString('id-ID')}
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          {subtitle && <span>{subtitle}</span>}
          {badge && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
              {badge}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
