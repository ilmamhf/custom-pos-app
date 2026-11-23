# E2E tests

Hybrid end-to-end suite for the audit's critical flows.

- **Playwright** (`e2e/`) drives React Admin and cross-application checks.
- **Flutter `integration_test`** (`apps/pos-flutter/integration_test/`) drives
  the real POS UI on Chrome.
- A dedicated `pos_e2e` database is reset and seeded before each run.

Flow catalog, severity, and coverage: [`docs/tasks/e2e-flow-catalog.md`](../docs/tasks/e2e-flow-catalog.md).

## Ports

| Service | Port |
| --- | --- |
| E2E API | 3100 |
| React Admin (Vite) | 5174 |
| Flutter web drive | 7357 |
| chromedriver | 4444 |
| PostgreSQL | 15432 (compose) |

## Prerequisites

- Docker Postgres running (`docker compose up -d postgres`).
- Node 20+.
- Playwright Chromium: `cd e2e && npm install --include=dev && npx playwright install chromium`.
- Flutter stable + Chrome.
- ChromeDriver matching the installed Chrome, running on port 4444.

## React Admin + cross-app

```powershell
cd e2e
npm test
```

`npm test` creates/resets `pos_e2e`, seeds it, starts the API on 3100 and Vite on
5174, and runs the Playwright specs.

Run a single file:

```powershell
npx playwright test tests/admin/sales-refund.spec.ts
```

Reports: `e2e/playwright-report` (ignored by git).

## Recordings and export

Every test records a 1280×720 **WebM** at
`e2e/test-results/<test-title>/video.webm`; the HTML report embeds and plays it
directly (Chromium/Firefox/Edge, Android, VLC).

Export all recordings into one flat folder:

```powershell
cd e2e
npm run videos:export
```

Output: `e2e/videos/<test-title>.webm` (ignored by git).

### Watchable recordings (slow motion)

```powershell
cd e2e
npm run videos:record            # slowMo = 250 ms per action
$env:E2E_SLOWMO='500'; npm run videos:record
```

This resets the DB, runs the suite with slow motion, and exports the WebM
recordings. Normal `npm test` runs at full speed (`E2E_SLOWMO` defaults to 0).

MP4 is optional (for Safari/QuickTime or sharing outside a browser):

```powershell
npm install --no-save ffmpeg-static   # provides libx264
npm run videos:export:mp4
```

Playwright's bundled ffmpeg is WebM/VP9-only, so the `:mp4` variant needs a full
ffmpeg (`ffmpeg-static`, an `ffmpeg` on `PATH`, or `FFMPEG_PATH`).

## Flutter POS (Patrol)

Primary harness: **Patrol web** (Playwright under the hood). The legacy
`flutter drive` suite remains in `integration_test/` as a fallback.

Prerequisites: Node, Flutter, and the Patrol CLI.

```powershell
flutter pub global activate patrol_cli
# Windows: add %LOCALAPPDATA%\Pub\Cache\bin to PATH
```

```powershell
# 1. Reset/seed the e2e database
cd e2e
npm run db:setup

# 2. Start the API on 3100 against pos_e2e
cd ../apps/api-nestjs
$env:NODE_ENV='test'
$env:PORT='3100'
$env:DATABASE_URL='postgresql://pos:pos@localhost:15432/pos_e2e?schema=public'
$env:JWT_ACCESS_SECRET='e2e-access-secret-at-least-32-characters-long'
$env:JWT_REFRESH_SECRET='e2e-refresh-secret-at-least-32-characters-long'
$env:CORS_ORIGIN='*'
node dist/main.js

# 3. Run Patrol (all tests, headless, WebM video, 250 ms slow motion)
cd ../pos-flutter
patrol test --device chrome `
  --web-headless --web-video=on --web-slow-mo=250 `
  --dart-define=API_BASE_URL=http://localhost:3100/api/v1
```

- Report: `apps/pos-flutter/playwright-report/index.html` (video embedded).
- Video: `--web-video=on` (or `retain-on-failure`); `--web-slow-mo` makes it
  watchable. Patrol auto-installs Node/Playwright deps on first run.
  Leave `--web-results-dir`/`--web-report-dir` unset: Patrol then uses the
  absolute app-relative defaults, whereas relative overrides resolve from its
  internal web-runner directory.
- Export recordings:
  ```powershell
  cd apps/pos-flutter
  node scripts/export-patrol-videos.mjs          # WebM -> patrol_videos/
  node scripts/export-patrol-videos.mjs --mp4    # optional, needs a full ffmpeg
  ```
  `patrol_videos/` is the stable-named evidence set. The exporter moves raw
  `test-results/<test>/video.webm` files by default, so the same recording is
  not left in two places; use `--keep-raw` to copy instead. The HTML report
  keeps its own embedded copy under `playwright-report/data/`.

### Why Patrol specs stay here

`patrol test` builds the app and the tests together, generates
`apps/pos-flutter/test_bundle.dart`, and the tests import
`package:pos_flutter/main.dart`. The Patrol keys (`patrol`,
`patrol_finders`, `patrol.test_directory`) also live in this package's
`pubspec.yaml`. That makes `patrol_test/` the Flutter equivalent of the root
`e2e/` folder; moving the specs outside the package would break discovery and
the app build. The root `e2e/` project is the black-box Node/Playwright runner
for React Admin and cross-app flows.

Legacy fallback (requires chromedriver on port 4444):

```powershell
cd apps/pos-flutter
flutter drive --driver=test_driver/integration_test.dart `
  --target=integration_test/pos_critical_flow_test.dart `
  -d chrome --headless --browser-name=chrome --web-port=7357 `
  --dart-define=API_BASE_URL=http://localhost:3100/api/v1
```

## What the Flutter flow covers

Patrol runs separate cases with one video each:

- Cashier login, invalid login, store selection.
- Shift open/continue, close, and server acknowledgment.
- Store-scoped catalog, cart add/increment/decrement/remove, item and order
  discounts.
- Cash sale, sale-complete dialog, server acknowledgment (sale + stock).
- Admin price change → POS sync → updated catalog price.

Legacy fallback: `integration_test/pos_critical_flow_test.dart` via
`flutter drive`.

## CI

[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) runs three jobs with
Postgres services: React Admin (Playwright), Flutter POS (Patrol web), and a
legacy Flutter drive job retained until Patrol is verified in CI.
