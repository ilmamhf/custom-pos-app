import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { queryKeys } from './queryKeys'
import {
  Store,
  ProductsResponse,
  CreateProductRequest,
  UpdateProductRequest,
  InventoryResponse,
  StockAdjustmentRequest,
  StockTransferRequest,
  StockTransferResponse,
  StockLedgerResponse,
  SalesResponse,
  ReportSummaryResponse,
  User,
  CreateUserRequest,
  UpdateUserRequest,
  RefundRequest,
  RefundResponse,
} from '../types'

// Stores Queries & Mutations
export function useStores() {
  return useQuery({
    queryKey: queryKeys.stores.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<Store[]>('/stores')
      return data
    },
  })
}

export function useUpdateStore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: Partial<Store> & { id: string }) => {
      const { data } = await apiClient.patch<Store>(`/stores/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.all })
    },
  })
}

// Reports & Dashboard Queries
export function useReportSummary(storeId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: queryKeys.reports.summary(storeId, from, to),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (storeId) params.storeId = storeId
      if (from) params.from = from
      if (to) params.to = to

      const { data } = await apiClient.get<ReportSummaryResponse>('/reports/summary', {
        params,
      })
      return data
    },
  })
}

// Products Catalog Queries & Mutations
export function useProducts(storeId?: string, search?: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.products.list(storeId, search, page),
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (storeId) params.storeId = storeId
      if (search) params.search = search

      const { data } = await apiClient.get<ProductsResponse>('/products', { params })
      return data
    },
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateProductRequest) => {
      const { data } = await apiClient.post('/products', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateProductRequest & { id: string }) => {
      const { data } = await apiClient.patch(`/products/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    },
  })
}

export function useSetStorePriceOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      storeId,
      productId,
      priceOverride,
    }: {
      storeId: string
      productId: string
      priceOverride: number | null
    }) => {
      const { data } = await apiClient.put(
        `/stores/${storeId}/products/${productId}/price`,
        { priceOverride }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    },
  })
}

// Inventory Queries & Mutations
export function useInventory(
  storeId?: string,
  lowStockOnly?: boolean,
  negativeOnly?: boolean,
  page = 1,
  limit = 20
) {
  return useQuery({
    queryKey: queryKeys.inventory.list(storeId, lowStockOnly, negativeOnly, page),
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (storeId) params.storeId = storeId
      if (lowStockOnly) params.lowStockOnly = true
      if (negativeOnly) params.negativeOnly = true

      const { data } = await apiClient.get<InventoryResponse>('/inventory', { params })
      return data
    },
  })
}

export function useAdjustStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: StockAdjustmentRequest) => {
      const { data } = await apiClient.post('/inventory/adjust', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
    },
  })
}

export function useTransferStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: StockTransferRequest) => {
      const { data } = await apiClient.post<StockTransferResponse>(
        '/inventory/transfer',
        payload
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
    },
  })
}

export function useStockLedger(
  storeId?: string,
  productId?: string,
  reason?: string,
  page = 1,
  limit = 20
) {
  return useQuery({
    queryKey: queryKeys.inventory.ledger(storeId, productId, reason, page),
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (storeId) params.storeId = storeId
      if (productId) params.productId = productId
      if (reason) params.reason = reason

      const { data } = await apiClient.get<StockLedgerResponse>('/inventory/ledger', {
        params,
      })
      return data
    },
  })
}

// Sales Queries & Mutations
export function useSales(
  storeId?: string,
  from?: string,
  to?: string,
  status?: string,
  page = 1,
  limit = 20
) {
  return useQuery({
    queryKey: queryKeys.sales.list(storeId, from, to, status, page),
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (storeId) params.storeId = storeId
      if (from) params.from = from
      if (to) params.to = to
      if (status) params.status = status

      const { data } = await apiClient.get<SalesResponse>('/sales', { params })
      return data
    },
  })
}

export function useRefundSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      saleId,
      ...body
    }: RefundRequest & { saleId: string }) => {
      const { data } = await apiClient.post<RefundResponse>(
        `/sales/${saleId}/refund`,
        body
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    },
  })
}

// Staff & Users Queries & Mutations (Owner Only)
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<User[]>('/users')
      return data
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateUserRequest) => {
      const { data } = await apiClient.post<User>('/users', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateUserRequest & { id: string }) => {
      const { data } = await apiClient.patch<User>(`/users/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    },
  })
}
