import React, { useState, useEffect } from 'react'
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
import { StoreInventoryItem, Store } from '@/api/types'
import { useAdjustStock } from '@/api/queries'
import { AlertCircle, PlusCircle } from 'lucide-react'

interface AdjustStockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StoreInventoryItem | null
  stores: Store[]
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  open,
  onOpenChange,
  item,
  stores,
}) => {
  const [storeId, setStoreId] = useState('')
  const [reason, setReason] = useState<'RESTOCK' | 'ADJUSTMENT'>('RESTOCK')
  const [deltaQty, setDeltaQty] = useState<number>(10)
  const [note, setNote] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const adjustMutation = useAdjustStock()

  useEffect(() => {
    if (item) {
      setStoreId(item.storeId)
      // If stock is negative, prefill reconcile adjustment to bring to 0 or positive
      if (item.stockOnHand < 0) {
        setReason('ADJUSTMENT')
        setDeltaQty(Math.abs(item.stockOnHand))
        setNote(`Reconcile negative stock (${item.stockOnHand}) from offline POS sales`)
      } else {
        setReason('RESTOCK')
        setDeltaQty(10)
        setNote('')
      }
    } else if (stores.length > 0 && !storeId) {
      setStoreId(stores[0].id)
    }
  }, [item, stores, storeId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!storeId) {
      setErrorMsg('Please select a target store.')
      return
    }

    if (!item?.productId) {
      setErrorMsg('Product must be selected.')
      return
    }

    if (deltaQty === 0 || isNaN(deltaQty)) {
      setErrorMsg('Adjustment quantity cannot be 0.')
      return
    }

    try {
      await adjustMutation.mutateAsync({
        storeId,
        productId: item.productId,
        deltaQty,
        reason,
        note: note.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Failed to adjust stock. Please try again.'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-50 text-emerald-600">
              <PlusCircle className="h-5 w-5" />
            </div>
            <DialogTitle>
              {item && item.stockOnHand < 0
                ? 'Reconcile Negative Stock'
                : 'Restock / Adjust Inventory'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {item ? (
              <>
                SKU: <strong>{item.sku}</strong> &bull; {item.productName} (Current Stock: <strong>{item.stockOnHand}</strong>)
              </>
            ) : (
              'Record stock in/out movement'
            )}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Store Branch
            </label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reason Type
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="RESTOCK">Supplier Restock (+)</option>
                <option value="ADJUSTMENT">Manual Adjustment (+ / -)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Delta Quantity
              </label>
              <Input
                type="number"
                value={deltaQty}
                onChange={(e) => setDeltaQty(parseInt(e.target.value) || 0)}
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {deltaQty > 0 ? `+${deltaQty} (Increase)` : `${deltaQty} (Decrease)`}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Audit Note
            </label>
            <Input
              placeholder="e.g. Supplier delivery invoice #442"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Updating...' : 'Submit Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
