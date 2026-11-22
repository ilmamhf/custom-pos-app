import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import {
  ProductImportGroup,
  ProductImportParseResult,
  ProductImportRowError,
  ProductImportStoreValues,
} from './products-import.types';

const REQUIRED_HEADERS = ['sku', 'name', 'baseprice'] as const;
const PRODUCT_FIELD_MAX_LENGTHS = {
  sku: 50,
  name: 150,
  barcode: 64,
} as const;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const HEADER_ALIASES = new Map<string, string>([
  ['sku', 'sku'],
  ['productsku', 'sku'],
  ['productcode', 'sku'],
  ['itemcode', 'sku'],
  ['barcode', 'barcode'],
  ['productbarcode', 'barcode'],
  ['name', 'name'],
  ['productname', 'name'],
  ['itemname', 'name'],
  ['baseprice', 'baseprice'],
  ['price', 'baseprice'],
  ['sellingprice', 'baseprice'],
  ['hargajual', 'baseprice'],
  ['hargajualsatuan', 'baseprice'],
  ['costprice', 'costprice'],
  ['hargamodal', 'costprice'],
  ['modal', 'costprice'],
  ['storecode', 'storecode'],
  ['store', 'storecode'],
  ['cabang', 'storecode'],
  ['kodocabang', 'storecode'],
  ['stockonhand', 'stockonhand'],
  ['stock', 'stockonhand'],
  ['stok', 'stockonhand'],
  ['qty', 'stockonhand'],
  ['quantity', 'stockonhand'],
  ['priceoverride', 'priceoverride'],
  ['storeprice', 'priceoverride'],
  ['hargajualcabang', 'priceoverride'],
  ['isactive', 'isactive'],
  ['active', 'isactive'],
  ['status', 'isactive'],
]);

export class ProductImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductImportFileError';
  }
}

export function normalizeImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function canonicalizeImportHeaders(headers: string[]): string[] {
  const seen = new Set<string>();

  return headers.map((header) => {
    const normalized = normalizeImportHeader(header);
    const canonical = HEADER_ALIASES.get(normalized) ?? normalized;

    if (!canonical) {
      throw new ProductImportFileError('CSV contains an empty header name');
    }
    if (seen.has(canonical)) {
      throw new ProductImportFileError(
        `CSV contains duplicate header: ${canonical}`,
      );
    }

    seen.add(canonical);
    return canonical;
  });
}

function characterLength(value: string): number {
  return [...value].length;
}

function parseInteger(
  value: string | undefined,
  field: string,
  rowNumber: number,
  allowNegative: boolean,
  required = false,
): { value?: number; error?: ProductImportRowError } {
  const raw = (value ?? '').trim();
  if (!raw) {
    if (required) {
      return {
        error: {
          rowNumber,
          field,
          message: `${field} is required`,
        },
      };
    }
    return {};
  }

  const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(raw)) {
    return {
      error: {
        rowNumber,
        field,
        message: `${field} must be an integer`,
      },
    };
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    return {
      error: {
        rowNumber,
        field,
        message: `${field} is outside the safe integer range`,
      },
    };
  }

  return { value: parsed };
}

function parseBoolean(
  value: string | undefined,
  field: string,
  rowNumber: number,
): { value?: boolean; error?: ProductImportRowError } {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) {
    return {};
  }
  if (['true', '1', 'yes', 'active'].includes(raw)) {
    return { value: true };
  }
  if (['false', '0', 'no', 'inactive'].includes(raw)) {
    return { value: false };
  }

  return {
    error: {
      rowNumber,
      field,
      message: `${field} must be true/false, 1/0, yes/no, or active/inactive`,
    },
  };
}

function parsePriceOverride(
  value: string | undefined,
  rowNumber: number,
): { value?: number | null; error?: ProductImportRowError } {
  const raw = (value ?? '').trim();
  if (!raw) {
    return {};
  }
  if (raw.toUpperCase() === 'CLEAR') {
    return { value: null };
  }

  return parseInteger(raw, 'priceOverride', rowNumber, false);
}

interface CsvParseItem {
  record: Record<string, string>;
  info?: {
    error?: {
      record?: unknown[];
    };
  };
}

interface ParsedRowFields {
  sku: string;
  name: string;
  basePrice: number;
  barcode?: string;
  costPrice?: number;
  isActive?: boolean;
  store?: ProductImportStoreValues;
}

function addConsistencyError(
  group: ProductImportGroup,
  field: string,
  rowNumber: number,
  message: string,
): void {
  group.errors.push({ rowNumber, sku: group.sku, field, message });
}

function addRowToGroup(
  group: ProductImportGroup,
  row: ParsedRowFields,
  rowNumber: number,
): void {
  group.sourceRows.push(rowNumber);

  if (group.name !== row.name) {
    addConsistencyError(
      group,
      'name',
      rowNumber,
      `name conflicts with another row for SKU ${group.sku}`,
    );
  }
  if (group.basePrice !== row.basePrice) {
    addConsistencyError(
      group,
      'basePrice',
      rowNumber,
      `basePrice conflicts with another row for SKU ${group.sku}`,
    );
  }
  if (group.barcode === undefined && row.barcode !== undefined) {
    group.barcode = row.barcode;
  }
  if (group.costPrice === undefined && row.costPrice !== undefined) {
    group.costPrice = row.costPrice;
  }
  if (group.isActive === undefined && row.isActive !== undefined) {
    group.isActive = row.isActive;
  }

  if (
    group.barcode !== undefined &&
    row.barcode !== undefined &&
    group.barcode !== row.barcode
  ) {
    addConsistencyError(
      group,
      'barcode',
      rowNumber,
      `barcode conflicts with another row for SKU ${group.sku}`,
    );
  }
  if (
    group.costPrice !== undefined &&
    row.costPrice !== undefined &&
    group.costPrice !== row.costPrice
  ) {
    addConsistencyError(
      group,
      'costPrice',
      rowNumber,
      `costPrice conflicts with another row for SKU ${group.sku}`,
    );
  }
  if (
    group.isActive !== undefined &&
    row.isActive !== undefined &&
    group.isActive !== row.isActive
  ) {
    addConsistencyError(
      group,
      'isActive',
      rowNumber,
      `isActive conflicts with another row for SKU ${group.sku}`,
    );
  }

  if (row.store) {
    const duplicateStore = group.stores.find(
      (store) => store.storeCode === row.store!.storeCode,
    );
    if (duplicateStore) {
      addConsistencyError(
        group,
        'storeCode',
        rowNumber,
        `duplicate storeCode ${row.store.storeCode} for SKU ${group.sku}`,
      );
    } else {
      group.stores.push(row.store);
    }
  }
}

export class ProductsImportParser {
  async parse(filePath: string): Promise<ProductImportParseResult> {
    let headers: string[] = [];
    let recordNumber = 0;

    const parser = createReadStream(filePath).pipe(
      parse({
        bom: true,
        columns: (rawHeaders: string[]) => {
          headers = canonicalizeImportHeaders(rawHeaders);
          const missing = REQUIRED_HEADERS.filter(
            (required) => !headers.includes(required),
          );
          if (missing.length > 0) {
            throw new ProductImportFileError(
              `CSV is missing required column(s): ${missing.join(', ')}`,
            );
          }
          return headers;
        },
        encoding: 'utf-8',
        info: true,
        max_record_size: 1024 * 1024,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    const groupsBySku = new Map<string, ProductImportGroup>();
    const errors: ProductImportRowError[] = [];

    try {
      for await (const item of parser as AsyncIterable<CsvParseItem>) {
        recordNumber += 1;
        const rowNumber = recordNumber + 1;
        const record = item.record;
        const rowErrors: ProductImportRowError[] = [];

        const malformedRecord = item.info?.error?.record;
        if (malformedRecord && malformedRecord.length !== headers.length) {
          errors.push({
            rowNumber,
            field: 'columns',
            message: `expected ${headers.length} columns but received ${malformedRecord.length}`,
          });
          continue;
        }

        const sku = (record.sku ?? '').trim();
        const name = (record.name ?? '').trim();
        const barcode = (record.barcode ?? '').trim() || undefined;

        if (!sku) {
          rowErrors.push({
            rowNumber,
            field: 'sku',
            message: 'sku is required',
          });
        } else if (characterLength(sku) > PRODUCT_FIELD_MAX_LENGTHS.sku) {
          rowErrors.push({
            rowNumber,
            sku,
            field: 'sku',
            message: `sku must be at most ${PRODUCT_FIELD_MAX_LENGTHS.sku} characters`,
          });
        }
        if (!name) {
          rowErrors.push({
            rowNumber,
            sku: sku || undefined,
            field: 'name',
            message: 'name is required',
          });
        } else if (characterLength(name) > PRODUCT_FIELD_MAX_LENGTHS.name) {
          rowErrors.push({
            rowNumber,
            sku: sku || undefined,
            field: 'name',
            message: `name must be at most ${PRODUCT_FIELD_MAX_LENGTHS.name} characters`,
          });
        }
        if (
          barcode &&
          characterLength(barcode) > PRODUCT_FIELD_MAX_LENGTHS.barcode
        ) {
          rowErrors.push({
            rowNumber,
            sku: sku || undefined,
            field: 'barcode',
            message: `barcode must be at most ${PRODUCT_FIELD_MAX_LENGTHS.barcode} characters`,
          });
        }

        const basePriceResult = parseInteger(
          record.baseprice,
          'basePrice',
          rowNumber,
          false,
          true,
        );
        if (basePriceResult.error) rowErrors.push(basePriceResult.error);

        const costPriceResult = parseInteger(
          record.costprice,
          'costPrice',
          rowNumber,
          false,
        );
        if (costPriceResult.error) rowErrors.push(costPriceResult.error);

        const activeResult = parseBoolean(
          record.isactive,
          'isActive',
          rowNumber,
        );
        if (activeResult.error) rowErrors.push(activeResult.error);

        const storeCode = (record.storecode ?? '').trim().toUpperCase();
        const stockResult = parseInteger(
          record.stockonhand,
          'stockOnHand',
          rowNumber,
          true,
        );
        if (stockResult.error) rowErrors.push(stockResult.error);
        if (
          stockResult.value !== undefined &&
          (stockResult.value < INT32_MIN || stockResult.value > INT32_MAX)
        ) {
          rowErrors.push({
            rowNumber,
            sku: sku || undefined,
            field: 'stockOnHand',
            message: `stockOnHand must be between ${INT32_MIN} and ${INT32_MAX}`,
          });
        }

        const priceOverrideResult = parsePriceOverride(
          record.priceoverride,
          rowNumber,
        );
        if (priceOverrideResult.error)
          rowErrors.push(priceOverrideResult.error);

        if (!storeCode && (record.stockonhand || record.priceoverride)) {
          rowErrors.push({
            rowNumber,
            sku: sku || undefined,
            field: 'storeCode',
            message:
              'storeCode is required when stockOnHand or priceOverride is provided',
          });
        }

        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          continue;
        }

        const store: ProductImportStoreValues | undefined = storeCode
          ? {
              storeCode,
              stockOnHand: stockResult.value,
              priceOverride: priceOverrideResult.value,
              rowNumber,
            }
          : undefined;

        const row: ParsedRowFields = {
          sku,
          name,
          basePrice: basePriceResult.value!,
          barcode,
          costPrice: costPriceResult.value,
          isActive: activeResult.value,
          store,
        };

        const existingGroup = groupsBySku.get(sku);
        if (!existingGroup) {
          groupsBySku.set(sku, {
            sku,
            name,
            basePrice: row.basePrice,
            barcode,
            costPrice: row.costPrice,
            isActive: row.isActive,
            stores: store ? [store] : [],
            sourceRows: [rowNumber],
            errors: [],
          });
        } else {
          addRowToGroup(existingGroup, row, rowNumber);
        }
      }
    } catch (error) {
      if (error instanceof ProductImportFileError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ProductImportFileError(`Could not parse CSV file: ${message}`);
    }

    if (headers.length === 0) {
      throw new ProductImportFileError(
        'CSV file does not contain a header row',
      );
    }

    return {
      totalRows: recordNumber,
      headers,
      groups: [...groupsBySku.values()],
      errors,
    };
  }
}
