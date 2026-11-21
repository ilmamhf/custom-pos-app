import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod, SaleStatus } from '@prisma/client';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    shift: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('closeShift expected_cash calculation', () => {
    it('should calculate expected_cash as opening_cash + cash_sales - cash_refunds and calculate variance', async () => {
      const shiftId = 'd0000000-0000-0000-0000-000000000001';

      mockPrismaService.shift.findUnique.mockResolvedValueOnce({
        id: shiftId,
        openingCash: 500000n,
        closedAt: null,
        sales: [
          // Cash sale of 500,000 completed
          {
            id: 'sale-1',
            paymentMethod: PaymentMethod.CASH,
            grandTotal: 500000n,
            status: SaleStatus.COMPLETED,
            saleItems: [],
          },
          // QRIS sale of 300,000 (should NOT count towards cash expected)
          {
            id: 'sale-2',
            paymentMethod: PaymentMethod.QRIS,
            grandTotal: 300000n,
            status: SaleStatus.COMPLETED,
            saleItems: [],
          },
          // Cash sale of 300,000 with 50,000 refunded
          {
            id: 'sale-3',
            paymentMethod: PaymentMethod.CASH,
            grandTotal: 300000n,
            status: SaleStatus.PARTIALLY_REFUNDED,
            saleItems: [
              {
                unitPrice: 25000n,
                refundedQty: 2, // 50,000 refund
              },
            ],
          },
        ],
      });

      // Expected Cash: 500,000 (opening) + 500,000 (sale 1) + 300,000 (sale 3) - 50,000 (refund) = 1,250,000
      // Actual Cash: 1,250,000 -> Variance = 0
      mockPrismaService.shift.update.mockResolvedValueOnce({
        id: shiftId,
        closedAt: new Date('2026-11-21T17:00:00Z'),
        openingCash: 500000n,
        expectedCash: 1250000n,
        actualCash: 1250000n,
      });

      const result = await service.closeShift(shiftId, {
        actualCash: 1250000,
      });

      expect(result.openingCash).toBe(500000);
      expect(result.expectedCash).toBe(1250000);
      expect(result.actualCash).toBe(1250000);
      expect(result.variance).toBe(0);

      expect(mockPrismaService.shift.update).toHaveBeenCalledWith({
        where: { id: shiftId },
        data: {
          closedAt: expect.any(Date),
          expectedCash: 1250000n,
          actualCash: 1250000n,
        },
      });
    });
  });
});
