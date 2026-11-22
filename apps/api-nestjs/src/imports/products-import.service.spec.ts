import { PrismaService } from '../prisma/prisma.service';
import {
  createProductImportPlan,
  ProductsImportService,
} from './products-import.service';
import {
  ProductImportGroup,
  ProductImportParseResult,
} from './products-import.types';

function group(
  sku: string,
  stores: Array<{ storeCode: string; stockOnHand?: number }> = [],
): ProductImportGroup {
  return {
    sku,
    name: `Product ${sku}`,
    basePrice: 18000,
    stores: stores.map((store) => ({
      ...store,
      rowNumber: 2,
    })),
    sourceRows: [2],
    errors: [],
  };
}

describe('createProductImportPlan', () => {
  it('counts a new product and its store inventory as inserts', () => {
    const plan = createProductImportPlan(
      [group('NEW-001', [{ storeCode: 'BKS', stockOnHand: 10 }])],
      [{ code: 'BKS' }, { code: 'KMG' }],
      new Map(),
      new Map(),
    );

    expect(plan).toEqual({
      productsInserted: 1,
      productsUpdated: 0,
      inventoryInserted: 2,
      inventoryUpdated: 0,
    });
  });

  it('counts an existing product and specified inventory as updates', () => {
    const plan = createProductImportPlan(
      [group('EXISTING-001', [{ storeCode: 'BKS', stockOnHand: 10 }])],
      [{ code: 'BKS' }, { code: 'KMG' }],
      new Map([['EXISTING-001', { sku: 'EXISTING-001' }]]),
      new Map([
        ['EXISTING-001\u0000BKS', { sku: 'EXISTING-001', storeCode: 'BKS' }],
      ]),
    );

    expect(plan).toEqual({
      productsInserted: 0,
      productsUpdated: 1,
      inventoryInserted: 0,
      inventoryUpdated: 1,
    });
  });
});

describe('ProductsImportService', () => {
  it('does not write to the database when validation fails', async () => {
    const transaction = jest.fn();
    const prisma = {
      store: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'store-bks', code: 'BKS', name: 'Bekasi' },
          ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      storeInventory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: transaction,
    };
    const service = new ProductsImportService(
      prisma as unknown as PrismaService,
    );
    const parsed: ProductImportParseResult = {
      totalRows: 1,
      headers: ['sku', 'name', 'baseprice', 'storecode', 'stockonhand'],
      groups: [
        {
          sku: 'INVALID-STORE',
          name: 'Invalid Store Product',
          basePrice: 18000,
          stores: [
            {
              storeCode: 'UNKNOWN',
              stockOnHand: 10,
              rowNumber: 2,
            },
          ],
          sourceRows: [2],
          errors: [],
        },
      ],
      errors: [],
    };

    const result = await service.run(parsed, {
      dryRun: false,
      batchSize: 100,
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'storeCode',
        message: 'storeCode UNKNOWN does not exist',
      }),
    ]);
    expect(result.summary.rejectedRows).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});
