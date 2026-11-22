import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ProductImportFileError,
  ProductsImportParser,
} from './products-import.parser';

describe('ProductsImportParser', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'pos-product-import-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function writeCsv(name: string, content: string | Buffer): string {
    const path = join(directory, name);
    writeFileSync(path, content, 'utf8');
    return path;
  }

  it('groups product rows by SKU and normalizes supported headers', async () => {
    const path = writeCsv(
      'products.csv',
      [
        'sku,barcode,product_name,base_price,cost_price,store_code,stock_on_hand,price_override',
        'A-001,8991234567890,Sample Product,18000,9000,BKS,10,',
        'A-001,8991234567890,Sample Product,18000,9000,KMG,5,20000',
      ].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.totalRows).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sku).toBe('A-001');
    expect(result.groups[0].basePrice).toBe(18000);
    expect(result.groups[0].stores).toEqual([
      {
        storeCode: 'BKS',
        stockOnHand: 10,
        priceOverride: undefined,
        rowNumber: 2,
      },
      {
        storeCode: 'KMG',
        stockOnHand: 5,
        priceOverride: 20000,
        rowNumber: 3,
      },
    ]);
  });

  it('rejects unsupported column names', async () => {
    const path = writeCsv(
      'unsupported-header.csv',
      [
        'sku,name,basePrice,stock_onhands',
        'A-001,Sample Product,18000,10',
      ].join('\n'),
    );

    await expect(new ProductsImportParser().parse(path)).rejects.toThrow(
      'unsupported column(s): stockonhands',
    );
  });

  it('fills optional product fields from a later row for the same SKU', async () => {
    const path = writeCsv(
      'optional-fields.csv',
      [
        'sku,name,basePrice,storeCode,stockOnHand,barcode,costPrice,priceOverride',
        'A-001,Sample Product,18000,BKS,10,,,',
        'A-001,Sample Product,18000,KMG,5,8991234567890,9000,CLEAR',
      ].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([]);
    expect(result.groups[0].barcode).toBe('8991234567890');
    expect(result.groups[0].costPrice).toBe(9000);
    expect(result.groups[0].stores[1].priceOverride).toBeNull();
  });

  it('rejects duplicate SKU and store combinations', async () => {
    const path = writeCsv(
      'duplicates.csv',
      [
        'sku,name,basePrice,storeCode,stockOnHand',
        'A-001,Sample Product,18000,BKS,10',
        'A-001,Sample Product,18000,BKS,12',
      ].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.groups[0].errors).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        field: 'storeCode',
        message: 'duplicate storeCode BKS for SKU A-001',
      }),
    ]);
  });

  it('rejects non-integer prices', async () => {
    const path = writeCsv(
      'invalid-price.csv',
      ['sku,name,basePrice', 'A-001,Sample Product,18.000'].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'basePrice',
        message: 'basePrice must be an integer',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('rejects a blank required base price', async () => {
    const path = writeCsv(
      'missing-base-price.csv',
      ['sku,name,basePrice', 'A-001,Sample Product,'].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'basePrice',
        message: 'basePrice is required',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('rejects values that exceed database field limits', async () => {
    const sku = 'S'.repeat(51);
    const barcode = 'B'.repeat(65);
    const name = 'N'.repeat(151);
    const path = writeCsv(
      'oversized-fields.csv',
      ['sku,barcode,name,basePrice', `${sku},${barcode},${name},18000`].join(
        '\n',
      ),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sku' }),
        expect.objectContaining({ field: 'barcode' }),
        expect.objectContaining({ field: 'name' }),
      ]),
    );
    expect(result.groups).toEqual([]);
  });

  it('rejects stock outside the database integer range', async () => {
    const path = writeCsv(
      'oversized-stock.csv',
      [
        'sku,name,basePrice,storeCode,stockOnHand',
        'A-001,Sample Product,18000,BKS,2147483648',
      ].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'stockOnHand',
        message: 'stockOnHand must be between -2147483648 and 2147483647',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('reports rows with the wrong number of columns', async () => {
    const path = writeCsv(
      'wrong-column-count.csv',
      ['name,sku,basePrice', 'Sample Product,A-001'].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        sku: 'A-001',
        field: 'columns',
        message: 'expected 3 columns but received 2',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('rejects NUL characters in text fields', async () => {
    const path = writeCsv(
      'nul-character.csv',
      ['sku,name,basePrice', 'A-001,Invalid\u0000Name,18000'].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'name',
        message: 'name must not contain NUL characters',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('sanitizes SKUs reported with NUL characters', async () => {
    const path = writeCsv(
      'nul-sku.csv',
      ['sku,name,basePrice', 'A-\u0000001,Sample Product,18000'].join('\n'),
    );

    const result = await new ProductsImportParser().parse(path);

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        sku: 'A-001',
        field: 'sku',
        message: 'sku must not contain NUL characters',
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it('rejects invalid UTF-8 input', async () => {
    const path = writeCsv(
      'invalid-utf8.csv',
      Buffer.concat([
        Buffer.from('sku,name,basePrice\nA-001,Invalid', 'utf8'),
        Buffer.from([0xff]),
        Buffer.from(' Name,18000\n', 'utf8'),
      ]),
    );

    await expect(new ProductsImportParser().parse(path)).rejects.toThrow(
      'Could not parse CSV file',
    );
  });

  it('rejects files without all required columns', async () => {
    const path = writeCsv(
      'missing-header.csv',
      'sku,name\nA-001,Sample Product',
    );

    await expect(new ProductsImportParser().parse(path)).rejects.toBeInstanceOf(
      ProductImportFileError,
    );
    await expect(new ProductsImportParser().parse(path)).rejects.toThrow(
      'missing required column(s): baseprice',
    );
  });
});
