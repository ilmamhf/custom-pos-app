import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 runs on a Rust-free client that talks to PostgreSQL through the
 * `pg` driver via the `@prisma/adapter-pg` adapter. Every entry point that
 * needs a client (the Nest service, the seed script, CLI helpers) builds the
 * adapter here so the connection settings stay identical.
 */

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function createPrismaAdapter(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL');
  }

  return new PrismaPg({
    connectionString,
    // Prisma 6 used a 5s connect timeout and a bounded pool. node-postgres has
    // no timeout by default, so the v6 behaviour is restored explicitly.
    max: readPositiveInt('DATABASE_POOL_MAX', 10),
    connectionTimeoutMillis: readPositiveInt('DATABASE_CONNECTION_TIMEOUT_MS', 5_000),
    idleTimeoutMillis: readPositiveInt('DATABASE_IDLE_TIMEOUT_MS', 30_000),
  });
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter() });
}
