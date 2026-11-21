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
import { useTransferStock } from '@/api/queries'
import { ArrowRightLeft, AlertCircle } from 'lucide-react'

interface TransferStockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StoreInventoryItem | null
  stores: Store[]
}

export const TransferStockModal: React.FC<TransferStockModalProps> = ({
  open,
  onOpenChange,
  item,
  stores,
}) => {
  const [fromStoreId, setFromStoreId] = useState('')
  const [toStoreId, setToStoreId] = useState('')
  const [qty, setQty] = useState<number>(5)
  const [note, setNote] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const transferMutation = useTransferStock()

  useEffect(() => {
    if (item) {
      setFromStoreId(item.storeId)
      // Pick another store as default destination
      const otherStore = stores.find((s) => s.id !== item.storeId)
      if (otherStore) setToStoreId(otherStore.id)
    } else if (stores.length >= 2) {
      setFromStoreId(stores[0].id)
      setToStoreId(stores[1].id)
    }
  }, [item, stores])

  // Automatically ensure toStoreId is never equal to fromStoreId
  const handleFromChange = (newFrom: string) => {
    setFromStoreId(newFrom)
    if (toStoreId === newFrom) {
      const other = stores.find((s) => s.id !== newFrom)
      if (other) setToStoreId(other.id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!fromStoreId || !toStoreId) {
      setErrorMsg('Both source and destination stores are required.')
      return
    }

    if (fromStoreId === toStoreId) {
      setErrorMsg('Cannot transfer stock to the same store.')
      return
    }

    if (!item?.productId) {
      setErrorMsg('Product must be selected.')
      return
    }

    if (qty < 1 || isNaN(qty)) {
      setErrorMsg('Transfer quantity must be at least 1.')
      return
    }

    try {
      await transferMutation.mutateAsync({
        fromStoreId,
        toStoreId,
        productId: item.productId,
        qty,
        note: note.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Transfer failed. Please check inputs.'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-50 text-blue-600">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <DialogTitle>Inter-Store Stock Transfer</DialogTitle>
          </div>
          <DialogDescription>
            {item ? (
              <>
                SKU: <strong>{item.sku}</strong> &bull; {item.productName}
              </>
            ) : (
              'Atomically transfer inventory between branches'
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Source Store (From)
              </label>
              <select
                value={fromStoreId}
                onChange={(e) => handleFromChange(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Destination Store (To)
              </label>
              <select
                value={toStoreId}
                onChange={(e) => setToStoreId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {stores.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={s.id === fromStoreId}
                  >
                    {s.name} ({s.code}) {s.id === fromStoreId ? '(Source)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Quantity to Transfer (Min: 1)
            </label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Transfer Note (Optional)
            </label>
            <Input
              placeholder="e.g. Restock cabang Kemang from central store"
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
            <Button
              type="submit"
              disabled={transferMutation.isPending || fromStoreId === toStoreId}
            >
              {transferMutation.isPending ? 'Transferring...' : 'Execute Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
