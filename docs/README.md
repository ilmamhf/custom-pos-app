# Documentation index

Last reviewed: **2026-11-27**. Current state: PR #1 (`ci/unify-validation`) merged as `483108a`; `gh pr checks 1` → 10/10 pass; `main` CI and E2E runs are green.

This index separates **current reference** from **historical snapshots**. When a document and the code disagree, the code and `docs/tasks/api-nestjs-endpoints.md` win.

## Start here

- [`../README.md`](../README.md) — local setup, ports, seeded accounts, containers, monitoring, backups
- [`setup-from-zero.md`](setup-from-zero.md) — shortest path from a clean machine
- [`bulk-product-import.md`](bulk-product-import.md) — CSV catalog/stock loader

## Current reference (trust these)

- [`tasks/api-nestjs-endpoints.md`](tasks/api-nestjs-endpoints.md) — modules, endpoints, models, migrations
- [`tasks/admin-react-screens.md`](tasks/admin-react-screens.md) — routes, pages, hooks
- [`tasks/pos-flutter-screens.md`](tasks/pos-flutter-screens.md) — routes, screens, local tables
- [`tasks/e2e-flow-catalog.md`](tasks/e2e-flow-catalog.md) — E2E coverage and known product gaps
- [`../deploy/README.md`](../deploy/README.md) — containers, Kubernetes, TLS
- [`../deploy/backup/README.md`](../deploy/backup/README.md) — encrypted backups and restore drill
- [`../deploy/monitoring/README.md`](../deploy/monitoring/README.md) — Prometheus, alerts, runbook

## Status, audits, and tasks

- [`audit/README.md`](audit/README.md) — audit history + latest CI/E2E run evidence
- [`audit/2026-11-24/ci-e2e-fix-results.md`](audit/2026-11-24/ci-e2e-fix-results.md) — final CI/E2E results (all jobs green)
- [`audit/2026-11-23/project-audit.md`](audit/2026-11-23/project-audit.md) — post-remediation baseline and residual findings
- [`audit/2026-11-23/remediation-log.md`](audit/2026-11-23/remediation-log.md) — P1/P2/P3 execution log
- [`tasks/2026-11-27/README.md`](tasks/2026-11-27/README.md) — current documentation-sync task record and open findings

## Historical / design context (superseded)

- [`mvp-design/`](mvp-design/) — original MVP design; the schema and API contract carry "superseded" banners
- [`be-nestjs/progress/`](be-nestjs/progress/), [`admin-react/progress/`](admin-react/progress/), [`pos-flutter/progress/`](pos-flutter/progress/) — implementation snapshots from 2026-11-21
- [`audit/2026-11-22/`](audit/2026-11-22/) — baseline audit and P0 remediation
- [`audit/2026-11-24/ci-e2e-fix-plan.md`](audit/2026-11-24/ci-e2e-fix-plan.md) — pre-fix plan (some hypotheses were superseded by the results)
- [`audit/2026-11-24/manual_audit.md`](audit/2026-11-24/manual_audit.md) — failing-run snapshot at `e5bc8e4`
