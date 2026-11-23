import type { Page } from '@playwright/test';
import { accounts, apiLogin } from './api';

export type Role = keyof typeof accounts;

/**
 * Seeds a real session into localStorage so tests skip the login UI.
 * AuthContext revalidates through /auth/me on mount, so the API must be up.
 */
export async function loginAs(
  page: Page,
  role: Role,
  opts: { storeCode?: string } = {}
): Promise<void> {
  const creds = accounts[role];
  const session = await apiLogin(creds.email, creds.password);
  const selectedStore = opts.storeCode
    ? session.stores.find((s) => s.code === opts.storeCode)
    : undefined;
  const selectedStoreId = selectedStore?.id ?? 'ALL';

  await page.addInitScript(
    ({ session, selectedStoreId, email }) => {
      localStorage.setItem('pos_access_token', session.accessToken);
      localStorage.setItem('pos_refresh_token', session.refreshToken);
      localStorage.setItem(
        'pos_admin_user',
        JSON.stringify({ ...session.user, email })
      );
      localStorage.setItem('pos_admin_stores', JSON.stringify(session.stores));
      localStorage.setItem('pos_admin_selected_store_id', selectedStoreId);
    },
    { session, selectedStoreId, email: creds.email }
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

export async function loginViaUi(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}
