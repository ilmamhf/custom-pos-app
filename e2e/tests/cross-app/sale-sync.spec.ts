import { test, expect } from '@playwright/test';
import {
  adjustStock,
  createProduct,
  createShift,
  findStore,
  getInventoryRow,
  getSale,
  pushSale,
  refundSale,
  tokenFor,
  unique,
} from '../../support/api';
import { loginAs } from '../../support/auth';

test.describe('Cross-application consistency', () => {
  test('X1/X2: an API-created sale appears in Admin; a refund updates status and stock', async ({
    page,
  }) => {
    const ownerToken = await tokenFor('owner');
    const cashierToken = await tokenFor('cashier');
    const bks = await findStore(ownerToken, 'BKS');
    const sku = unique('XAPP');

    const product = await createProduct(ownerToken, {
      sku,
      name: `Cross App ${sku}`,
      basePrice: 5000,
      costPrice: 2500,
    });
    await adjustStock(ownerToken, bks.id, product.id, 10);
    expect(
      (await getInventoryRow(ownerToken, bks.id, product.id)).stockOnHand
    ).toBe(10);

    const shift = await createShift(cashierToken, bks.id);
    const receipt = unique('E2E-XAPP');
    const sale = await pushSale(cashierToken, bks.id, {
      shiftId: shift.id,
      productId: product.id,
      unitPrice: 5000,
      qty: 2,
      receiptNo: receipt,
    });

    expect(
      (await getInventoryRow(ownerToken, bks.id, product.id)).stockOnHand
    ).toBe(8);

    await loginAs(page, 'owner', { storeCode: 'BKS' });
    await page.goto('/inventory');
    await expect(
      page.getByTestId(`stock-${bks.id}-${product.id}`)
    ).toContainText('8');

    await page.goto('/sales');
    await expect(page.getByText(receipt)).toBeVisible();

    // Refund the whole sale through the API, then verify Admin reflects it.
    const fullSale = await getSale(ownerToken, sale.saleId);
    await refundSale(ownerToken, sale.saleId, [
      { saleItemId: fullSale.items[0].id, refundQty: 2 },
    ]);

    await page.reload();
    await expect(
      page.getByTestId(`sale-status-${sale.saleId}`)
    ).toContainText('REFUNDED');

    await page.goto('/inventory');
    await expect(
      page.getByTestId(`stock-${bks.id}-${product.id}`)
    ).toContainText('10');
  });
});
