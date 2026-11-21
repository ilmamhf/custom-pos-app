import React from 'react'
import { Store as StoreIcon, ChevronDown, Check } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { useAuth } from '@/context/AuthContext'
import { formatBps } from '@/lib/formatters'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export const Topbar: React.FC = () => {
  const { availableStores, selectedStoreId, setSelectedStoreId, selectedStore, canSelectAllStores } =
    useStore()
  const { role } = useAuth()

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Global Store Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Store Context:
          </span>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                data-testid="global-store-switcher-trigger"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-sm font-medium border border-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <StoreIcon className="h-4 w-4 text-slate-600" />
                <span data-testid="active-store-label">
                  {selectedStore
                    ? `${selectedStore.name} (${selectedStore.code})`
                    : `All Stores (${availableStores.length})`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 ml-1" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                data-testid="global-store-switcher-dropdown"
                className="z-50 min-w-[220px] bg-white rounded-md p-1 shadow-lg border border-slate-200 text-sm animate-in fade-in-80"
              >
                {canSelectAllStores && (
                  <DropdownMenu.Item
                    data-testid="store-option-all"
                    onSelect={() => setSelectedStoreId(undefined)}
                    className="flex items-center justify-between px-3 py-2 rounded cursor-pointer text-slate-700 hover:bg-slate-100 outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <StoreIcon className="h-4 w-4 text-slate-500" />
                      <span>All Stores ({availableStores.length})</span>
                    </div>
                    {selectedStoreId === undefined && (
                      <Check className="h-4 w-4 text-slate-900" />
                    )}
                  </DropdownMenu.Item>
                )}

                {canSelectAllStores && availableStores.length > 0 && (
                  <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                )}

                {availableStores.map((store) => (
                  <DropdownMenu.Item
                    key={store.id}
                    data-testid={`store-option-${store.id}`}
                    onSelect={() => setSelectedStoreId(store.id)}
                    className="flex items-center justify-between px-3 py-2 rounded cursor-pointer text-slate-700 hover:bg-slate-100 outline-none"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{store.name}</p>
                      <p className="text-xs text-slate-500">
                        Code: {store.code} &bull; Tax: {formatBps(store.taxRateBps)}
                      </p>
                    </div>
                    {selectedStoreId === store.id && (
                      <Check className="h-4 w-4 text-slate-900 shrink-0 ml-2" />
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {selectedStore && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            <span className="font-medium">Active Branch:</span>
            <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">
              {selectedStore.code}
            </span>
            <span>Tax: {formatBps(selectedStore.taxRateBps)}</span>
          </div>
        )}
        <div className="text-xs text-slate-500">
          Role: <strong className="text-slate-700">{role}</strong>
        </div>
      </div>
    </header>
  )
}
