import { test, expect } from '@playwright/test';
import {
  findProduct,
  findStore,
  getInventoryRow,
  tokenFor,
  unique,
} from '../../support/api';
import { loginAs } from '../../support/auth';

test.describe('Products and inventory', () => {
  test('A20/A21/A23/A25/A27/A29: create, price, restock, and transfer', async ({
    page,
  }) => {
    const ownerToken = await tokenFor('owner');
    const bks = await findStore(ownerToken, 'BKS');
    const kmg = await findStore(ownerToken, 'KMG');
    const sku = unique('E2E-SKU');

    await loginAs(page, 'owner', { storeCode: 'BKS' });
    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Master Product Catalog' })
    ).toBeVisible();

    // A21 create product
    await page.getByTestId('create-product-btn').click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByPlaceholder('e.g. KOPI-001').fill(sku);
    await createDialog
      .getByPlaceholder('e.g. Kopi Susu Gula Aren')
      .fill(`E2E Product ${sku}`);
    await createDialog.getByPlaceholder('18000').fill('20000');
    await createDialog.getByPlaceholder('9000').fill('10000');
    await createDialog.getByRole('button', { name: 'Create Product' }).click();
    await expect(createDialog).toBeHidden();

    const product = await findProduct(ownerToken, bks.id, sku);

    // A20 search shows the product
    await page
      .getByPlaceholder('Search by SKU, Barcode, or Name...')
      .fill(sku);
    const productRow = page.locator('tr', { hasText: sku });
    await expect(productRow).toBeVisible();

    // A23 per-store price override
    await productRow.getByRole('button', { name: /Pricing/ }).click();
    const priceDialog = page.getByRole('dialog');
    await expect(priceDialog).toContainText('Per-Store Price Override');
    await priceDialog
      .getByRole('button', { name: /Cabang Bekasi/ })
      .click();
    await priceDialog.getByRole('spinbutton').fill('15000');
    await priceDialog.getByRole('button', { name: 'Save Price' }).click();
    await expect(priceDialog).toBeHidden();

    await expect
      .poll(async () => (await findProduct(ownerToken, bks.id, sku)).priceOverride)
      .toBe(15000);

    // A25/A27 restock
    await page.goto('/inventory');
    const invRow = page
      .locator('tr', { hasText: sku })
      .filter({ hasText: 'Cabang Bekasi' });
    await expect(invRow).toBeVisible();
    await invRow.getByRole('button', { name: 'Restock' }).click();

    const adjustDialog = page.getByRole('dialog');
    await expect(adjustDialog).toContainText('Restock / Adjust Inventory');
    await adjustDialog.getByRole('spinbutton').fill('10');
    await adjustDialog.getByRole('button', { name: 'Submit Adjustment' }).click();
    await expect(adjustDialog).toBeHidden();

    await expect
      .poll(
        async () =>
          (await getInventoryRow(ownerToken, bks.id, product.id)).stockOnHand
      )
      .toBe(10);

    // A29 transfer
    const invRowAfter = page
      .locator('tr', { hasText: sku })
      .filter({ hasText: 'Cabang Bekasi' });
    await invRowAfter.getByRole('button', { name: 'Transfer' }).click();
    const transferDialog = page.getByRole('dialog');
    await expect(transferDialog).toContainText('Inter-Store Stock Transfer');
    await transferDialog.getByRole('spinbutton').fill('3');
    await transferDialog.getByRole('button', { name: 'Execute Transfer' }).click();
    await expect(transferDialog).toBeHidden();

    await expect
      .poll(
        async () =>
          (await getInventoryRow(ownerToken, bks.id, product.id)).stockOnHand
      )
      .toBe(7);
    await expect
      .poll(
        async () =>
          (await getInventoryRow(ownerToken, kmg.id, product.id)).stockOnHand
      )
      .toBe(3);
  });
});
