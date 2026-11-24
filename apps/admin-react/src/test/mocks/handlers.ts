import { http, HttpResponse } from 'msw'

export const handlers = [
  // Auth
  http.post('/api/v1/auth/login', () => {
    return HttpResponse.json({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: {
        id: 'u-owner',
        name: 'Toko Owner',
        email: 'owner@toko.id',
        role: 'OWNER',
      },
      stores: [
        {
          id: 'bks-1',
          name: 'Cabang Bekasi',
          code: 'BKS',
          taxRateBps: 1100,
          isActive: true,
        },
        {
          id: 'kmg-2',
          name: 'Cabang Kemang',
          code: 'KMG',
          taxRateBps: 1100,
          isActive: true,
        },
      ],
    })
  }),

  // Stores
  http.get('/api/v1/stores', () => {
    return HttpResponse.json([
      {
        id: 'bks-1',
        name: 'Cabang Bekasi',
        code: 'BKS',
        address: 'Jl. Ahmad Yani No. 10',
        taxRateBps: 1100,
        isActive: true,
      },
      {
        id: 'kmg-2',
        name: 'Cabang Kemang',
        code: 'KMG',
        address: 'Jl. Kemang Raya No. 45',
        taxRateBps: 1100,
        isActive: true,
      },
    ])
  }),

  // Reports Summary
  http.get('/api/v1/reports/summary', ({ request }) => {
    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId')

    if (storeId === 'bks-1') {
      return HttpResponse.json({
        grossSales: 25000000,
        refundTotal: 200000,
        netSales: 24800000,
        transactionCount: 600,
        paymentBreakdown: [
          { method: 'QRIS', total: 16000000, count: 400 },
          { method: 'CASH', total: 8800000, count: 200 },
        ],
        topProducts: [
          { productId: 'prod-1', name: 'Kopi Susu Gula Aren', qtySold: 350, revenue: 6300000 },
        ],
      })
    }

    return HttpResponse.json({
      grossSales: 48500000,
      refundTotal: 450000,
      netSales: 48050000,
      transactionCount: 1120,
      paymentBreakdown: [
        { method: 'QRIS', total: 31000000, count: 740 },
        { method: 'CASH', total: 17050000, count: 380 },
      ],
      topProducts: [
        { productId: 'prod-1', name: 'Kopi Susu Gula Aren', qtySold: 620, revenue: 11160000 },
        { productId: 'prod-2', name: 'Croissant Butter', qtySold: 210, revenue: 4620000 },
      ],
    })
  }),

  // Inventory
  http.get('/api/v1/inventory', ({ request }) => {
    const url = new URL(request.url)
    const negativeOnly = url.searchParams.get('negativeOnly') === 'true'

    const allItems = [
      {
        storeId: 'bks-1',
        storeName: 'Cabang Bekasi',
        productId: 'prod-1',
        sku: 'KOPI-001',
        productName: 'Kopi Susu Gula Aren',
        stockOnHand: -3, // Negative stock from offline sales!
        priceOverride: null,
        basePrice: 18000,
        effectivePrice: 18000,
      },
      {
        storeId: 'bks-1',
        storeName: 'Cabang Bekasi',
        productId: 'prod-2',
        sku: 'ROTI-001',
        productName: 'Croissant Butter',
        stockOnHand: 45,
        priceOverride: 20000,
        basePrice: 22000,
        effectivePrice: 20000,
      },
    ]

    const items = negativeOnly ? allItems.filter((i) => i.stockOnHand < 0) : allItems

    return HttpResponse.json({
      items,
      total: items.length,
      page: 1,
      limit: 20,
    })
  }),

  // Adjust Stock
  http.post('/api/v1/inventory/adjust', async ({ request }) => {
    const body: any = await request.json()
    return HttpResponse.json({
      storeId: body.storeId,
      productId: body.productId,
      stockOnHand: 42,
    })
  }),

  // Transfer Stock
  http.post('/api/v1/inventory/transfer', async ({ request }) => {
    const body: any = await request.json()
    if (body.fromStoreId === body.toStoreId) {
      return HttpResponse.json(
        { statusCode: 400, message: 'Cannot transfer stock to the same store' },
        { status: 400 }
      )
    }
    return HttpResponse.json({
      transferId: 'tx-uuid-123',
      fromStoreStock: 30,
      toStoreStock: 25,
    })
  }),

  // Products
  http.get('/api/v1/products', () => {
    return HttpResponse.json({
      items: [
        {
          id: 'prod-1',
          sku: 'KOPI-001',
          barcode: '8991234567890',
          name: 'Kopi Susu Gula Aren',
          basePrice: 18000,
          costPrice: 9000,
          isActive: true,
        },
        {
          id: 'prod-2',
          sku: 'ROTI-001',
          barcode: '8999876543210',
          name: 'Croissant Butter',
          basePrice: 22000,
          costPrice: 11000,
          isActive: true,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    })
  }),

  http.post('/api/v1/products', async ({ request }) => {
    const body: any = await request.json()
    return HttpResponse.json({
      id: 'prod-new-uuid',
      ...body,
      isActive: true,
    })
  }),

  // Sales
  http.get('/api/v1/sales', ({ request }) => {
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const status = url.searchParams.get('status')

    const allSales = [
      {
        id: 'sale-1',
        receiptNo: 'BKS-2026-11-20-001',
        storeId: 'bks-1',
        storeName: 'Cabang Bekasi',
        cashierId: 'u3',
        cashierName: 'Kasir Satu',
        subtotal: 18000,
        taxTotal: 1980,
        discountTotal: 0,
        grandTotal: 19980,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        createdAt: '2026-11-20T09:15:00.000Z',
        items: [],
      },
      {
        id: 'sale-2',
        receiptNo: 'BKS-2026-11-24-002',
        storeId: 'bks-1',
        storeName: 'Cabang Bekasi',
        cashierId: 'u3',
        cashierName: 'Kasir Satu',
        subtotal: 22000,
        taxTotal: 2420,
        discountTotal: 0,
        grandTotal: 24420,
        paymentMethod: 'QRIS',
        status: 'COMPLETED',
        createdAt: '2026-11-24T04:30:00.000Z',
        items: [],
      },
    ]

    const items = allSales.filter((sale) => {
      const created = new Date(sale.createdAt).getTime()
      if (from && created < new Date(from).getTime()) return false
      if (to && created > new Date(to).getTime()) return false
      if (status && sale.status !== status) return false
      return true
    })

    return HttpResponse.json({
      items,
      total: items.length,
      page: 1,
      limit: 15,
    })
  }),

  // Users
  http.get('/api/v1/users', () => {
    return HttpResponse.json([
      {
        id: 'u1',
        name: 'Owner Boss',
        email: 'owner@toko.id',
        role: 'OWNER',
        isActive: true,
        hasPin: true,
        stores: [],
      },
      {
        id: 'u2',
        name: 'Sari Manager',
        email: 'manager.bks@toko.id',
        role: 'MANAGER',
        isActive: true,
        hasPin: true,
        stores: [{ storeId: 'bks-1', store: { id: 'bks-1', name: 'Cabang Bekasi' } }],
      },
    ])
  }),

  http.patch('/api/v1/users/:id', async ({ request, params }) => {
    const body: any = await request.json()
    return HttpResponse.json({
      id: params.id,
      name: body.name ?? 'Sari Manager',
      email: body.email ?? 'manager.bks@toko.id',
      role: body.role ?? 'MANAGER',
      isActive: body.isActive ?? true,
      hasPin: Boolean(body.pin),
      stores: [
        { storeId: 'bks-1', store: { id: 'bks-1', name: 'Cabang Bekasi' } },
      ],
    })
  }),
]
