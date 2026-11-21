import React, { useState } from 'react'
import { Store } from '@/api/types'
import { useStores, useUpdateStore } from '@/api/queries'
import { formatBps, parseBps } from '@/lib/formatters'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Store as StoreIcon, Edit, Percent } from 'lucide-react'

export const StoreConfigTab: React.FC = () => {
  const { data: stores, isLoading } = useStores()
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxPercentStr, setTaxPercentStr] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const updateMutation = useUpdateStore()

  const handleOpenEdit = (store: Store) => {
    setEditingStore(store)
    setName(store.name)
    setAddress(store.address || '')
    setTaxPercentStr((store.taxRateBps / 100).toString())
    setErrorMsg(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStore) return
    setErrorMsg(null)

    const taxBps = parseBps(taxPercentStr)
    if (taxBps < 0 || taxBps > 10000) {
      setErrorMsg('Tax rate must be between 0% and 100%.')
      return
    }

    try {
      await updateMutation.mutateAsync({
        id: editingStore.id,
        name: name.trim(),
        address: address.trim() || null,
        taxRateBps: taxBps,
      })
      setEditingStore(null)
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to update store.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Configure physical branch names, addresses, and local tax rates (PB1 / PPN in basis points)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-8 text-center text-sm text-slate-400">
            Loading stores...
          </div>
        ) : (
          stores?.map((store) => (
            <div
              key={store.id}
              className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-slate-100 text-slate-800">
                      <StoreIcon className="h-4 w-4" />
                    </div>
                    <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                      {store.code}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      store.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {store.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <h3 className="font-semibold text-slate-900 text-base">
                  {store.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {store.address || 'No address provided'}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Percent className="h-3 w-3 text-slate-400" />
                    Branch Tax Rate:
                  </span>
                  <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    {formatBps(store.taxRateBps)} ({store.taxRateBps} bps)
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => handleOpenEdit(store)}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit Configuration
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Store Modal */}
      {editingStore && (
        <Dialog
          open={!!editingStore}
          onOpenChange={(open) => !open && setEditingStore(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Branch Configuration</DialogTitle>
            </DialogHeader>

            {errorMsg && (
              <div className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Store Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Address
                </label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Physical street address"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tax Rate (%)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxPercentStr}
                    onChange={(e) => setTaxPercentStr(e.target.value)}
                    required
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Translates to {parseBps(taxPercentStr)} basis points (bps) in database.
                </span>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingStore(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
