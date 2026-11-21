import React, { useState } from 'react'
import { useStore } from '@/context/StoreContext'
import { useAuth } from '@/context/AuthContext'
import { useProducts } from '@/api/queries'
import { Product } from '@/api/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MoneyText } from '@/components/shared/MoneyText'
import { ProductModal } from './ProductModal'
import { StorePriceDrawer } from './StorePriceDrawer'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Plus,
  Search,
  Tag,
  Edit,
  ChevronLeft,
  ChevronRight,
  Store as StoreIcon,
} from 'lucide-react'

export const ProductsPage: React.FC = () => {
  const { selectedStoreId, selectedStore, availableStores } = useStore()
  const { role } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [priceDrawerOpen, setPriceDrawerOpen] = useState(false)
  const [priceProduct, setPriceProduct] = useState<Product | null>(null)

  const isOwner = role === 'OWNER'

  const {
    data: productsData,
    isLoading,
  } = useProducts(selectedStoreId, search || undefined, page, 15)

  const totalPages = productsData ? Math.ceil(productsData.total / 15) : 1

  const handleOpenCreate = () => {
    setEditingProduct(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product)
    setModalOpen(true)
  }

  const handleOpenPriceDrawer = (product: Product) => {
    setPriceProduct(product)
    setPriceDrawerOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Master Product Catalog
            </h1>
            {selectedStore && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                <StoreIcon className="h-3 w-3" />
                {selectedStore.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Centralized inventory catalog and per-store price override management
          </p>
        </div>

        {/* Actions: Add Product button is OWNER only! */}
        {isOwner && (
          <Button
            onClick={handleOpenCreate}
            data-testid="create-product-btn"
            className="gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Master Product
          </Button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Search by SKU, Barcode, or Name..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {/* Products Table Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4 text-right">Cost Price</th>
                <th className="py-3 px-4 text-right">Master Base Price</th>
                {selectedStoreId && (
                  <>
                    <th className="py-3 px-4 text-right">Store Price</th>
                    <th className="py-3 px-4 text-center">Stock on Hand</th>
                  </>
                )}
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={selectedStoreId ? 9 : 7}
                    className="py-8 text-center text-sm text-slate-400"
                  >
                    Loading catalog items...
                  </td>
                </tr>
              ) : !productsData?.items || productsData.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={selectedStoreId ? 9 : 7}
                    className="py-8 text-center text-sm text-slate-400"
                  >
                    No products found
                  </td>
                </tr>
              ) : (
                productsData.items.map((prod) => {
                  const hasOverride =
                    prod.priceOverride !== null &&
                    prod.priceOverride !== undefined

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {prod.sku}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {prod.barcode || '-'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {prod.name}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500 font-mono text-xs">
                        <MoneyText amount={prod.costPrice} />
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900 font-mono">
                        <MoneyText amount={prod.basePrice} />
                      </td>

                      {selectedStoreId && (
                        <>
                          <td className="py-3 px-4 text-right font-mono">
                            {hasOverride ? (
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-blue-600">
                                  <MoneyText amount={prod.priceOverride!} />
                                </span>
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1 rounded">
                                  Override
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">
                                <MoneyText amount={prod.basePrice} />
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {prod.stockOnHand !== undefined ? (
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  prod.stockOnHand < 0
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : prod.stockOnHand <= 10
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {prod.stockOnHand}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </>
                      )}

                      <td className="py-3 px-4 text-center">
                        <StatusBadge
                          status={prod.isActive ? 'ACTIVE' : 'INACTIVE'}
                          variant={prod.isActive ? 'ACTIVE' : 'INACTIVE'}
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Store Price Override Drawer button (Manager & Owner) */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => handleOpenPriceDrawer(prod)}
                            title="Configure Store Price Override"
                          >
                            <Tag className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Pricing</span>
                          </Button>

                          {/* Master Catalog Edit (Owner only) */}
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleOpenEdit(prod)}
                              title="Edit Master Product"
                            >
                              <Edit className="h-3.5 w-3.5 text-slate-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {productsData && productsData.total > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> (
              {productsData.total} products)
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

      {/* Owner Create/Edit Modal */}
      {isOwner && (
        <ProductModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          product={editingProduct}
        />
      )}

      {/* Per-Store Price Override Drawer */}
      <StorePriceDrawer
        open={priceDrawerOpen}
        onOpenChange={setPriceDrawerOpen}
        product={priceProduct}
        stores={availableStores}
      />
    </div>
  )
}
