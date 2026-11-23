import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, '../../apps/api-nestjs');

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://pos:pos@localhost:15432/pos_e2e?schema=public';

const parsed = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'pos_e2e';

if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error(`Unsafe database name: ${databaseName}`);
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';

const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
  databaseName,
]);
if (existing.rowCount === 0) {
  console.log(`[e2e] creating database ${databaseName}`);
  await client.query(`CREATE DATABASE "${databaseName}"`);
} else {
  console.log(`[e2e] database ${databaseName} exists`);
}
await client.end();

const env = { ...process.env, DATABASE_URL: databaseUrl };

function run(args) {
  console.log(`[e2e] ${args.join(' ')}`);
  const result = spawnSync('npx', args, {
    cwd: apiDir,
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${args.join(' ')}`);
  }
}

run(['prisma', 'migrate', 'reset', '--force', '--skip-seed']);
run(['npm', 'run', 'prisma:seed']);

console.log('[e2e] database ready');
