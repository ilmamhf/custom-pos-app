# Complete REST API Contract

> **Superseded (2026-11-27):** this is the original MVP API contract. The implemented endpoints (including Payments, negative-stock policy, sync tombstones, `/auth/me`, and the cookie/CSRF refresh flow) are documented in [`../tasks/api-nestjs-endpoints.md`](../tasks/api-nestjs-endpoints.md). For what changed after this design see [`../audit/2026-11-23/remediation-log.md`](../audit/2026-11-23/remediation-log.md).

## Global Conventions
- **Base URL:** `/api/v1`
- **Authentication:** `Authorization: Bearer <access_token>`
- **Store Context Header (POS routes):** `X-Store-Id: <store_uuid>`
- **Currency Representation:** All monetary values are integers in smallest currency unit (e.g., IDR `18000` = Rp 18.000).
- **Error Envelope:**
  ```json
  {
    "statusCode": 400,
    "error": "BAD_REQUEST",
    "message": "Human-readable error description",
    "timestamp": "2026-11-21T14:24:00Z"
  }
  ```

---

## 1. Authentication & Authorization

### `POST /auth/login` (Public)
Authenticates user and returns JWT tokens plus accessible stores.
```json
// Request
{ "email": "kasir1@toko.id", "password": "secret" }

// Response (200)
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "uuid", "name": "Budi", "role": "CASHIER" },
  "stores": [
    { "id": "uuid-1", "name": "Cabang Bekasi", "code": "BKS", "taxRateBps": 1100 }
  ]
}
```

### `POST /auth/refresh` (Public)
```json
// Request
{ "refreshToken": "eyJ..." }

// Response (200)
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

### `POST /auth/verify-pin` (Cashier+)
Validates a Manager or Owner PIN for void/refund overrides.
```json
// Request
{ "storeId": "uuid-1", "pin": "123456" }

// Response (200)
{ "authorized": true, "managerId": "uuid-mgr", "managerName": "Sari" }
```

---

## 2. Offline-First Sync Engine (Flutter POS)

### `GET /sync/pull` (Cashier+)
**Query Params:** `storeId` (required), `since` (ISO timestamp, optional — omit for full initial sync).
```json
// Response (200)
{
  "serverTime": "2026-11-21T14:24:00Z",
  "store": { "id": "uuid-1", "name": "Cabang Bekasi", "code": "BKS", "taxRateBps": 1100 },
  "products": [
    {
      "id": "prod-uuid",
      "sku": "KOPI-001",
      "barcode": "8991234567890",
      "name": "Kopi Susu Gula Aren",
      "effectivePrice": 18000,
      "stockOnHand": 42,
      "isActive": true,
      "updatedAt": "2026-11-21T10:00:00Z"
    }
  ]
}
```

### `POST /sync/push` (Cashier+)
Idempotent batch upload of offline shifts and sales.
```json
// Request
{
  "storeId": "uuid-1",
  "shifts": [
    {
      "id": "shift-uuid",
      "userId": "user-uuid",
      "openedAt": "2026-11-21T08:00:00Z",
      "closedAt": null,
      "openingCash": 500000,
      "actualCash": null
    }
  ],
  "sales": [
    {
      "id": "client-sale-uuid",
      "shiftId": "shift-uuid",
      "receiptNo": "BKS-20261121-0042",
      "subtotal": 36000,
      "taxTotal": 3960,
      "discountTotal": 0,
      "grandTotal": 39960,
      "paymentMethod": "QRIS",
      "createdAt": "2026-11-21T14:10:00Z",
      "items": [
        {
          "id": "item-uuid",
          "productId": "prod-uuid",
          "productNameSnapshot": "Kopi Susu Gula Aren",
          "unitPrice": 18000,
          "qty": 2
        }
      ]
    }
  ]
}

// Response (200)
{
  "syncedShiftIds": ["shift-uuid"],
  "syncedSaleIds": ["client-sale-uuid"],
  "failed": []
}
```

---

## 3. Shifts & Refunds (POS Operations)

### `POST /shifts/open` (Cashier+)
```json
// Request
{ "id": "shift-uuid", "storeId": "uuid-1", "openingCash": 500000 }

// Response (201)
{ "id": "shift-uuid", "openedAt": "2026-11-21T08:00:00Z", "openingCash": 500000 }
```

### `POST /shifts/:id/close` (Cashier+)
```json
// Request
{ "actualCash": 1250000 }

// Response (200)
{
  "id": "shift-uuid",
  "closedAt": "2026-11-21T17:00:00Z",
  "openingCash": 500000,
  "expectedCash": 1250000,
  "actualCash": 1250000,
  "variance": 0
}
```

### `POST /sales/:id/refund` (Cashier+ with Manager PIN)
Processes partial or full item-level refund and restores `store_inventory` via `stock_ledger`.
```json
// Request
{
  "managerPin": "123456",
  "reason": "Wrong item ordered",
  "items": [
    { "saleItemId": "item-uuid", "refundQty": 1 }
  ]
}

// Response (200)
{
  "saleId": "client-sale-uuid",
  "status": "PARTIALLY_REFUNDED",
  "refundedAmount": 19980
}
```

---

## 4. Catalog & Store Pricing (React Admin)

### `GET /products` (Manager+)
**Query Params:** `search`, `page`, `limit`, `storeId` (optional — includes `priceOverride` and `stockOnHand` for that store).

### `POST /products` (Owner)
Creates master product and initializes `0` stock across all stores.
```json
// Request
{
  "sku": "ROTI-002",
  "barcode": "8999876543210",
  "name": "Croissant Butter",
  "basePrice": 22000,
  "costPrice": 11000
}

// Response (201)
{ "id": "new-prod-uuid", "sku": "ROTI-002", "name": "Croissant Butter", "basePrice": 22000 }
```

### `PATCH /products/:id` (Owner)
Updates `sku`, `barcode`, `name`, `basePrice`, `costPrice`, or `isActive`.

### `PUT /stores/:storeId/products/:productId/price` (Manager+)
Sets or removes (`null`) a store-specific price override.
```json
// Request
{ "priceOverride": 20000 }

// Response (200)
{ "storeId": "uuid-1", "productId": "new-prod-uuid", "priceOverride": 20000 }
```

---

## 5. Inventory & Stock Ledger (React Admin)

### `GET /inventory` (Manager+)
**Query Params:** `storeId` (optional), `lowStockOnly` (`boolean`), `negativeOnly` (`boolean`).

### `POST /inventory/adjust` (Manager+)
Records restocks (`RESTOCK`) or manual shrinkage/damage (`ADJUSTMENT`).
```json
// Request
{
  "storeId": "uuid-1",
  "productId": "prod-uuid",
  "deltaQty": 50,
  "reason": "RESTOCK",
  "note": "Supplier delivery #88"
}

// Response (201)
{ "storeId": "uuid-1", "productId": "prod-uuid", "stockOnHand": 92 }
```

### `POST /inventory/transfer` (Manager+)
Atomically moves stock between two stores.
```json
// Request
{
  "fromStoreId": "uuid-1",
  "toStoreId": "uuid-2",
  "productId": "prod-uuid",
  "qty": 15,
  "note": "Restock cabang Kemang"
}

// Response (201)
{
  "transferId": "uuid-tx",
  "fromStoreStock": 77,
  "toStoreStock": 20
}
```

### `GET /inventory/ledger` (Manager+)
**Query Params:** `storeId`, `productId`, `reason`, `page`, `limit`. Returns paginated audit trail entries.

---

## 6. Stores, Users & Reports (React Admin)

### `GET /stores` (Manager+) & `PATCH /stores/:id` (Owner)
Lists stores or updates `name`, `address`, `taxRateBps`, `isActive`.

### `GET /users` (Owner) & `POST /users` (Owner)
Lists staff or creates a new Cashier/Manager with `email`, `password`, `pin`, `role`, and `storeIds[]`.

### `GET /sales` (Manager+)
**Query Params:** `storeId`, `from`, `to`, `status`, `page`, `limit`. Returns paginated receipt history.

### `GET /reports/summary` (Manager+)
**Query Params:** `storeId` (omit for consolidated 1–3 store report), `from`, `to`.
```json
// Response (200)
{
  "grossSales": 48500000,
  "refundTotal": 450000,
  "netSales": 48050000,
  "transactionCount": 1120,
  "paymentBreakdown": [
    { "method": "QRIS", "total": 31000000, "count": 740 },
    { "method": "CASH", "total": 17050000, "count": 380 }
  ],
  "topProducts": [
    { "productId": "prod-uuid", "name": "Kopi Susu Gula Aren", "qtySold": 620, "revenue": 11160000 }
  ]
}
```