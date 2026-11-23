import { test, expect } from '@playwright/test';
import {
  createShift,
  findProduct,
  findStore,
  getInventoryRow,
  getSale,
  pushSale,
  tokenFor,
  unique,
} from '../../support/api';
import { loginAs } from '../../support/auth';

test.describe('Sales and refunds', () => {
  test('A13/A15/A16/A18: list a sale, open it, and refund with a manager PIN', async ({
    page,
  }) => {
    const ownerToken = await tokenFor('owner');
    const cashierToken = await tokenFor('cashier');
    const bks = await findStore(ownerToken, 'BKS');
    const teh = await findProduct(ownerToken, bks.id, 'TEH-001');

    const before = await getInventoryRow(ownerToken, bks.id, teh.id);
    const beforeStock = before.stockOnHand as number;

    const shift = await createShift(cashierToken, bks.id);
    const receipt = unique('E2E-REFUND');
    const sale = await pushSale(cashierToken, bks.id, {
      shiftId: shift.id,
      productId: teh.id,
      unitPrice: 8000,
      qty: 1,
      paymentMethod: 'CASH',
      receiptNo: receipt,
    });

    await loginAs(page, 'owner', { storeCode: 'BKS' });
    await page.goto('/sales');

    await expect(page.getByText(receipt)).toBeVisible();
    await page.getByText(receipt).click();

    const detail = page.getByRole('dialog').filter({ hasText: receipt });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Process Refund' }).click();

    const refund = page.getByRole('dialog').filter({
      hasText: 'Process Item Refund',
    });
    await expect(refund).toBeVisible();
    await refund.locator('input[type="number"]').first().fill('1');
    await refund
      .getByPlaceholder('e.g., Wrong item ordered, customer return')
      .fill('E2E refund');
    await refund.getByPlaceholder('6-digit supervisor PIN').fill('123456');
    await refund.getByRole('button', { name: 'Authorize Refund' }).click();

    await expect(refund).toBeHidden();

    await expect
      .poll(async () => (await getSale(ownerToken, sale.saleId)).status)
      .toBe('REFUNDED');
    const after = await getSale(ownerToken, sale.saleId);
    expect(after.items[0].refundedQty).toBe(1);

    await expect
      .poll(
        async () =>
          (await getInventoryRow(ownerToken, bks.id, teh.id)).stockOnHand
      )
      .toBe(beforeStock);

    await expect(page.getByTestId(`sale-status-${sale.saleId}`)).toContainText(
      'REFUNDED'
    );
  });
});
