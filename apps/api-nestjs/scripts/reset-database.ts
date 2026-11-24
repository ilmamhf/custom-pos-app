import 'dotenv/config';
import { Client } from 'pg';
import { spawnSync } from 'child_process';

/**
 * Recreates the local development database from the committed migrations.
 *
 * `prisma migrate reset` is intentionally not used: Prisma 7 refuses to run it
 * unattended (it is guarded as a destructive action), which breaks CI and
 * scripted setups. This helper drops and recreates the database instead, then
 * applies the migration history and re-seeds it.
 *
 * It is destructive - only point it at a disposable development database.
 */

function parseDatabaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return name;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const databaseName = parseDatabaseName(databaseUrl);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [
    databaseName,
  ]);
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await client.query(`CREATE DATABASE "${databaseName}"`);
  await client.end();

  console.log(`Database "${databaseName}" recreated.`);
  run('npx', ['prisma', 'migrate', 'deploy']);
  run('npx', ['prisma', 'db', 'seed']);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
