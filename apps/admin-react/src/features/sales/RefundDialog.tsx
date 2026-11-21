import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sale } from '@/api/types'
import { useRefundSale } from '@/api/queries'
import { formatIdr } from '@/lib/formatters'
import { ShieldCheck, AlertCircle } from 'lucide-react'

interface RefundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
  onSuccess: () => void
}

export const RefundDialog: React.FC<RefundDialogProps> = ({
  open,
  onOpenChange,
  sale,
  onSuccess,
}) => {
  const [managerPin, setManagerPin] = useState('')
  const [reason, setReason] = useState('')
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refundMutation = useRefundSale()

  if (!sale) return null

  // Initialize or get refundable items
  const refundableItems = sale.items.filter(
    (item) => item.qty - (item.refundedQty || 0) > 0
  )

  const handleQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxQty, Math.floor(val)))
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: clamped,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!managerPin || managerPin.length < 4) {
      setErrorMessage('Please enter a valid Manager or Owner PIN (minimum 4 digits).')
      return
    }

    if (!reason.trim()) {
      setErrorMessage('Please provide a reason for the refund.')
      return
    }

    const itemsToRefund = Object.entries(itemQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([saleItemId, refundQty]) => ({ saleItemId, refundQty }))

    if (itemsToRefund.length === 0) {
      setErrorMessage('Please select at least 1 item quantity to refund.')
      return
    }

    try {
      await refundMutation.mutateAsync({
        saleId: sale.id,
        managerPin,
        reason: reason.trim(),
        items: itemsToRefund,
      })

      onSuccess()
      onOpenChange(false)
      setManagerPin('')
      setReason('')
      setItemQuantities({})
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Refund failed. Verify Manager PIN and try again.'
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-amber-50 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle>Process Item Refund</DialogTitle>
          </div>
          <DialogDescription>
            Receipt: <strong>{sale.receiptNo}</strong> &bull; Requires Supervisor Authorization
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Select Items to Refund
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-md p-2">
              {refundableItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-2 text-center">
                  All items in this receipt have already been refunded.
                </p>
              ) : (
                refundableItems.map((item) => {
                  const maxQty = item.qty - (item.refundedQty || 0)
                  const selectedQty = itemQuantities[item.id] || 0
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border border-slate-100"
                    >
                      <div className="flex-1 mr-2">
                        <p className="font-medium text-slate-900 truncate">
                          {item.productNameSnapshot}
                        </p>
                        <p className="text-slate-500">
                          {formatIdr(item.unitPrice)} &bull; Available: {maxQty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-500">Qty:</label>
                        <input
                          type="number"
                          min="0"
                          max={maxQty}
                          value={selectedQty}
                          onChange={(e) =>
                            handleQtyChange(item.id, maxQty, parseInt(e.target.value) || 0)
                          }
                          className="w-16 h-8 text-center border border-slate-300 rounded text-xs focus:ring-1 focus:ring-slate-900"
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Refund Reason
            </label>
            <Input
              placeholder="e.g., Wrong item ordered, customer return"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Manager / Owner PIN
            </label>
            <Input
              type="password"
              placeholder="6-digit supervisor PIN"
              maxLength={6}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
            />
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={refundMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={refundMutation.isPending || refundableItems.length === 0}
            >
              {refundMutation.isPending ? 'Processing Refund...' : 'Authorize Refund'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
