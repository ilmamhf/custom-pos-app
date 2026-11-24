import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/context/StoreContext'
import { useSales } from '@/api/queries'
import { Sale } from '@/api/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MoneyText } from '@/components/shared/MoneyText'
import { formatDateTime } from '@/lib/formatters'
import { toApiDateRange } from '@/lib/date-range'
import { ReceiptDetailDrawer } from './ReceiptDetailDrawer'
import { RefundDialog } from './RefundDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Store as StoreIcon,
  X,
} from 'lucide-react'

const PAGE_SIZE = 15

export const SalesPage: React.FC = () => {
  const { selectedStoreId, selectedStore } = useStore()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)

  const dateRange = useMemo(() => toApiDateRange(fromDate, toDate), [fromDate, toDate])
  const rangeError = dateRange.error
  const filtersActive = Boolean(fromDate || toDate || statusFilter)

  const {
    data: salesData,
    isLoading,
    error,
    refetch,
  } = useSales(
    selectedStoreId,
    rangeError ? undefined : dateRange.bounds.from,
    rangeError ? undefined : dateRange.bounds.to,
    statusFilter || undefined,
    page,
    PAGE_SIZE,
    !rangeError
  )

  useEffect(() => {
    setPage(1)
  }, [selectedStoreId])

  const totalPages = salesData ? Math.ceil(salesData.total / PAGE_SIZE) : 1

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setStatusFilter('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sales Receipts & History
            </h1>
            {selectedStore && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                <StoreIcon className="h-3 w-3" aria-hidden="true" />
                {selectedStore.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Browse transaction receipts and manage supervisor refunds
          </p>
        </div>
      </div>

      {/*
        The filter strip sits between the header and the table because every
        control here narrows the table below it. One bordered row keeps that
        relationship legible without adding a second card.
      */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          {/* The two ends of the range belong together, so they are grouped
              and never split apart when the row wraps. */}
          <div className="flex gap-3">
            <div className="w-40">
              <label
                htmlFor="sales-filter-from"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                From
              </label>
              <Input
                id="sales-filter-from"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
              />
            </div>

            <div className="w-40">
              <label
                htmlFor="sales-filter-to"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                To
              </label>
              <Input
                id="sales-filter-to"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => {
                  setToDate(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
              />
            </div>
          </div>

          <div className="w-48">
            <label
              htmlFor="sales-filter-status"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="sales-filter-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed Only</option>
              <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
              <option value="REFUNDED">Fully Refunded</option>
            </select>
          </div>

          <div className="sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              disabled={!filtersActive}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear filters
            </Button>
          </div>
        </div>

        {rangeError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            <span>
              {rangeError === 'reversed'
                ? 'The start date is after the end date. Pick the range in the other order.'
                : 'One of the dates is not a valid calendar date. Pick the range again.'}
            </span>
          </div>
        )}
      </div>

      {/* Receipts Table Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    Loading sales records...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-red-600">
                    Failed to load sales. Check your connection or store access.
                  </td>
                </tr>
              ) : rangeError ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    Fix the date range to see the receipts.
                  </td>
                </tr>
              ) : !salesData?.items || salesData.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    {filtersActive
                      ? 'No receipts match the selected filters. Try a wider date range or clear the filters.'
                      : 'No sales receipts found for this store yet.'}
                  </td>
                </tr>
              ) : (
                salesData.items.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedSale(sale)
                      setDetailOpen(true)
                    }}
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {sale.receiptNo}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {formatDateTime(sale.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {sale.storeName || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {sale.cashierName || 'Staff'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4"
                      data-testid={`sale-status-${sale.id}`}
                    >
                      <StatusBadge status={sale.status} variant={sale.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-900">
                      <MoneyText amount={sale.grandTotal} />
                    </td>
                    <td
                      className="py-3 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Open receipt ${sale.receiptNo}`}
                        onClick={() => {
                          setSelectedSale(sale)
                          setDetailOpen(true)
                        }}
                      >
                        <Eye className="h-4 w-4 text-slate-600" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {salesData && salesData.total > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> (
              {salesData.total} total receipts)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      <ReceiptDetailDrawer
        sale={selectedSale}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onOpenRefund={() => setRefundOpen(true)}
      />

      {/* PIN Refund Authorization Dialog */}
      <RefundDialog
        sale={selectedSale}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onSuccess={() => {
          refetch()
          setDetailOpen(false)
        }}
      />
    </div>
  )
}
