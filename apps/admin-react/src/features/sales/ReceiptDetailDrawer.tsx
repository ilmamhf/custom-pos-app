import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MoneyText } from '@/components/shared/MoneyText'
import { formatDateTime } from '@/lib/formatters'
import { Sale } from '@/api/types'
import { Receipt, Store as StoreIcon, User, RotateCcw } from 'lucide-react'

interface ReceiptDetailDrawerProps {
  sale: Sale | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenRefund: () => void
}

export const ReceiptDetailDrawer: React.FC<ReceiptDetailDrawerProps> = ({
  sale,
  open,
  onOpenChange,
  onOpenRefund,
}) => {
  if (!sale) return null

  const isFullyRefunded = sale.status === 'REFUNDED'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-slate-700" />
              <DialogTitle className="text-lg font-bold">
                {sale.receiptNo}
              </DialogTitle>
            </div>
            <StatusBadge status={sale.status} variant={sale.status} />
          </div>
        </DialogHeader>

        {/* Metadata info */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-md border border-slate-200">
          <div>
            <span className="text-slate-500 block">Date & Time:</span>
            <span className="font-medium text-slate-800">
              {formatDateTime(sale.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Payment Method:</span>
            <span className="font-semibold text-indigo-700">
              {sale.paymentMethod}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StoreIcon className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-medium text-slate-800">
              {sale.storeName || 'Store'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-slate-700">
              Cashier: {sale.cashierName || 'Staff'}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div>
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Items Purchased
          </h4>
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">Item</th>
                  <th className="p-2.5 text-right">Price</th>
                  <th className="p-2.5 text-center">Qty</th>
                  <th className="p-2.5 text-center">Refunded</th>
                  <th className="p-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-medium text-slate-800">
                      {item.productNameSnapshot}
                    </td>
                    <td className="p-2.5 text-right">
                      <MoneyText amount={item.unitPrice} />
                    </td>
                    <td className="p-2.5 text-center font-mono">{item.qty}</td>
                    <td className="p-2.5 text-center font-mono">
                      {item.refundedQty > 0 ? (
                        <span className="text-red-600 font-semibold">
                          {item.refundedQty}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2.5 text-right font-medium">
                      <MoneyText amount={item.unitPrice * item.qty} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals Breakdown */}
        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <MoneyText amount={sale.subtotal} />
          </div>
          <div className="flex justify-between">
            <span>Tax (PB1 / PPN):</span>
            <MoneyText amount={sale.taxTotal} />
          </div>
          {sale.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount:</span>
              <span>-<MoneyText amount={sale.discountTotal} /></span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-2">
            <span>Grand Total:</span>
            <MoneyText amount={sale.grandTotal} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>

          {!isFullyRefunded && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onOpenRefund}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Process Refund
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
