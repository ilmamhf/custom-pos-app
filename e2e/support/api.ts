export const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:3100/api/v1';

export type Account = { email: string; password: string };

export const accounts = {
  owner: { email: 'owner@toko.id', password: 'password123' },
  manager: { email: 'manager.bks@toko.id', password: 'password123' },
  cashier: { email: 'kasir1@toko.id', password: 'password123' },
} satisfies Record<string, Account>;

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; role: string; email?: string };
  stores: Array<{ id: string; name: string; code: string; taxRateBps: number }>;
};

export function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function formatIdr(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as LoginResult;
}

export function authHeaders(
  token: string,
  storeId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (storeId) headers['X-Store-Id'] = storeId;
  return headers;
}

async function request<T = any>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  storeId?: string
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: authHeaders(token, storeId),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `${method} ${path} failed: ${res.status} ${await res.text()}`
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T = any>(token: string, path: string, storeId?: string) =>
    request<T>(token, 'GET', path, undefined, storeId),
  post: <T = any>(token: string, path: string, body: unknown, storeId?: string) =>
    request<T>(token, 'POST', path, body, storeId),
  put: <T = any>(token: string, path: string, body: unknown, storeId?: string) =>
    request<T>(token, 'PUT', path, body, storeId),
  patch: <T = any>(token: string, path: string, body: unknown, storeId?: string) =>
    request<T>(token, 'PATCH', path, body, storeId),
};

export async function tokenFor(role: keyof typeof accounts): Promise<string> {
  return (await apiLogin(accounts[role].email, accounts[role].password)).accessToken;
}

export async function findStore(token: string, code: string) {
  const stores = await api.get<Array<{ id: string; code: string; name: string }>>(
    token,
    '/stores'
  );
  const store = stores.find((s) => s.code === code);
  if (!store) throw new Error(`Store ${code} not found`);
  return store;
}

export async function findProduct(token: string, storeId: string, sku: string) {
  const res = await api.get<{ items: Array<any> }>(
    token,
    `/products?storeId=${storeId}&search=${encodeURIComponent(sku)}`
  );
  const product = res.items.find((p) => p.sku === sku);
  if (!product) throw new Error(`Product ${sku} not found`);
  return product;
}

export async function getInventoryRow(
  token: string,
  storeId: string,
  productId: string
) {
  const res = await api.get<{ items: Array<any> }>(
    token,
    `/inventory?storeId=${storeId}&limit=100`
  );
  return res.items.find((row) => row.productId === productId);
}

export async function createShift(
  cashierToken: string,
  storeId: string,
  openingCash = 0
) {
  const id = crypto.randomUUID();
  return api.post<{ id: string; openedAt: string }>(
    cashierToken,
    '/shifts/open',
    { id, storeId, openingCash },
    storeId
  );
}

export async function pushSale(
  cashierToken: string,
  storeId: string,
  opts: {
    shiftId: string;
    productId: string;
    unitPrice: number;
    qty?: number;
    paymentMethod?: 'CASH' | 'QRIS' | 'CARD';
    receiptNo?: string;
    createdAt?: string;
  }
) {
  const id = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const qty = opts.qty ?? 1;
  const unitPrice = opts.unitPrice;
  const paymentMethod = opts.paymentMethod ?? 'CASH';
  const receiptNo = opts.receiptNo ?? unique('E2E');
  const createdAt = opts.createdAt ?? new Date().toISOString();

  const res = await api.post<{
    syncedSaleIds: string[];
    failed: Array<{ id: string; error: string }>;
  }>(
    cashierToken,
    '/sync/push',
    {
      storeId,
      shifts: [],
      sales: [
        {
          id,
          shiftId: opts.shiftId,
          receiptNo,
          subtotal: unitPrice * qty,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: unitPrice * qty,
          paymentMethod,
          createdAt,
          items: [
            {
              id: itemId,
              productId: opts.productId,
              productNameSnapshot: 'E2E item',
              unitPrice,
              qty,
            },
          ],
        },
      ],
    },
    storeId
  );

  if (!res.syncedSaleIds.includes(id)) {
    throw new Error(`Sale not synced: ${JSON.stringify(res.failed)}`);
  }
  return { saleId: id, itemId, receiptNo };
}

export async function getSale(token: string, saleId: string) {
  return api.get<any>(token, `/sales/${saleId}`);
}

export async function refundSale(
  token: string,
  saleId: string,
  items: Array<{ saleItemId: string; refundQty: number }>,
  managerPin = '123456'
) {
  return api.post<any>(token, `/sales/${saleId}/refund`, {
    managerPin,
    reason: 'E2E refund',
    items,
  });
}

export async function createProduct(
  ownerToken: string,
  dto: { sku: string; name: string; basePrice: number; costPrice?: number }
) {
  return api.post<{ id: string; sku: string; basePrice: number }>(
    ownerToken,
    '/products',
    dto
  );
}

export async function setPriceOverride(
  token: string,
  storeId: string,
  productId: string,
  priceOverride: number | null
) {
  return api.put(
    token,
    `/stores/${storeId}/products/${productId}/price`,
    { priceOverride },
    storeId
  );
}

export async function adjustStock(
  token: string,
  storeId: string,
  productId: string,
  deltaQty: number,
  reason: 'RESTOCK' | 'ADJUSTMENT' = 'RESTOCK'
) {
  return api.post(
    token,
    '/inventory/adjust',
    { storeId, productId, deltaQty, reason, note: 'E2E adjustment' },
    storeId
  );
}
