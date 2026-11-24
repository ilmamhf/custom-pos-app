# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: install every dependency, generate the Prisma client and
# compile the NestJS application.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Prisma 7 no longer generates the client automatically.
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies, compiled output and the migration
# history.
#
# The image also runs the migrations and the seed, so it carries the Prisma
# CLI and ts-node even though neither is a runtime dependency of the service.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# npm skips every package listed in devDependencies while NODE_ENV is
# production, which would drop the Prisma CLI and ts-node as well. The
# devDependencies block is removed for this install so the requested tools
# land in node_modules; the original package.json is restored right after.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')" \
    && npm install --no-save --no-audit --no-fund \
        prisma@7.10.1 ts-node@10.9.2 typescript@5.7.3 @types/node@22 @types/bcrypt@5 \
    && npm cache clean --force
COPY --from=build /app/package.json ./package.json

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# The seed script is TypeScript and is executed with ts-node.
COPY --from=build /app/src/prisma/prisma-client.factory.ts ./src/prisma/prisma-client.factory.ts

# The generated Prisma client must not be replaced by the production install.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
