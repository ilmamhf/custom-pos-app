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
| 2026-11-25 | `2026-11-24/` | **CI/E2E unification** (branch `ci/unify-validation`, PR #1) — Fixed 3 failing CI jobs from `c068646`: Backups (metric contract split + age-keygen permission), React Admin E2E (auth mode + CORS + throttle), Flutter POS Patrol Web (web-compatible migration test) |

## Quick links

- **Current state:** [`2026-11-23/project-audit.md`](2026-11-23/project-audit.md)
- **P1/P2 fixes:** [`2026-11-23/remediation-log.md`](2026-11-23/remediation-log.md)
- **CI/E2E fix results:** [`2026-11-24/ci-e2e-fix-results.md`](2026-11-24/ci-e2e-fix-results.md)
- **CI/E2E fix plan:** [`2026-11-24/ci-e2e-fix-plan.md`](2026-11-24/ci-e2e-fix-plan.md)
- **Baseline findings:** [`2026-11-22/project-audit-1.md`](2026-11-22/project-audit-1.md)
- **P0 fixes:** [`2026-11-22/remediation-log.md`](2026-11-22/remediation-log.md)
- **Operations runbook:** [`2026-11-22/operations-runbook.md`](2026-11-22/operations-runbook.md)
- **Remaining work:** See "Residual findings" section in [`2026-11-23/project-audit.md`](2026-11-23/project-audit.md#4-residual-findings-from-recheck)

## CI/E2E Run Evidence (2026-11-25) — Final Results

| Workflow | Job | Status | Run URL |
|----------|-----|--------|---------|
| E2E | React Admin (Playwright) | ✅ success (1m57s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729849/job/139100093888 |
| CI | React Admin (typecheck, test, build) | ✅ success (35s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099903255 |
| CI | API (lint-free typecheck, unit, e2e) | ✅ success (56s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099902691 |
| CI | Flutter POS (analyze, test, web build) | ✅ success (1m17s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099902956 |
| CI | Flutter POS (legacy flutter drive) | ✅ success (2m13s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729849/job/139100094456 |
| CI | Container images (build + smoke test) | ✅ success (2m38s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099903030 |
| CI | Dependency audit (blocking) | ✅ success (12s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099903013 |
| CI | Monitoring (Prometheus config + alert rules) | ✅ success (17s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099902984 |
| CI | **Backups** | ✅ success (1m35s) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729818/job/139099903119 |
| E2E | **Flutter POS (Patrol web)** | ❌ fail (6m33s, pre-existing isolation) | https://github.com/ilmamhf/custom-pos-app/actions/runs/45583729849/job/139100095779 |