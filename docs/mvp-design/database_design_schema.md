# Database Design & PostgreSQL Schema

## 1. Entity Relationship Diagram

```text
[stores] 1────────* [user_stores] *────────1 [users]
   │                                           │
   ├── 1──* [shifts] *─────────────────────────┘
   │           │
   │           └── 1──* [sales] 1──* [sale_items]
   │                       │              │
   ├── 1──* [store_inventory]             │
   │           ▲                          │
   │           │ *                        │
   │        [products] 1──────────────────┘
   │           │
   └── 1──* [stock_ledger] *──────────────┘
```

## 2. Core Tables & Columns

### `stores`
Stores up to 1–3 physical retail branches.
- `id` (`UUID`, PK)
- `name` (`VARCHAR(100)`, NOT NULL)
- `code` (`VARCHAR(10)`, UNIQUE, e.g., `BKS`, `KMG`) — used for receipt prefixes
- `address` (`TEXT`, NULLABLE)
- `tax_rate_bps` (`INT`, DEFAULT `1100`) — basis points (`1100` = 11.00%)
- `is_active` (`BOOLEAN`, DEFAULT `true`)
- `created_at` (`TIMESTAMPTZ`, DEFAULT `now()`)

### `users` & `user_stores`
Staff accounts and store access mapping.
- **`users`:** `id` (`UUID`, PK), `name` (`VARCHAR(100)`), `email` (`VARCHAR(150)`, UNIQUE), `password_hash` (`TEXT`), `pin_hash` (`TEXT`, NULLABLE — for Manager/Owner overrides), `role` (`ENUM: OWNER | MANAGER | CASHIER`), `is_active` (`BOOLEAN`)
- **`user_stores`:** `user_id` (`UUID`, FK -> `users.id`), `store_id` (`UUID`, FK -> `stores.id`) — Composite PK `(user_id, store_id)`

### `products`
Centralized master catalog.
- `id` (`UUID`, PK)
- `sku` (`VARCHAR(50)`, UNIQUE, NOT NULL)
- `barcode` (`VARCHAR(64)`, INDEX, NULLABLE)
- `name` (`VARCHAR(150)`, NOT NULL)
- `base_price` (`BIGINT`, NOT NULL)
- `cost_price` (`BIGINT`, DEFAULT `0`)
- `is_active` (`BOOLEAN`, DEFAULT `true`)
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `now()`) — used as delta sync cursor

### `store_inventory` (Current Stock State)
Per-store stock snapshot and optional local price override.
- `store_id` (`UUID`, FK -> `stores.id`)
- `product_id` (`UUID`, FK -> `products.id`)
- `price_override` (`BIGINT`, NULLABLE) — if `NULL`, POS uses `products.base_price`
- `stock_on_hand` (`INT`, DEFAULT `0`)
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `now()`)
- **Primary Key:** `(store_id, product_id)`

### `stock_ledger` (Immutable Audit Trail)
Every stock movement inserts a row here inside the same DB transaction that updates `store_inventory.stock_on_hand`.
- `id` (`UUID`, PK)
- `store_id` (`UUID`, FK -> `stores.id`, INDEX)
- `product_id` (`UUID`, FK -> `products.id`, INDEX)
- `delta_qty` (`INT`, NOT NULL) — negative for sales/transfers out, positive for restocks/refunds
- `reason` (`ENUM: SALE | RESTOCK | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT | REFUND`)
- `reference_id` (`UUID`, NULLABLE) — links to `sale_id` or `transfer_id`
- `note` (`TEXT`, NULLABLE)
- `created_by` (`UUID`, FK -> `users.id`)
- `created_at` (`TIMESTAMPTZ`, DEFAULT `now()`)

### `shifts`
Cash drawer tracking per cashier session.
- `id` (`UUID`, PK, client-generated)
- `store_id` (`UUID`, FK -> `stores.id`)
- `user_id` (`UUID`, FK -> `users.id`)
- `opened_at` (`TIMESTAMPTZ`, NOT NULL)
- `closed_at` (`TIMESTAMPTZ`, NULLABLE)
- `opening_cash` (`BIGINT`, NOT NULL)
- `expected_cash` (`BIGINT`, NULLABLE) — calculated on close (`opening_cash + cash_sales - cash_refunds`)
- `actual_cash` (`BIGINT`, NULLABLE) — entered by cashier on close

### `sales` & `sale_items`
Completed and refunded POS transactions.
- **`sales`:**
  - `id` (`UUID`, PK, client-generated — enforces idempotency during sync)
  - `store_id` (`UUID`, FK -> `stores.id`, INDEX)
  - `shift_id` (`UUID`, FK -> `shifts.id`)
  - `cashier_id` (`UUID`, FK -> `users.id`)
  - `receipt_no` (`VARCHAR(40)`, UNIQUE, e.g., `BKS-20261121-0042`)
  - `subtotal` (`BIGINT`), `tax_total` (`BIGINT`), `discount_total` (`BIGINT`), `grand_total` (`BIGINT`)
  - `payment_method` (`ENUM: CASH | QRIS | CARD | SPLIT`)
  - `status` (`ENUM: COMPLETED | PARTIALLY_REFUNDED | REFUNDED`)
  - `created_at` (`TIMESTAMPTZ`, NOT NULL)
- **`sale_items`:**
  - `id` (`UUID`, PK)
  - `sale_id` (`UUID`, FK -> `sales.id`)
  - `product_id` (`UUID`, FK -> `products.id`)
  - `product_name_snapshot` (`VARCHAR(150)`, NOT NULL)
  - `unit_price` (`BIGINT`, NOT NULL)
  - `qty` (`INT`, NOT NULL)
  - `refunded_qty` (`INT`, DEFAULT `0`)