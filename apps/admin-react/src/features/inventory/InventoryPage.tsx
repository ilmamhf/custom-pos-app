import React, { useState } from 'react'
import { useStore } from '@/context/StoreContext'
import { useInventory } from '@/api/queries'
import { StoreInventoryItem } from '@/api/types'
import { MoneyText } from '@/components/shared/MoneyText'
import { AdjustStockModal } from './AdjustStockModal'
import { TransferStockModal } from './TransferStockModal'
import { StockLedgerTab } from './StockLedgerTab'
import { Button } from '@/components/ui/Button'
import {
  Boxes,
  AlertTriangle,
  ArrowRightLeft,
  PlusCircle,
  History,
  Store as StoreIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'

export const InventoryPage: React.FC = () => {
  const { selectedStoreId, selectedStore, availableStores } = useStore()
  const [activeTab, setActiveTab] = useState<'STOCK' | 'LEDGER'>('STOCK')
  const [page, setPage] = useState(1)
  const [lowStockFilter, setLowStockFilter] = useState(false)
  const [negativeFilter, setNegativeFilter] = useState(false)

  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StoreInventoryItem | null>(null)

  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferItem, setTransferItem] = useState<StoreInventoryItem | null>(null)

  const { data: inventoryData, isLoading } = useInventory(
    selectedStoreId,
    lowStockFilter,
    negativeFilter,
    page,
    15
  )

  // Find if there are any negative stock items in current inventory view
  const negativeItems =
    inventoryData?.items.filter((item) => item.stockOnHand < 0) || []

  const totalPages = inventoryData ? Math.ceil(inventoryData.total / 15) : 1

  const handleOpenAdjust = (item: StoreInventoryItem) => {
    setAdjustItem(item)
    setAdjustModalOpen(true)
  }

  const handleOpenTransfer = (item: StoreInventoryItem) => {
    setTransferItem(item)
    setTransferModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Inventory & Stock Management
            </h1>
            {selectedStore && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                <StoreIcon className="h-3 w-3" />
                {selectedStore.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time multi-branch stock levels, negative reconciliation, and inter-store transfers
          </p>
        </div>

        {/* Tab switchers */}
        <div className="inline-flex rounded-md shadow-sm border border-slate-200 bg-white p-1">
          <button
            onClick={() => setActiveTab('STOCK')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'STOCK'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="h-3.5 w-3.5" />
            Stock Levels
          </button>
          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'LEDGER'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Audit Ledger
          </button>
        </div>
      </div>

      {activeTab === 'STOCK' ? (
        <>
          {/* Prominent Negative Stock Alert Banner */}
          {negativeItems.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-red-800">
                    Negative Stock Discrepancy Detected ({negativeItems.length} SKUs)
                  </h3>
                  <p className="text-xs text-red-700 mt-0.5">
                    Offline POS sales completed while connection was offline caused stock to dip below zero. Immediate supplier restock or physical count adjustment required.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 text-xs gap-1"
                onClick={() => handleOpenAdjust(negativeItems[0])}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                1-Click Reconcile Discrepancy
              </Button>
            </div>
          )}

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNegativeFilter(!negativeFilter)
                setPage(1)
              }}
              data-testid="negative-stock-filter-pill"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                negativeFilter
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Negative Stock Alerts {negativeItems.length > 0 && `(${negativeItems.length})`}
            </button>

            <button
              onClick={() => {
                setLowStockFilter(!lowStockFilter)
                setPage(1)
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                lowStockFilter
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
              }`}
            >
              Low Stock (&le; 10 units)
            </button>
          </div>

          {/* Stock Levels Table Card */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">Store Branch</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4 text-center">Stock on Hand</th>
                    <th className="py-3 px-4 text-right">Master Base Price</th>
                    <th className="py-3 px-4 text-right">Effective Store Price</th>
                    <th className="py-3 px-4 text-right">Inventory Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                        Loading inventory records...
                      </td>
                    </tr>
                  ) : !inventoryData?.items || inventoryData.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                        No inventory items matching this filter
                      </td>
                    </tr>
                  ) : (
                    inventoryData.items.map((inv) => {
                      const isNegative = inv.stockOnHand < 0
                      const isLow = inv.stockOnHand >= 0 && inv.stockOnHand <= 10
                      const hasOverride =
                        inv.priceOverride !== null && inv.priceOverride !== undefined

                      return (
                        <tr
                          key={`${inv.storeId}-${inv.productId}`}
                          className={`hover:bg-slate-50/80 ${
                            isNegative ? 'bg-red-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-medium text-slate-700">
                            {inv.storeName}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            {inv.sku}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {inv.productName}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span
                              className={`px-2.5 py-1 rounded text-xs font-bold ${
                                isNegative
                                  ? 'bg-red-100 text-red-800 border border-red-300'
                                  : isLow
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'text-slate-800'
                              }`}
                            >
                              {inv.stockOnHand}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500 text-xs">
                            <MoneyText amount={inv.basePrice} />
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {hasOverride ? (
                              <span className="font-semibold text-blue-600">
                                <MoneyText amount={inv.effectivePrice} />
                              </span>
                            ) : (
                              <span className="text-slate-700">
                                <MoneyText amount={inv.effectivePrice} />
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* 1-Click Reconcile button for negative items */}
                              {isNegative && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => handleOpenAdjust(inv)}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Reconcile
                                </Button>
                              )}

                              {/* Restock / Adjust */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                onClick={() => handleOpenAdjust(inv)}
                              >
                                <PlusCircle className="h-3.5 w-3.5 text-slate-600" />
                                Restock
                              </Button>

                              {/* Inter-Store Transfer */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                onClick={() => handleOpenTransfer(inv)}
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5 text-slate-600" />
                                Transfer
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {inventoryData && inventoryData.total > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> (
                  {inventoryData.total} inventory SKU locations)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Stock Ledger Audit Tab */
        <StockLedgerTab storeId={selectedStoreId} />
      )}

      {/* Adjust / Restock Modal */}
      <AdjustStockModal
        open={adjustModalOpen}
        onOpenChange={setAdjustModalOpen}
        item={adjustItem}
        stores={availableStores}
      />

      {/* Inter-Store Transfer Modal */}
      <TransferStockModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
        item={transferItem}
        stores={availableStores}
      />
    </div>
  )
}
