import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The CLI no longer reads `url` from schema.prisma and no longer loads `.env`
 * files on its own, so the connection string is provided here. The same URL is
 * handed to the runtime client through the @prisma/adapter-pg driver adapter
 * (see src/prisma/prisma-client.factory.ts).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need a database, so an unset variable must not
    // abort the command; the CLI reports a clear error when a URL is required.
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
