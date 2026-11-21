import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { PaymentBreakdown } from '@/api/types'
import { formatIdr } from '@/lib/formatters'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'

interface PaymentBreakdownChartProps {
  data: PaymentBreakdown[]
}

const COLORS: Record<string, string> = {
  QRIS: '#4f46e5', // Indigo
  CASH: '#10b981', // Emerald
  CARD: '#0ea5e9', // Sky
  SPLIT: '#f59e0b', // Amber
}

export const PaymentBreakdownChart: React.FC<PaymentBreakdownChartProps> = ({
  data,
}) => {
  if (!data || data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Payment Method Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-slate-400 text-sm">
          No transaction data available for this range
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((item) => ({
    name: item.method,
    value: item.total,
    count: item.count,
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload
      return (
        <div className="bg-slate-900 text-white text-xs p-2.5 rounded shadow-lg border border-slate-700">
          <p className="font-semibold">{entry.name}</p>
          <p className="mt-1 font-mono text-emerald-400">
            {formatIdr(entry.value)}
          </p>
          <p className="text-slate-300">{entry.count} transactions</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle>Payment Method Split</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={85}
              innerRadius={50}
              paddingAngle={3}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[entry.name] || '#64748b'}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              formatter={(value, entry: any) => (
                <span className="text-xs text-slate-700 font-medium">
                  {value} ({formatIdr(entry.payload.value)})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
