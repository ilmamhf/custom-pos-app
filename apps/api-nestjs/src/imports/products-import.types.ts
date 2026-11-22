export interface ProductImportRowError {
  rowNumber: number;
  sku?: string;
  field?: string;
  message: string;
}

export interface ProductImportStoreValues {
  storeCode: string;
  stockOnHand?: number;
  priceOverride?: number | null;
  rowNumber: number;
}

export interface ProductImportGroup {
  sku: string;
  name: string;
  basePrice: number;
  barcode?: string;
  costPrice?: number;
  isActive?: boolean;
  stores: ProductImportStoreValues[];
  sourceRows: number[];
  errors: ProductImportRowError[];
}

export interface ProductImportParseResult {
  totalRows: number;
  headers: string[];
  groups: ProductImportGroup[];
  errors: ProductImportRowError[];
}

export interface ProductImportSummary {
  mode: 'dry-run' | 'import';
  rowsRead: number;
  validRows: number;
  rejectedRows: number;
  productsInserted: number;
  productsUpdated: number;
  inventoryInserted: number;
  inventoryUpdated: number;
}
