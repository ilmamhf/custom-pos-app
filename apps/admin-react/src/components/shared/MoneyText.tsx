import React from 'react'
import { cn } from '@/lib/utils'
import { formatIdr } from '@/lib/formatters'

interface MoneyTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number
  showSign?: boolean
}

export const MoneyText: React.FC<MoneyTextProps> = ({
  amount,
  showSign = false,
  className,
  ...props
}) => {
  const isPositive = amount > 0
  const isNegative = amount < 0

  return (
    <span
      className={cn(
        'font-mono tabular-nums font-medium',
        isNegative && 'text-red-600',
        className
      )}
      {...props}
    >
      {showSign && isPositive ? `+${formatIdr(amount)}` : formatIdr(amount)}
    </span>
  )
}
