import { test, expect } from '@playwright/test';
import {
  api,
  createShift,
  findProduct,
  findStore,
  formatIdr,
  pushSale,
  tokenFor,
  unique,
} from '../../support/api';
import { loginAs } from '../../support/auth';

test.describe('Dashboard', () => {
  test('A8/A9: KPIs load and the store switcher scopes them', async ({ page }) => {
    const ownerToken = await tokenFor('owner');
    const cashierToken = await tokenFor('cashier');
    const bks = await findStore(ownerToken, 'BKS');
    const kmg = await findStore(ownerToken, 'KMG');
    const teh = await findProduct(ownerToken, bks.id, 'TEH-001');
    const shift = await createShift(cashierToken, bks.id);

    await pushSale(cashierToken, bks.id, {
      shiftId: shift.id,
      productId: teh.id,
      unitPrice: 8000,
      qty: 1,
      paymentMethod: 'CASH',
      receiptNo: unique('DASH'),
    });

    const all = await api.get<{ grossSales: number; transactionCount: number }>(
      ownerToken,
      '/reports/summary'
    );
    const kmgSummary = await api.get<{ grossSales: number }>(
      ownerToken,
      `/reports/summary?storeId=${kmg.id}`
    );

    await loginAs(page, 'owner');
    await expect(
      page.getByRole('heading', { name: 'Overview Dashboard' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'All Time' }).click();
    await expect(page.getByTestId('kpi-gross-sales')).toContainText(
      formatIdr(all.grossSales)
    );

    await page.getByTestId('global-store-switcher-trigger').click();
    await page.getByTestId(`store-option-${kmg.id}`).click();

    await expect(page.getByTestId('active-store-label')).toContainText('KMG');
    await expect(page.getByTestId('kpi-gross-sales')).toContainText(
      formatIdr(kmgSummary.grossSales)
    );
  });
});
