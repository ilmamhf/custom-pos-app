export type Role = 'OWNER' | 'MANAGER' | 'CASHIER'

export type StockLedgerReason =
  | 'SALE'
  | 'RESTOCK'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT'
  | 'REFUND'

export type PaymentMethod = 'CASH' | 'QRIS' | 'CARD' | 'SPLIT'

export type SaleStatus = 'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED'

export interface ApiError {
  statusCode: number
  error: string
  message: string | string[]
  timestamp?: string
}

export interface Store {
  id: string
  name: string
  code: string
  address?: string | null
  taxRateBps: number
  isActive: boolean
  createdAt?: string
}

export interface UserStoreMapping {
  storeId?: string
  store: {
    id: string
    name: string
  }
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  isActive?: boolean
  /** Whether an authorization PIN is set. The PIN itself is never readable. */
  hasPin?: boolean
  stores?: UserStoreMapping[]
}

export interface AuthLoginResponse {
  accessToken: string
  refreshToken?: string
  user: {
    id: string
    name: string
    role: Role
    email?: string
  }
  stores: Store[]
}

export interface AuthRefreshResponse {
  accessToken: string
  refreshToken?: string
}

export interface VerifyPinResponse {
  authorized: boolean
  managerId: string
  managerName: string
}

export interface Product {
  id: string
  sku: string
  barcode?: string | null
  name: string
  basePrice: number
  costPrice: number
  isActive: boolean
  stockOnHand?: number
  priceOverride?: number | null
  effectivePrice?: number
  updatedAt?: string
}

export interface ProductsResponse {
  items: Product[]
  total: number
  page: number
  limit: number
}

export interface CreateProductRequest {
  sku: string
  barcode?: string
  name: string
  basePrice: number
  costPrice?: number
}

export interface UpdateProductRequest {
  sku?: string
  barcode?: string | null
  name?: string
  basePrice?: number
  costPrice?: number
  isActive?: boolean
}

export interface StoreInventoryItem {
  storeId: string
  storeName: string
  productId: string
  sku: string
  productName: string
  stockOnHand: number
  priceOverride?: number | null
  basePrice: number
  effectivePrice: number
}

export interface InventoryResponse {
  items: StoreInventoryItem[]
  total: number
  page: number
  limit: number
  /** Server-side count of negative-stock rows in the current scope/filter. */
  negativeCount?: number
}

export interface StockAdjustmentRequest {
  storeId: string
  productId: string
  deltaQty: number
  reason: 'RESTOCK' | 'ADJUSTMENT'
  note?: string
}

export interface StockTransferRequest {
  fromStoreId: string
  toStoreId: string
  productId: string
  qty: number
  note?: string
}

export interface StockTransferResponse {
  transferId: string
  fromStoreStock: number
  toStoreStock: number
}

export interface StockLedgerEntry {
  id: string
  storeId: string
  storeName: string
  productId: string
  productName: string
  deltaQty: number
  reason: StockLedgerReason
  referenceId?: string | null
  note?: string | null
  createdByName?: string
  createdAt: string
}

export interface StockLedgerResponse {
  items: StockLedgerEntry[]
  total: number
  page: number
  limit: number
}

export interface SaleItem {
  id: string
  productId: string
  productNameSnapshot: string
  unitPrice: number
  qty: number
  refundedQty: number
}

export interface Sale {
  id: string
  receiptNo: string
  storeId: string
  storeName?: string
  cashierId: string
  cashierName?: string
  subtotal: number
  taxTotal: number
  discountTotal: number
  grandTotal: number
  paymentMethod: PaymentMethod
  status: SaleStatus
  createdAt: string
  items: SaleItem[]
}

export interface SalesResponse {
  items: Sale[]
  total: number
  page: number
  limit: number
}

export interface RefundItemRequest {
  saleItemId: string
  refundQty: number
}

export interface RefundRequest {
  managerPin: string
  reason: string
  items: RefundItemRequest[]
}

export interface RefundResponse {
  saleId: string
  status: SaleStatus
  refundedAmount: number
}

export interface PaymentBreakdown {
  method: PaymentMethod
  total: number
  count: number
}

export interface TopProduct {
  productId: string
  name: string
  qtySold: number
  revenue: number
}

export interface ReportSummaryResponse {
  grossSales: number
  refundTotal: number
  netSales: number
  transactionCount: number
  paymentBreakdown: PaymentBreakdown[]
  topProducts: TopProduct[]
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  pin?: string
  role: Role
  storeIds: string[]
}

export interface UpdateUserRequest {
  name?: string
  email?: string
  password?: string
  pin?: string
  role?: Role
  isActive?: boolean
  storeIds?: string[]
}
