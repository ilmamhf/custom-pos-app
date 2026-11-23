import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLedgerReason } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const mockTx = {
    storeInventory: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    stockLedger: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    store: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    storeInventory: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    stockLedger: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockTx);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('transfer', () => {
    const fromStoreId = 'a0000000-0000-0000-0000-000000000001';
    const toStoreId = 'a0000000-0000-0000-0000-000000000002';
    const productId = 'c0000000-0000-0000-0000-000000000001';
    const userId = 'b0000000-0000-0000-0000-000000000001';

    it('should atomically transfer stock: decrement source, increment destination, and insert two ledger rows', async () => {
      mockPrismaService.store.findUnique
        .mockResolvedValueOnce({ id: fromStoreId, name: 'Bekasi' })
        .mockResolvedValueOnce({ id: toStoreId, name: 'Kemang' });
      mockPrismaService.product.findUnique.mockResolvedValueOnce({
        id: productId,
        name: 'Kopi Susu',
      });

      mockTx.storeInventory.findUnique.mockResolvedValueOnce({
        storeId: fromStoreId,
        productId,
        stockOnHand: 50,
      });

      mockTx.storeInventory.updateMany.mockResolvedValueOnce({ count: 1 });

      mockTx.storeInventory.upsert.mockResolvedValueOnce({
        storeId: toStoreId,
        productId,
        stockOnHand: 45,
      });

      mockTx.stockLedger.create.mockResolvedValue({});

      const result = await service.transfer(userId, {
        fromStoreId,
        toStoreId,
        productId,
        qty: 15,
        note: 'Restock Kemang',
      });

      expect(result).toEqual({
        transferId: expect.any(String),
        fromStoreStock: 35,
        toStoreStock: 45,
      });

      // Verify source store inventory decremented conditionally
      expect(mockTx.storeInventory.updateMany).toHaveBeenCalledWith({
        where: {
          storeId: fromStoreId,
          productId,
          stockOnHand: { gte: 15 },
        },
        data: {
          stockOnHand: { decrement: 15 },
        },
      });

      // Verify destination store inventory incremented
      expect(mockTx.storeInventory.upsert).toHaveBeenCalledWith({
        where: {
          storeId_productId: {
            storeId: toStoreId,
            productId,
          },
        },
        update: {
          stockOnHand: { increment: 15 },
        },
        create: {
          storeId: toStoreId,
          productId,
          stockOnHand: 15,
          priceOverride: null,
        },
      });

      // Verify two ledger rows were created (TRANSFER_OUT and TRANSFER_IN)
      expect(mockTx.stockLedger.create).toHaveBeenCalledTimes(2);

      expect(mockTx.stockLedger.create).toHaveBeenNthCalledWith(1, {
        data: {
          storeId: fromStoreId,
          productId,
          deltaQty: -15,
          reason: StockLedgerReason.TRANSFER_OUT,
          referenceId: result.transferId,
          note: 'Restock Kemang',
          createdBy: userId,
        },
      });

      expect(mockTx.stockLedger.create).toHaveBeenNthCalledWith(2, {
        data: {
          storeId: toStoreId,
          productId,
          deltaQty: 15,
          reason: StockLedgerReason.TRANSFER_IN,
          referenceId: result.transferId,
          note: 'Restock Kemang',
          createdBy: userId,
        },
      });
    });

    it('should throw BadRequestException if source and destination are the same', async () => {
      await expect(
        service.transfer(userId, {
          fromStoreId,
          toStoreId: fromStoreId,
          productId,
          qty: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if source stock is insufficient', async () => {
      mockPrismaService.store.findUnique
        .mockResolvedValueOnce({ id: fromStoreId, name: 'Bekasi' })
        .mockResolvedValueOnce({ id: toStoreId, name: 'Kemang' });
      mockPrismaService.product.findUnique.mockResolvedValueOnce({
        id: productId,
        name: 'Kopi Susu',
      });

      mockTx.storeInventory.findUnique.mockResolvedValueOnce({
        storeId: fromStoreId,
        productId,
        stockOnHand: 5,
      });

      await expect(
        service.transfer(userId, {
          fromStoreId,
          toStoreId,
          productId,
          qty: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
