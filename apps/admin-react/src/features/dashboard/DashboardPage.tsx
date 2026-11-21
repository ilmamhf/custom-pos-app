import React, { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  Store as StoreIcon,
  RefreshCw,
} from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { useReportSummary } from '@/api/queries'
import { KpiCard } from './KpiCard'
import { PaymentBreakdownChart } from './PaymentBreakdownChart'
import { TopProductsTable } from './TopProductsTable'
import { Button } from '@/components/ui/Button'

type DatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL'

export const DashboardPage: React.FC = () => {
  const { selectedStoreId, selectedStore } = useStore()
  const [preset, setPreset] = useState<DatePreset>('MONTH')

  // Calculate stable dates based on preset
  const { from, to } = useMemo(() => {
    const now = new Date()
    if (preset === 'TODAY') {
      const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { from: fromDate.toISOString().split('T')[0], to: undefined }
    }
    if (preset === 'WEEK') {
      const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return { from: fromDate.toISOString().split('T')[0], to: undefined }
    }
    if (preset === 'MONTH') {
      const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      return { from: fromDate.toISOString().split('T')[0], to: undefined }
    }
    return { from: undefined, to: undefined }
  }, [preset])

  const {
    data: summary,
    isRefetching,
    refetch,
    error,
  } = useReportSummary(selectedStoreId, from, to)

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Overview Dashboard
            </h1>
            {selectedStore ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                <StoreIcon className="h-3 w-3" />
                {selectedStore.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                <StoreIcon className="h-3 w-3" />
                Consolidated All Branches
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time financial performance and sales telemetry
          </p>
        </div>

        {/* Date presets & refresh */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md shadow-sm border border-slate-200 bg-white p-1">
            <button
              onClick={() => setPreset('TODAY')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                preset === 'TODAY'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setPreset('WEEK')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                preset === 'WEEK'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPreset('MONTH')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                preset === 'MONTH'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setPreset('ALL')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                preset === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load summary reports. Please verify your connection or store access.
        </div>
      ) : null}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Gross Sales"
          value={summary?.grossSales ?? 0}
          isCurrency
          icon={DollarSign}
          variant="primary"
          subtitle="Pre-refund total"
        />
        <KpiCard
          title="Refund Total"
          value={summary?.refundTotal ?? 0}
          isCurrency
          icon={TrendingDown}
          variant="warning"
          subtitle="Customer returns"
        />
        <KpiCard
          title="Net Sales"
          value={summary?.netSales ?? 0}
          isCurrency
          icon={TrendingUp}
          variant="success"
          subtitle="Gross minus refunds"
        />
        <KpiCard
          title="Transactions"
          value={summary?.transactionCount ?? 0}
          icon={Receipt}
          variant="default"
          subtitle="Completed receipts"
        />
      </div>

      {/* Charts & Top Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <PaymentBreakdownChart data={summary?.paymentBreakdown ?? []} />
        </div>
        <div className="lg:col-span-7">
          <TopProductsTable products={summary?.topProducts ?? []} />
        </div>
      </div>
    </div>
  )
}
