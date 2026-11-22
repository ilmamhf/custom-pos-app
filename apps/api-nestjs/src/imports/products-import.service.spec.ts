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
  stores: Array<{
    storeCode: string;
    stockOnHand?: number;
    priceOverride?: number | null;
  }> = [],
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
  const stores = [
    { id: 'store-bks', code: 'BKS', name: 'Bekasi' },
    { id: 'store-kmg', code: 'KMG', name: 'Kemang' },
  ];
  const mockTx = {
    product: {
      upsert: jest.fn(),
    },
    storeInventory: {
      upsert: jest.fn(),
    },
    stockLedger: {
      create: jest.fn(),
    },
  };
  const mockPrisma = {
    store: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    storeInventory: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: ProductsImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.store.findMany.mockResolvedValue(stores);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.storeInventory.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx),
    );
    mockTx.product.upsert.mockResolvedValue({ id: 'product-1' });
    mockTx.storeInventory.upsert.mockResolvedValue({});
    service = new ProductsImportService(mockPrisma as unknown as PrismaService);
  });

  it('does not write to the database when validation fails', async () => {
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
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not write any valid rows when a later row is malformed', async () => {
    const parsed: ProductImportParseResult = {
      totalRows: 2,
      headers: ['sku', 'name', 'baseprice'],
      groups: [group('VALID-001')],
      errors: [
        {
          rowNumber: 3,
          sku: 'INVALID-001',
          field: 'basePrice',
          message: 'basePrice must be an integer',
        },
      ],
    };

    const result = await service.run(parsed, {
      dryRun: false,
      batchSize: 100,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.summary.rejectedRows).toBe(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.product.upsert).not.toHaveBeenCalled();
    expect(mockTx.storeInventory.upsert).not.toHaveBeenCalled();
  });

  it('updates a product by SKU and applies absolute store stock', async () => {
    mockPrisma.product.findMany.mockResolvedValue([{ sku: 'EXISTING-001' }]);
    mockPrisma.storeInventory.findMany.mockResolvedValue([
      {
        stockOnHand: 99,
        product: { sku: 'EXISTING-001' },
        store: { code: 'BKS' },
      },
      {
        stockOnHand: 99,
        product: { sku: 'EXISTING-001' },
        store: { code: 'KMG' },
      },
    ]);
    const parsed: ProductImportParseResult = {
      totalRows: 2,
      headers: [
        'sku',
        'name',
        'baseprice',
        'storecode',
        'stockonhand',
        'priceoverride',
      ],
      groups: [
        {
          ...group('EXISTING-001', [
            { storeCode: 'BKS', stockOnHand: 25 },
            { storeCode: 'KMG', priceOverride: null },
          ]),
          name: 'Updated Product',
          basePrice: 21000,
        },
      ],
      errors: [],
    };

    const result = await service.run(parsed, {
      dryRun: false,
      batchSize: 100,
    });

    expect(mockTx.product.upsert).toHaveBeenCalledWith({
      where: { sku: 'EXISTING-001' },
      create: {
        sku: 'EXISTING-001',
        barcode: null,
        name: 'Updated Product',
        basePrice: BigInt(21000),
        costPrice: BigInt(0),
        isActive: true,
      },
      update: {
        name: 'Updated Product',
        basePrice: BigInt(21000),
      },
    });
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledWith({
      where: {
        storeId_productId: {
          storeId: 'store-bks',
          productId: 'product-1',
        },
      },
      create: {
        storeId: 'store-bks',
        productId: 'product-1',
        stockOnHand: 25,
        priceOverride: null,
      },
      update: {
        stockOnHand: 25,
      },
    });
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledWith({
      where: {
        storeId_productId: {
          storeId: 'store-kmg',
          productId: 'product-1',
        },
      },
      create: {
        storeId: 'store-kmg',
        productId: 'product-1',
        stockOnHand: 0,
        priceOverride: null,
      },
      update: {
        priceOverride: null,
      },
    });
    expect(result.summary.productsUpdated).toBe(1);
    expect(result.summary.inventoryUpdated).toBe(2);
    expect(mockTx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('initializes inventory for every store when creating a product', async () => {
    const parsed: ProductImportParseResult = {
      totalRows: 2,
      headers: ['sku', 'name', 'baseprice', 'storecode', 'stockonhand'],
      groups: [
        group('NEW-001', [
          { storeCode: 'BKS', stockOnHand: 10 },
          { storeCode: 'KMG', stockOnHand: 5 },
        ]),
      ],
      errors: [],
    };

    const result = await service.run(parsed, {
      dryRun: false,
      batchSize: 100,
    });

    expect(mockTx.storeInventory.upsert).toHaveBeenCalledTimes(2);
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 'store-bks',
          stockOnHand: 10,
        }),
      }),
    );
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 'store-kmg',
          stockOnHand: 5,
        }),
      }),
    );
    expect(result.summary.productsInserted).toBe(1);
    expect(result.summary.inventoryInserted).toBe(2);
    expect(mockTx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('uses batch boundaries and replays every product after a restart', async () => {
    const parsed: ProductImportParseResult = {
      totalRows: 3,
      headers: ['sku', 'name', 'baseprice'],
      groups: [group('BATCH-001'), group('BATCH-002'), group('BATCH-003')],
      errors: [],
    };

    await service.run(parsed, { dryRun: false, batchSize: 2 });
    await service.run(parsed, { dryRun: false, batchSize: 2 });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
    expect(mockTx.product.upsert).toHaveBeenCalledTimes(6);
    expect(mockTx.stockLedger.create).not.toHaveBeenCalled();
  });
});
