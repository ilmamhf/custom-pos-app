// Every query key is prefixed with the active session identity so cached data
// can never be read by a different signed-in user, even before a refetch.
let sessionScope = 'anonymous'

export function setQuerySession(userId: string | null | undefined) {
  sessionScope = userId ?? 'anonymous'
}

export const queryKeys = {
  stores: {
    get all() {
      return ['session', sessionScope, 'stores'] as const
    },
    list: () => [...queryKeys.stores.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.stores.all, 'detail', id] as const,
  },
  products: {
    get all() {
      return ['session', sessionScope, 'products'] as const
    },
    list: (storeId?: string, search?: string, page?: number, limit?: number) =>
      [
        ...queryKeys.products.all,
        'list',
        storeId ?? 'ALL',
        search ?? '',
        page ?? 1,
        limit ?? 20,
      ] as const,
  },
  inventory: {
    get all() {
      return ['session', sessionScope, 'inventory'] as const
    },
    list: (
      storeId?: string,
      lowStockOnly?: boolean,
      negativeOnly?: boolean,
      page?: number,
      limit?: number
    ) =>
      [
        ...queryKeys.inventory.all,
        'list',
        storeId ?? 'ALL',
        !!lowStockOnly,
        !!negativeOnly,
        page ?? 1,
        limit ?? 20,
      ] as const,
    ledger: (
      storeId?: string,
      productId?: string,
      reason?: string,
      page?: number,
      limit?: number
    ) =>
      [
        ...queryKeys.inventory.all,
        'ledger',
        storeId ?? 'ALL',
        productId ?? 'ALL',
        reason ?? 'ALL',
        page ?? 1,
        limit ?? 20,
      ] as const,
  },
  sales: {
    get all() {
      return ['session', sessionScope, 'sales'] as const
    },
    list: (
      storeId?: string,
      from?: string,
      to?: string,
      status?: string,
      page?: number,
      limit?: number
    ) =>
      [
        ...queryKeys.sales.all,
        'list',
        storeId ?? 'ALL',
        from ?? '',
        to ?? '',
        status ?? '',
        page ?? 1,
        limit ?? 20,
      ] as const,
  },
  reports: {
    get all() {
      return ['session', sessionScope, 'reports'] as const
    },
    summary: (storeId?: string, from?: string, to?: string) =>
      [...queryKeys.reports.all, 'summary', storeId ?? 'ALL', from ?? '', to ?? ''] as const,
  },
  users: {
    get all() {
      return ['session', sessionScope, 'users'] as const
    },
    list: () => [...queryKeys.users.all, 'list'] as const,
  },
}
