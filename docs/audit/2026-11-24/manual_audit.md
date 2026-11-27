# Overall Status

> **Historical snapshot — superseded (2026-11-27):** this records the failing run at `e5bc8e4` (3/10 jobs failed). The fixes and final green runs are in [`ci-e2e-fix-results.md`](ci-e2e-fix-results.md) and [`../README.md`](../README.md) (10/10 pass, PR #1 merged as `483108a`).

## From Latest Commit ID e5bc8e4

- 7/10 Success
- 3/10 Failed

Next is which and what job failed

# CI

## 1. Backups (encrypted backup + restore drill)

### Github AI Explanation Below

The job failed because the backup drill verification could not find the Prometheus metric file:

/var/lib/node_exporter/textfile_collector/pos_backup_last_drill_duration_seconds.prom

The drill did successfully verify the backup as encrypted, complete, and checksum-matching, but the final metric publication step did not create the expected .prom file. GitHub Actions then exited with code 1.

There are also Prisma/OpenSSL warnings during the Docker build, but the provided log does not show them causing the failure. The warning suggests Prisma could not detect the Docker image’s OpenSSL version and defaulted to openssl-1.1.x.

Likely fix: ensure the backup-drill script writes pos_backup_last_drill_duration_seconds.prom to the textfile collector directory and that directory exists and is writable. Also install OpenSSL explicitly in the Docker image to address the Prisma warning.

# E2E

## 1. React Admin = Failed

### Github AI Explanation

This job failed because the Admin Playwright E2E suite had **8 failed tests**, and the test command exited with code 1.

### Primary cause: API login rate limiting

Most failures were caused by the API returning:

```text
429 TOO_MANY_REQUESTS
Too many requests. Please slow down and try again later.
```

This affected login attempts for `owner@toko.id` in:

- Dashboard KPI/store-switcher test
- Products and inventory test
- Sales/refund test
- Cross-application sale-sync test
- Authentication and role-guard tests

The failures originate in [`e2e/support/api.ts`, line 41](https://github.com/ilmamhf/custom-pos-app/blob/e5bc8e48042a949f2d495784629f0e697d6f2932/e2e/support/api.ts#L41), where any non-successful login response throws an error. The helper is called by [`e2e/support/auth.ts`, line 16](https://github.com/ilmamhf/custom-pos-app/blob/e5bc8e48042a949f2d495784629f0e697d6f2932/e2e/support/auth.ts#L16).

The tests run in parallel, and each test repeatedly authenticates through `/auth/login`. That likely exceeded the API’s login rate limit. Retries then received the same 429 response, so the tests could not proceed.

### Secondary failure: Settings page assertion

The owner Settings test also failed independently:

```text
expect(locator).toBeVisible() failed
Locator: getByRole('heading', { name: /System Settings/i })
Timeout: 15000ms
element(s) not found
```

This assertion is at [`e2e/tests/admin/auth-and-guards.spec.ts`, line 45](https://github.com/ilmamhf/custom-pos-app/blob/e5bc8e48042a949f2d495784629f0e697d6f2932/e2e/tests/admin/auth-and-guards.spec.ts#L45). The owner reached `/settings`, but the expected `System Settings` heading was not rendered or was unavailable within the timeout.

### Why the job was marked failed

The workflow runs `npm test` in the Admin E2E job, and that command returned exit code 1. The workflow therefore failed at the E2E test step defined in [`.github/workflows/e2e.yml`, lines 59–61](https://github.com/ilmamhf/custom-pos-app/blob/e5bc8e48042a949f2d495784629f0e697d6f2932/.github/workflows/e2e.yml#L59-L61).

In summary: **the dominant issue was excessive parallel/repeated login requests triggering API rate limiting; there was also a separate missing `System Settings` heading failure.**

### 2. Flutter POS (legacy flutter drive) = Success

Success

### 3. Flutter POS (Patrol Web) = Failed

### Github AI Explanation Below

The job failed because the API never became available at http://localhost:3100/api/v1/health.

At 11:02:01, the workflow started dist/main.js, waited 60 seconds for /api/v1/health, then ran cat api.log and exited with code 1.

The captured logs do not include the actual contents of api.log, so the underlying API startup error isn’t visible. The later Flutter build also exited unexpectedly with code 1, likely as a consequence or separate build failure.

The workflow file for this run is .github/workflows/e2e.yml.
