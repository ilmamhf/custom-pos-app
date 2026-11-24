# Retail POS local development

This repository contains three applications that use one NestJS API and one PostgreSQL database:

| Application | Directory | Local URL | Purpose |
| --- | --- | --- | --- |
| NestJS API | `apps/api-nestjs` | `http://localhost:3000/api/v1` | Authentication, catalog, inventory, shifts, sales, refunds, reports, and offline sync |
| React Admin | `apps/admin-react` | `http://localhost:5173` | Owner and manager back-office portal |
| Flutter POS | `apps/pos-flutter` | URL printed by Flutter | Cashier application for desktop, phone browsers, and mobile devices |

Real sign-in requires all of the following:

1. PostgreSQL must be running on port `15432`.
2. The Prisma schema and seed data must be present in that database.
3. The NestJS API must be running on port `3000`.

The Flutter **Open offline demo** option does not require any of these services. It stores labeled sample data in the current browser and does not send it to the API.

## Prerequisites

Install these tools before starting the stack:

- Node.js 20 or newer, with npm
- Flutter stable with Dart 3.3 or newer
- Chrome, for the Flutter web application
- Docker Desktop with Docker Compose

The repository does not use a root npm workspace. Run `npm ci` separately in the API and React Admin directories.

## 1. Start PostgreSQL

Open Docker Desktop and wait until its engine is running. Then open a terminal at the repository root:

```powershell
cd D:\AI-Dev-Projects\custom-pos-1
docker compose up -d postgres
docker compose ps
```

The `postgres` service should report `healthy`. The compose file publishes the container's PostgreSQL port on host port `15432` and creates these local credentials:

```text
host: localhost
port: 15432
database: pos
username: pos
password: pos
```

These values match `apps/api-nestjs/.env.example`.

Stop PostgreSQL without deleting its data:

```powershell
docker compose stop postgres
```

Delete the local database volume and start again from an empty database:

```powershell
docker compose down -v
docker compose up -d postgres
```

The second command destroys all local API data. Use it only when you intentionally want a clean reset.

### Using an existing PostgreSQL server

An existing server is also supported. Create a `pos` login role and database, then update `DATABASE_URL` in `apps/api-nestjs/.env` to match the server's host, port, credentials, and database name. The API's Prisma schema expects PostgreSQL.

## 2. Install, migrate, and seed the NestJS API

Open a second terminal. From the repository root:

```powershell
cd apps\api-nestjs
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
```

On macOS or Linux, use `test -f .env || cp .env.example .env`. Keeping an existing `.env` avoids overwriting local credentials or port changes.

`prisma:migrate:deploy` applies the committed migration history in `prisma/migrations`. `prisma:seed` adds the stores, accounts, products, and starting inventory.

Prisma 7 keeps its configuration in `apps/api-nestjs/prisma.config.ts` (schema path, migration path, seed command, and the `DATABASE_URL` used by the CLI). The API process connects through the `@prisma/adapter-pg` driver adapter, so the same `DATABASE_URL` is used by both the CLI and the running service.

To recreate a disposable local database from the migration history, use:

```powershell
npm run prisma:reset
```

It drops and recreates the database, applies every migration, and re-seeds it. (`prisma migrate reset` is not used: Prisma 7 refuses to run it unattended.)

Start the API:

```powershell
npm run start:dev
```

For a production-style local process, run `npm run build` followed by `npm run start:prod` instead.

Leave this terminal running. Confirm that the API is available at:

- Swagger UI: `http://localhost:3000/api/docs`
- API base: `http://localhost:3000/api/v1`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

### Seeded development accounts

The seed source is `apps/api-nestjs/prisma/seed.ts`.

| Role | Email | Password | Supervisor PIN | Stores | Recommended use |
| --- | --- | --- | --- | --- | --- |
| Owner | `owner@toko.id` | `password123` | `123456` | BKS and KMG | React Admin and full API testing |
| Manager | `manager.bks@toko.id` | `password123` | `123456` | BKS | React Admin without Owner-only settings |
| Cashier | `kasir1@toko.id` | `password123` | None | BKS | Flutter POS checkout and sync testing |

The Owner and Manager PINs are required for actions such as refunds and supervisor-approved shift operations.

The seed also creates:

| Store | Code | Tax |
| --- | --- | --- |
| Cabang Bekasi | `BKS` | 11% |
| Cabang Kemang | `KMG` | 11% |

Running the seed again resets the seeded account passwords and PINs. It also resets the three seeded products' inventory to their starting quantities. Do not use the seed to reset a database after live testing without accepting that stock reset.

These are development-only credentials. Change or remove them before deploying the API outside a local environment.

### Bulk product data

The normal seed remains small. To load a large product and starting-stock dataset from CSV, use the standalone bulk loader:

```powershell
cd apps\api-nestjs
npm run data:import:dry-run -- .\data\templates\products-import-example.csv
```

See [`docs/bulk-product-import.md`](docs/bulk-product-import.md) for the template, validation rules, and import command.

### Verify the API login from PowerShell

With the API running:

```powershell
$body = @{
  email = 'owner@toko.id'
  password = 'password123'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3000/api/v1/auth/login' `
  -ContentType 'application/json' `
  -Body $body
```

A successful response contains `accessToken`, `refreshToken`, `user`, and `stores`.

## 3. Run React Admin

Open a third terminal:

```powershell
cd apps\admin-react
npm ci
npm run dev
```

Open `http://localhost:5173` and sign in with:

```text
owner@toko.id
password123
```

The Vite development server proxies `/api` requests to `http://localhost:3000`. The default configuration therefore needs no environment variable.

To point the client directly at another API URL, set `VITE_API_BASE_URL` before starting or building Vite:

```powershell
$env:VITE_API_BASE_URL = 'http://localhost:3000/api/v1'
npm run dev
```

Vite reads environment variables when the client starts or builds. For a production build:

```powershell
npm run build
npm run preview
```

Do not open `dist/index.html` directly with a `file://` URL. Serve the build through Vite or another HTTP server.

Use the Owner account for the first live check. Owner-only screens include staff management and some catalog creation actions. A Cashier can authenticate but is not an Admin user.

## 4. Run Flutter POS

Open a fourth terminal:

```powershell
cd apps\pos-flutter
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Open the URL printed by Flutter. Sign in with:

```text
kasir1@toko.id
password123
```

Select `BKS`, then open a shift before starting a checkout.

The default API URL is already `http://localhost:3000/api/v1`, but passing `API_BASE_URL` explicitly makes the target visible and avoids accidentally using a previously built client.

### Run on a physical phone or tablet

`localhost` on a phone means the phone itself, not the computer running the API. Find the computer's LAN IPv4 address with `ipconfig`, then use it in the Flutter command:

```powershell
flutter devices
flutter run -d <device-id> --dart-define=API_BASE_URL=http://<computer-ip>:3000/api/v1
```

Allow Node.js or the NestJS process through the Windows Firewall when prompted. The computer and phone must be on the same network.

### Build and serve the Flutter web application

```powershell
flutter build web --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Serve `build/web` through an HTTP server. For example, if Python is installed:

```powershell
python -m http.server 8085 --directory build/web
```

Then open `http://localhost:8085`.

## 5. Verify the full live path

Use this order for a first integration check:

1. Start PostgreSQL and confirm `docker compose ps` reports it healthy.
2. Start the NestJS API and open its Swagger page.
3. Sign in to React Admin with the Owner account and confirm the dashboard loads.
4. Sign in to Flutter POS with the Cashier account, select BKS, and open a shift.
5. Complete a cash sale in Flutter POS.
6. Confirm the local receipt appears and the sale enters the sync outbox.
7. Synchronize the Flutter session, refresh React Admin, and confirm the sale and inventory change appear.

The Flutter browser demo cannot validate steps 5 through 7 because demo shifts and sales are deliberately kept out of the server sync outbox.

## Troubleshooting

### The UI says it cannot reach the server

Check the API first:

```powershell
Invoke-WebRequest http://localhost:3000/api/docs
```

If that request fails, the NestJS process is not running or is using another port. Also confirm that the client uses the expected API URL. A Flutter physical device cannot use `localhost` to reach the API on your computer.

### The API reports that it cannot reach PostgreSQL

Check the database container:

```powershell
docker compose ps
docker compose logs postgres
```

The application expects PostgreSQL on `localhost:15432`. A PostgreSQL installation listening on port `5432` is not used unless `DATABASE_URL` is changed to that port and its credentials.

### Login returns `Invalid email or password`

The database is reachable, but the expected account is missing or has another password. Run the seed again:

```powershell
cd apps\api-nestjs
npm run prisma:seed
```

Then retry with `owner@toko.id` or `kasir1@toko.id` and `password123`.

### React Admin shows an authorization error

Sign in as the Owner for full access. Cashier credentials are valid for the API but are not intended for the Admin portal. Manager users do not have access to Owner-only staff and settings operations.

### React Admin cannot call the API in a built bundle

The default `/api/v1` URL assumes a proxy or same-origin API deployment. For a separately hosted bundle, build with an absolute URL:

```powershell
$env:VITE_API_BASE_URL = 'http://localhost:3000/api/v1'
npm run build
```

### Flutter shows stale local data

Flutter stores native data in the app sandbox and browser data in IndexedDB. Clear the app's site data in Chrome, or clear the native application data, when you need to remove a previous local session. Clearing browser site data removes local Flutter transactions that have not synced.

### Reset the complete local stack

Run these commands only when you intend to discard local database data:

```powershell
docker compose down -v
docker compose up -d postgres
cd apps\api-nestjs
npm run prisma:migrate:deploy
npm run prisma:seed
```

Then restart the API, React Admin, and Flutter POS.

### Existing database created with `prisma db push`

The repository now carries a baseline migration. A database created by
`db push` has no `_prisma_migrations` history, so `migrate deploy` will report
that the schema is not empty. For a disposable local database, run
`docker compose down -v` and apply the migration from scratch. To preserve an
existing development database, baseline it once:

```powershell
cd apps\api-nestjs
npx prisma migrate resolve --applied 20261123000000_init
npm run prisma:migrate:deploy
```

## Current integration boundaries

The local setup supports login, catalog, shift, sale, refund, inventory, report,
and sync paths, including offline refunds with a manager authorization grant,
closed-shift synchronization, per-record sync failure handling, and the React
Admin user-store mapping.

Remaining gaps are tracked in `docs/audit/2026-11-22/remediation-log.md`:
Bluetooth receipt-printer hardware integration, a real payment-provider/settlement
model, and the production deployment/observability work (containers, probes,
metrics). The Prisma 7, Zod 4, and React Router 7 upgrades are done - see
`docs/audit/2026-11-23/remediation-log.md`.
