import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, '../apps/api-nestjs');
const adminDir = path.resolve(here, '../apps/admin-react');

const API_PORT = process.env.E2E_API_PORT ?? '3100';
const ADMIN_PORT = process.env.E2E_ADMIN_PORT ?? '5174';

const API_BASE_URL = `http://localhost:${API_PORT}/api/v1`;
const ADMIN_BASE_URL = `http://localhost:${ADMIN_PORT}`;

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://pos:pos@localhost:15432/pos_e2e?schema=public';

const apiEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: API_PORT,
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-access-secret-at-least-32-characters-long',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-at-least-32-characters-long',
  CORS_ORIGIN: '*',
  SWAGGER_ENABLED: 'false',
};

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: ADMIN_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'admin',
      testMatch: /tests\/(admin|cross-app)\/.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npx nest start',
      cwd: apiDir,
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: apiEnv,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --port ${ADMIN_PORT} --strictPort`,
      cwd: adminDir,
      url: ADMIN_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_BASE_URL,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
