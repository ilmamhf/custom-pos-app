export const queryKeys = {
  stores: {
    all: ['stores'] as const,
    list: () => [...queryKeys.stores.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.stores.all, 'detail', id] as const,
  },
  products: {
    all: ['products'] as const,
    list: (storeId?: string, search?: string, page?: number) =>
      [...queryKeys.products.all, 'list', storeId ?? 'ALL', search ?? '', page ?? 1] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    list: (storeId?: string, lowStockOnly?: boolean, negativeOnly?: boolean, page?: number) =>
      [
        ...queryKeys.inventory.all,
        'list',
        storeId ?? 'ALL',
        !!lowStockOnly,
        !!negativeOnly,
        page ?? 1,
      ] as const,
    ledger: (storeId?: string, productId?: string, reason?: string, page?: number) =>
      [
        ...queryKeys.inventory.all,
        'ledger',
        storeId ?? 'ALL',
        productId ?? 'ALL',
        reason ?? 'ALL',
        page ?? 1,
      ] as const,
  },
  sales: {
    all: ['sales'] as const,
    list: (storeId?: string, from?: string, to?: string, status?: string, page?: number) =>
      [
        ...queryKeys.sales.all,
        'list',
        storeId ?? 'ALL',
        from ?? '',
        to ?? '',
        status ?? '',
        page ?? 1,
      ] as const,
  },
  reports: {
    all: ['reports'] as const,
    summary: (storeId?: string, from?: string, to?: string) =>
      [...queryKeys.reports.all, 'summary', storeId ?? 'ALL', from ?? '', to ?? ''] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => [...queryKeys.users.all, 'list'] as const,
  },
}
