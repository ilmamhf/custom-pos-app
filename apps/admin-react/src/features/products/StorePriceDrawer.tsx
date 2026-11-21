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
import { Product, Store } from '@/api/types'
import { useSetStorePriceOverride } from '@/api/queries'
import { formatIdr, parseIdr } from '@/lib/formatters'
import { Store as StoreIcon, Tag, AlertCircle } from 'lucide-react'

interface StorePriceDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  stores: Store[]
}

export const StorePriceDrawer: React.FC<StorePriceDrawerProps> = ({
  open,
  onOpenChange,
  product,
  stores,
}) => {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    stores[0]?.id || ''
  )
  const [overrideInput, setOverrideInput] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const priceMutation = useSetStorePriceOverride()

  if (!product) return null

  const activeStore = stores.find((s) => s.id === selectedStoreId) || stores[0]

  const handleSaveOverride = async () => {
    if (!activeStore) return
    setErrorMsg(null)

    const price = parseIdr(overrideInput)
    if (price <= 0) {
      setErrorMsg('Override price must be greater than 0.')
      return
    }

    try {
      await priceMutation.mutateAsync({
        storeId: activeStore.id,
        productId: product.id,
        priceOverride: price,
      })
      onOpenChange(false)
      setOverrideInput('')
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Failed to update store price override.'
      )
    }
  }

  const handleClearOverride = async () => {
    if (!activeStore) return
    setErrorMsg(null)

    try {
      await priceMutation.mutateAsync({
        storeId: activeStore.id,
        productId: product.id,
        priceOverride: null, // Clear override
      })
      onOpenChange(false)
      setOverrideInput('')
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Failed to clear price override.'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-50 text-blue-600">
              <Tag className="h-5 w-5" />
            </div>
            <DialogTitle>Per-Store Price Override</DialogTitle>
          </div>
          <DialogDescription>
            SKU: <strong>{product.sku}</strong> &bull; {product.name}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Central Master Price Indicator */}
        <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-xs flex items-center justify-between">
          <span className="text-slate-600">Central Master Base Price:</span>
          <span className="font-mono font-bold text-slate-900 text-sm">
            {formatIdr(product.basePrice)}
          </span>
        </div>

        {/* Select Target Store */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Select Retail Store
          </label>
          <div className="grid grid-cols-2 gap-2">
            {stores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => {
                  setSelectedStoreId(store.id)
                  setErrorMsg(null)
                }}
                className={`flex items-center gap-2 p-2.5 rounded border text-left text-xs transition-colors ${
                  activeStore?.id === store.id
                    ? 'border-slate-900 bg-slate-900 text-white font-medium shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <StoreIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{store.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Override Price Input */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            Set Specific Price for {activeStore?.name} (IDR)
          </label>
          <Input
            type="number"
            placeholder={product.basePrice.toString()}
            value={overrideInput}
            onChange={(e) => setOverrideInput(e.target.value)}
          />
          {overrideInput && !isNaN(parseInt(overrideInput)) && (
            <span className="text-xs text-slate-500 block">
              New Store Price: {formatIdr(parseIdr(overrideInput))}
            </span>
          )}
          <p className="text-[11px] text-slate-500">
            If no override is set, this store automatically charges the central base price ({formatIdr(product.basePrice)}).
          </p>
        </div>

        <DialogFooter className="mt-4 flex items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearOverride}
            disabled={priceMutation.isPending}
          >
            Clear Override (Reset to Base)
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSaveOverride}
            disabled={priceMutation.isPending || !overrideInput}
          >
            {priceMutation.isPending ? 'Saving...' : 'Save Price'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
