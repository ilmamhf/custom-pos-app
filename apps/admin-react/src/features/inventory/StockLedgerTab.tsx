import React, { useState } from 'react'
import { useStockLedger } from '@/api/queries'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react'

interface StockLedgerTabProps {
  storeId?: string
}

export const StockLedgerTab: React.FC<StockLedgerTabProps> = ({ storeId }) => {
  const [page, setPage] = useState(1)
  const [reasonFilter, setReasonFilter] = useState<string>('')

  const { data: ledgerData, isLoading } = useStockLedger(
    storeId,
    undefined,
    reasonFilter || undefined,
    page,
    20
  )

  const totalPages = ledgerData ? Math.ceil(ledgerData.total / 20) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Immutable audit log recording every inventory movement (sales, restocks, transfers, refunds)
        </p>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value)
              setPage(1)
            }}
            className="h-8 text-xs rounded border border-slate-300 bg-white px-2.5 font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="">All Movement Reasons</option>
            <option value="RESTOCK">RESTOCK</option>
            <option value="SALE">SALE</option>
            <option value="TRANSFER_IN">TRANSFER IN</option>
            <option value="TRANSFER_OUT">TRANSFER OUT</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
            <option value="REFUND">REFUND</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">Store</th>
                <th className="py-2.5 px-4">Product Name</th>
                <th className="py-2.5 px-4 text-center">Movement</th>
                <th className="py-2.5 px-4">Reason</th>
                <th className="py-2.5 px-4">Note / Ref</th>
                <th className="py-2.5 px-4">Logged By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading ledger entries...
                  </td>
                </tr>
              ) : !ledgerData?.items || ledgerData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No ledger entries recorded
                  </td>
                </tr>
              ) : (
                ledgerData.items.map((entry) => {
                  const isPositive = entry.deltaQty > 0
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {entry.storeName}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {entry.productName}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold">
                        <span
                          className={
                            isPositive ? 'text-emerald-600' : 'text-red-600'
                          }
                        >
                          {isPositive ? `+${entry.deltaQty}` : entry.deltaQty}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge
                          status={entry.reason}
                          variant={
                            entry.reason === 'RESTOCK'
                              ? 'ACTIVE'
                              : entry.reason === 'REFUND'
                              ? 'PARTIALLY_REFUNDED'
                              : undefined
                          }
                        />
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                        {entry.note || entry.referenceId || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {entry.createdByName || 'System'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {ledgerData && ledgerData.total > 0 && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> (
              {ledgerData.total} audit movements)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
