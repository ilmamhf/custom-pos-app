import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod, StockLedgerReason } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { SalesService } from '../sales/sales.service';

describe('SyncService (Idempotency)', () => {
  let service: SyncService;
  let prisma: PrismaService;

  const mockTx = {
    sale: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    shift: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    storeInventory: {
      upsert: jest.fn(),
    },
    stockLedger: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    shift: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: {
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockTx);
    }),
  };

  const authService = {
    verifyOfflineGrant: jest.fn(),
    verifyPin: jest.fn(),
  };

  const salesService = {
    applyAuthorizedRefund: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: AuthService, useValue: authService },
        { provide: SalesService, useValue: salesService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be idempotent: when same saleId is pushed twice, stock only decrements once and ledger gets only one row', async () => {
    const storeId = 'a0000000-0000-0000-0000-000000000001';
    const saleId = 'e0000000-0000-0000-0000-000000000001';
    const shiftId = 'd0000000-0000-0000-0000-000000000001';
    const productId = 'c0000000-0000-0000-0000-000000000001';
    const userId = 'b0000000-0000-0000-0000-000000000003';

    const pushPayload = {
      storeId,
      shifts: [],
      sales: [
        {
          id: saleId,
          shiftId,
          receiptNo: 'BKS-20261121-0001',
          subtotal: 36000,
          taxTotal: 3960,
          discountTotal: 0,
          grandTotal: 39960,
          paymentMethod: PaymentMethod.QRIS,
          createdAt: new Date().toISOString(),
          items: [
            {
              id: 'item-1',
              productId,
              productNameSnapshot: 'Kopi Susu Gula Aren',
              unitPrice: 18000,
              qty: 2,
            },
          ],
        },
      ],
    };

    // --- First push: sale does NOT exist yet ---
    mockPrismaService.store.findUnique.mockResolvedValue({ id: storeId, taxRateBps: 1100 });
    mockPrismaService.product.findMany.mockResolvedValue([
      {
        id: productId,
        name: 'Kopi Susu Gula Aren',
        basePrice: 18000n,
        storeInventory: [{ storeId, priceOverride: null }],
      },
    ]);
    mockTx.shift.findUnique.mockResolvedValue({
      id: shiftId,
      storeId,
      userId,
      openedAt: new Date(0),
      closedAt: null,
    });

    mockTx.sale.findUnique.mockResolvedValueOnce(null);
    mockTx.sale.create.mockResolvedValueOnce({ id: saleId });
    mockTx.storeInventory.upsert.mockResolvedValueOnce({
      storeId,
      productId,
      stockOnHand: 48,
    });
    mockTx.stockLedger.create.mockResolvedValueOnce({ id: 'ledger-1' });

    const firstResult = await service.push(userId, pushPayload);
    expect(firstResult.syncedSaleIds).toContain(saleId);
    expect(firstResult.failed).toHaveLength(0);
    expect(mockTx.sale.create).toHaveBeenCalledTimes(1);
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.stockLedger.create).toHaveBeenCalledTimes(1);
    expect(mockTx.stockLedger.create).toHaveBeenCalledWith({
      data: {
        storeId,
        productId,
        deltaQty: -2,
        reason: StockLedgerReason.SALE,
        referenceId: saleId,
        note: expect.stringContaining('BKS-20261121-0001'),
        createdBy: userId,
      },
    });

    // --- Second push (retry from POS due to network timeout) ---
    // Now sale already exists in database!
    mockTx.sale.findUnique.mockResolvedValueOnce({ id: saleId });

    const secondResult = await service.push(userId, pushPayload);
    expect(secondResult.syncedSaleIds).toContain(saleId);
    expect(secondResult.failed).toHaveLength(0);

    // Verify sale.create, storeInventory.upsert, and stockLedger.create were NOT called again!
    expect(mockTx.sale.create).toHaveBeenCalledTimes(1);
    expect(mockTx.storeInventory.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.stockLedger.create).toHaveBeenCalledTimes(1);
  });
});
