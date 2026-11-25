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
  // The app sends credentials (the HttpOnly refresh cookie), and browsers
  // reject a wildcard Access-Control-Allow-Origin on credentialed requests.
  // The Admin dev server runs on this exact origin, so allow it explicitly.
  CORS_ORIGIN: ADMIN_BASE_URL,
  // The suite signs in via the API for every test. The production default is
  // deliberately tight, so raise the login limit for this suite only.
  AUTH_LOGIN_THROTTLE_LIMIT: '50',
  AUTH_LOGIN_THROTTLE_TTL_MS: '60000',
  SWAGGER_ENABLED: 'false',
};

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: './test-results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: ADMIN_BASE_URL,
    // One WebM per test, embedded in the HTML report and exportable via
    // `npm run videos:export`. Set E2E_SLOWMO to slow every action down for
    // watchable recordings (see `npm run videos:record`).
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: Number(process.env.E2E_SLOWMO ?? 0),
    },
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
      // `--mode test` makes import.meta.env.MODE === 'test', which is what
      // the client keys its test-session storage off. Plain `npm run dev`
      // runs in development mode, where localStorage is not consulted and
      // every seeded session is ignored.
      command: `npm run dev -- --mode test --port ${ADMIN_PORT} --strictPort`,
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
