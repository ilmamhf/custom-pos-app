import { test, expect } from '@playwright/test';
import { API_BASE_URL, accounts, tokenFor } from '../../support/api';
import { loginAs, loginViaUi } from '../../support/auth';

test.describe('Auth and role guards', () => {
  test('A1: owner signs in through the UI and reaches the dashboard', async ({
    page,
  }) => {
    await loginViaUi(page, accounts.owner.email, accounts.owner.password);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole('heading', { name: 'Overview Dashboard' })
    ).toBeVisible();
  });

  test('A6: cashier cannot enter Admin routes or read cost prices', async ({
    page,
  }) => {
    await loginAs(page, 'cashier', { storeCode: 'BKS' });

    await page.goto('/dashboard');
    await expect(page.getByText('Access Restricted')).toBeVisible();

    await page.goto('/products');
    await expect(page.getByText('Access Restricted')).toBeVisible();

    const token = await tokenFor('cashier');
    const res = await fetch(`${API_BASE_URL}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  test('A7: manager cannot open Settings', async ({ page }) => {
    await loginAs(page, 'manager', { storeCode: 'BKS' });
    await page.goto('/settings');
    await expect(page.getByText('Access Restricted')).toBeVisible();
  });

  test('A7: owner can open Settings', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: /System Settings/i })
    ).toBeVisible();
  });
});
