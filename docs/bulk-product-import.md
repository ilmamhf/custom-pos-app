# Bulk product and stock CSV import

The API includes a standalone CSV loader for loading a large product catalog and its starting store inventory. It is separate from `prisma/seed.ts` and does not require the Admin application or an HTTP upload endpoint.

## Why it is separate from the normal seeder

`npm run prisma:seed` remains the small baseline setup for stores, staff, sample products, and development accounts. The bulk loader is intended for a larger one-time dataset. Keeping them separate prevents normal development setup from repeatedly loading or resetting a large catalog.

## Template

Start from:

```text
apps/api-nestjs/data/templates/products-import-template.csv
```

A populated example is available at:

```text
apps/api-nestjs/data/templates/products-import-example.csv
```

Required columns:

| Column | Meaning |
| --- | --- |
| `sku` | Stable product identifier. Existing products are updated by SKU. |
| `name` | Product display name. |
| `basePrice` | Master selling price as an integer IDR value, for example `18000`. |

Optional columns:

| Column | Meaning |
| --- | --- |
| `barcode` | Product barcode. A blank value leaves an existing barcode unchanged. |
| `costPrice` | Cost price as an integer IDR value. A blank value leaves an existing value unchanged. |
| `storeCode` | Store code such as `BKS` or `KMG`. Repeat a SKU once per store. |
| `stockOnHand` | Absolute starting stock quantity. This is not an increment. Negative integers are accepted for reconciliation data within PostgreSQL's signed 32-bit range. |
| `priceOverride` | Store-specific selling price as an integer IDR value. `CLEAR` removes an existing override. |
| `isActive` | `true/false`, `1/0`, `yes/no`, or `active/inactive`. |

Header matching is case-insensitive. Common variants such as `base_price`, `stock_on_hand`, `store_code`, `hargajual`, `stok`, and `cabang` are accepted. Use a UTF-8 CSV file.

## Dry run

Always run a dry run first:

```powershell
cd apps\api-nestjs
npm run data:import:dry-run -- .\data\templates\products-import-example.csv
```

The dry run queries PostgreSQL to validate store codes and calculate inserts and updates. It does not write product or inventory data.

## Import

```powershell
npm run data:import -- .\data\templates\products-import-example.csv
```

Existing products are updated by SKU. For an existing product:

- `name` and `basePrice` are always updated.
- Blank optional product fields remain unchanged.
- `stockOnHand` replaces the current quantity when present.
- `priceOverride` replaces the current store override when present.
- `CLEAR` in `priceOverride` removes the override.

For a new product, inventory starts at zero for every existing store. Rows that specify a store apply that store's stock and price override.

## Validation behavior

The importer validates the entire file before writing data. It rejects:

- Missing required columns
- Rows with the wrong number of columns
- Blank SKU, product name, or base price
- SKU, product name, or barcode values that exceed database limits
- Decimal or formatted currency values
- Values outside JavaScript's safe integer range
- Stock quantities outside PostgreSQL's signed 32-bit integer range
- Unknown store codes
- Duplicate SKU and store combinations
- Conflicting product values for the same SKU
- Invalid active-state values

If any validation error exists, the importer writes nothing to PostgreSQL. Fix the file and run the dry run again.

To save rejected rows for review:

```powershell
$env:IMPORT_ERRORS_FILE = '.\data\products-errors.csv'
npm run data:import:dry-run -- .\data\products.csv
```

## Large files and recovery

Imports run in transactions of 100 products by default. Change the batch size between 1 and 5000 when needed:

```powershell
$env:IMPORT_BATCH_SIZE = '500'
npm run data:import -- .\data\products.csv
```

Each batch commits independently. If a database error stops a later batch, rerun the same command. Completed products are updated by SKU, so the import can resume without creating duplicate catalog rows.

The importer is intended for catalog initialization. Setting `stockOnHand` through this command does not create `stock_ledger` adjustment records. Use the inventory adjustment workflow when stock changes must be audited after the system goes live.

## Related commands

```text
npm run data:import:help
npm run prisma:seed
npm run prisma:push
```

`prisma:seed` remains the baseline development-data command. `data:import` is the bulk catalog loader.
