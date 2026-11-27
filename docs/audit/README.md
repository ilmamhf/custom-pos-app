# Audit history

| Date | Directory | Description |
|------|-----------|-------------|
| 2026-11-22 | `2026-11-22/` | **Baseline audit** (commit `9b787bb`) — 2 Critical, 17 High, 16 Medium, 5 Low findings + dependency advisories |
| 2026-11-22 | `2026-11-22/remediation-plan.md` | 12-task remediation plan (Tasks 1–10 = P0, 11–12 deferred) |
| 2026-11-22 | `2026-11-22/remediation-log.md` | Execution log with changes, verification, residual risks per task |
| 2026-11-22 | `2026-11-22/recheck-after-remediation.md` | Post-remediation recheck matrix + 4 live-test fixes |
| 2026-11-22 | `2026-11-22/operations-runbook.md` | Production deployment, config, migrations, health, backups, observability, rate limiting, payment/offline, printer, incident ownership |
| 2026-11-23 | `2026-11-23/project-audit.md` | **Post-remediation audit** (commit `7e5024b`) — P0 complete, updated readiness, residual findings, prioritized roadmap |
| 2026-11-24 | `2026-11-23/remediation-log.md` | **P1/P2 execution log** — H-13, R-01, R-03, R-04, R-02, R-06, migration backfill, and M-02 cookie/CSRF sessions, with verification results |
| 2026-11-25 | `2026-11-24/` | **CI/E2E unification** (branch `ci/unify-validation`, PR #1 — merged as `483108a` on 2026-11-25) — Fixed 3 failing CI jobs from `c068646`: Backups (metric contract split + age-keygen permission), React Admin E2E (auth mode + CORS + throttle), Flutter POS Patrol Web (web-compatible migration test + isolation fix) |
| 2026-11-27 | `../tasks/2026-11-27/` | **Documentation sync** — status/audit corrections, current-vs-historical doc index, and a task record for the doc-sync pass |

## Quick links

- **Current status / doc sync:** [`../tasks/2026-11-27/README.md`](../tasks/2026-11-27/README.md)
- **Documentation index (current vs historical):** [`../README.md`](../README.md)
- **Post-remediation baseline:** [`2026-11-23/project-audit.md`](2026-11-23/project-audit.md)
- **P1/P2 fixes:** [`2026-11-23/remediation-log.md`](2026-11-23/remediation-log.md)
- **CI/E2E fix results:** [`2026-11-24/ci-e2e-fix-results.md`](2026-11-24/ci-e2e-fix-results.md)
- **CI/E2E fix plan:** [`2026-11-24/ci-e2e-fix-plan.md`](2026-11-24/ci-e2e-fix-plan.md)
- **Baseline findings:** [`2026-11-22/project-audit-1.md`](2026-11-22/project-audit-1.md)
- **P0 fixes:** [`2026-11-22/remediation-log.md`](2026-11-22/remediation-log.md)
- **Operations runbook:** [`2026-11-22/operations-runbook.md`](2026-11-22/operations-runbook.md)
- **Remaining work:** See "Residual findings" section in [`2026-11-23/project-audit.md`](2026-11-23/project-audit.md#4-residual-findings-from-recheck)

## CI/E2E Run Evidence (2026-11-25) — Final Results

Head `5bc736b`, PR #1 merged as `483108a`. `gh pr checks 1` → 10/10 pass.

| Workflow | Job | Status | Run URL |
|----------|-----|--------|---------|
| E2E | React Admin (Playwright) | ✅ success (1m39s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759147/job/139227961215 |
| CI | React Admin (typecheck, test, build) | ✅ success (31s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961679 |
| CI | API (lint-free typecheck, unit, e2e) | ✅ success (56s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227963447 |
| CI | Flutter POS (analyze, test, web build) | ✅ success (1m38s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961597 |
| CI | Flutter POS (legacy flutter drive) | ✅ success (2m23s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759147/job/139227961769 |
| CI | Container images (build + smoke test) | ✅ success (3m30s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961841 |
| CI | Dependency audit (blocking) | ✅ success (10s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961305 |
| CI | Monitoring (Prometheus config + alert rules) | ✅ success (9s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961562 |
| CI | **Backups** | ✅ success (1m19s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759565/job/139227961633 |
| E2E | **Flutter POS (Patrol web)** | ✅ success (5m46s, 7/7 tests) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45620759147/job/139227960786 |

> **Note on Patrol Web**: Previously failing due to sync mechanism not pulling catalog for fresh IndexedDB. Fixed by: (1) preserving `local_products` and `local_sync_state` in tearDown (only clearing transactional tables), (2) triggering sync + trivial server-side price change to force working delta sync. All 7 tests now pass.

> **Post-merge**: `main` runs [CI 45625352176](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352176) and [E2E 45625352118](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352118) are also `success`.