import React, { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { Store } from '@/api/types'

interface StoreContextType {
  selectedStoreId: string | undefined // undefined means "All Stores"
  selectedStore: Store | undefined
  setSelectedStoreId: (storeId: string | undefined) => void
  availableStores: Store[]
  canSelectAllStores: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

const STORE_STORAGE_KEY = 'pos_admin_selected_store_id'

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { stores, role } = useAuth()
  const [selectedStoreId, setSelectedStoreIdState] = useState<
    string | undefined
  >(() => {
    const saved = localStorage.getItem(STORE_STORAGE_KEY)
    return saved === 'ALL' || !saved ? undefined : saved
  })

  // Can select All Stores if OWNER or user has access to > 1 stores
  const canSelectAllStores = role === 'OWNER' || stores.length > 1

  // If user only has access to 1 store and currently set to ALL/undefined, auto-select their store
  useEffect(() => {
    if (stores.length === 1 && selectedStoreId === undefined) {
      setSelectedStoreIdState(stores[0].id)
    } else if (
      selectedStoreId &&
      !stores.some((s) => s.id === selectedStoreId) &&
      stores.length > 0
    ) {
      // If active store is not in user's assigned stores, revert to first or undefined
      if (canSelectAllStores) {
        setSelectedStoreIdState(undefined)
      } else {
        setSelectedStoreIdState(stores[0].id)
      }
    }
  }, [stores, selectedStoreId, canSelectAllStores])

  const setSelectedStoreId = (storeId: string | undefined) => {
    setSelectedStoreIdState(storeId)
    if (storeId === undefined) {
      localStorage.setItem(STORE_STORAGE_KEY, 'ALL')
    } else {
      localStorage.setItem(STORE_STORAGE_KEY, storeId)
    }
  }

  const selectedStore = selectedStoreId
    ? stores.find((s) => s.id === selectedStoreId)
    : undefined

  return (
    <StoreContext.Provider
      value={{
        selectedStoreId,
        selectedStore,
        setSelectedStoreId,
        availableStores: stores,
        canSelectAllStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): StoreContextType {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}
