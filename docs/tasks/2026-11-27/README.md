# Documentation sync — 2026-11-27

**Status:** ✅ Complete (docs only)
**Branch:** `docs/sync-audit-2026-11-27`
**Base:** `main` @ `483108a` (PR #1 merged 2026-11-25)
**Scope:** documentation correctness and current-vs-historical indexing. No application, test, CI, or infrastructure behavior was changed.

---

## 1. Why this pass happened

A codebase/doc audit on 2026-11-27 found that onboarding docs matched the code, but several **status/audit** docs were stale or self-contradictory, and two **design** docs predated shipped features. This record lists every task from that audit and what was done.

Current verification baseline:

- `gh pr checks 1` → **10/10 pass** at head `5bc736b`
- `main` runs [CI 45625352176](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352176) and [E2E 45625352118](https://github.com/ilmamhf/custom-pos-app/actions/runs/45625352118) → `success`
- `.nvmrc` = `20`; `scripts/ci.mjs` (411 lines, 11 targets); `Makefile` delegates to it

---

## 2. Task list (all items from the 2026-11-27 audit)

| ID | Task | Status | Files changed |
|----|------|--------|---------------|
| T1 | Fix stale `AGENTS.md` status table and Definition of Done | ✅ Done | `AGENTS.md` |
| T2 | Reconcile `ci-e2e-fix-results.md` (head, Patrol outcome, run URLs, false workflow claim) | ✅ Done | `docs/audit/2026-11-24/ci-e2e-fix-results.md` |
| T3 | State the real workflow/`ci.mjs` contract instead of "workflows call ci.mjs" | ✅ Done | `AGENTS.md`, `docs/audit/2026-11-24/ci-e2e-fix-results.md` |
| T4 | Refresh `docs/audit/README.md` run evidence and links | ✅ Done | `docs/audit/README.md` |
| T5 | Fix `project-audit.md` P2/P3 markers and stale "execute P1 next" recommendation | ✅ Done | `docs/audit/2026-11-23/project-audit.md` |
| T6 | Document Payments, negative-stock policy/events, sync tombstones, models, migrations | ✅ Done | `docs/tasks/api-nestjs-endpoints.md` |
| T7 | Mark MVP design docs as superseded by the implemented schema/API | ✅ Done | `docs/mvp-design/database_design_schema.md`, `docs/mvp-design/complete_rest_api_contract.md` |
| T8 | Add `local_sale_tenders` (v2) to the Flutter local-table list | ✅ Done | `docs/tasks/pos-flutter-screens.md` |
| T9 | Fix README "Current integration boundaries" (containers/metrics now done) | ✅ Done | `README.md` |
| T10 | Mark historical progress snapshots | ✅ Done | `docs/be-nestjs/progress/full_backend_implementation.md`, `docs/admin-react/progress/full_admin_react_implementation.md`, `docs/pos-flutter/progress/phase2_drift_database.md` |
| T11 | Mark the failing-run snapshot as historical | ✅ Done | `docs/audit/2026-11-24/manual_audit.md` |
| T12 | Add a docs index that separates current from historical | ✅ Done | `docs/README.md` (new) |
| T13 | Record this task list and the open findings | ✅ Done | `docs/tasks/2026-11-27/README.md` (this file) |

---

## 3. What changed, per task

### T1 — `AGENTS.md`
- Added a status banner: branch merged as `483108a`; this file is the historical acceptance record.
- Replaced the stale status table (previously said `ci.mjs`/`Makefile`/`.nvmrc` were missing, Patrol was 5/7, Backups pending) with the final green evidence.
- Corrected the "Workflows refactored to targets" criterion to **"Workflow parity with `ci.mjs`"** because the workflows do not call `ci.mjs`.
- Clarified local-validation SKIP behavior and added `ci.mjs` platform caveats.

### T2 — `ci-e2e-fix-results.md`
- Head corrected from `5a092d9` to `5bc736b`; noted PR #1 merge commit `483108a`.
- Replaced the contradictory Patrol block (one table said ✅ 7/7, another said ❌ FAIL / 5/7) with a single resolved outcome.
- Updated the run table to the latest green runs (`45620759565` / `45620759147`) and added post-merge `main` runs.
- Changed the "Refactor workflows" item from ✅ to ❌ with an explanation.

### T3 — workflow/`ci.mjs` contract
- `grep -r ci.mjs .github/` returns **0 matches**; both workflows inline the commands.
- The docs now say workflows **mirror** the steps (Actions supplies services, buildx, secrets), and parity is manual.

### T4 — `docs/audit/README.md`
- Added a 2026-11-27 row and linked this task record.
- Replaced the superseded run table with the latest green jobs and a post-merge note.
- Changed "Current state" to "Post-remediation baseline" and added current-status links.

### T5 — `project-audit.md`
- Added a dated status banner (P1–P3 complete; CI unified/merged).
- Marked P2 and P3 complete in the roadmap.
- Replaced "Execute P1 sprint" with the actual remaining work (P4 hardware, gateway adapters, negative-stock Admin UI, test gaps).

### T6 — `api-nestjs-endpoints.md`
- Added `PaymentsModule`, `MetricsModule`, `ThrottlerModule` to the bootstrap list.
- Added the 11 negative-stock policy/event endpoints under Inventory.
- Added the full Payments section (14 routes, service, DTOs) and a security note.
- Documented sync `full=true`, durable `SyncCursor`, and `tombstones[]`.
- Expanded the Prisma model list from 10 to 17 and listed all 5 migrations.
- Added `GET /metrics` to the health section.

### T7 — MVP design docs
- Added "Superseded (2026-11-27)" banners pointing to `prisma/schema.prisma`, the current endpoint reference, and the remediation log.

### T8 — `pos-flutter-screens.md`
- Added `local_sale_tenders` (v2) to the local table list.

### T9 — `README.md`
- Rewrote "Current integration boundaries": containers/probes/metrics/backups are done; the remaining gaps are printer/cash drawer, real gateway adapters, and the negative-stock Admin UI.

### T10 / T11 — historical snapshots
- Added "Historical snapshot" banners to the three progress docs with the most misleading counts.
- Added a "superseded" banner to `manual_audit.md` (it recorded 3/10 failures at `e5bc8e4`).

### T12 — `docs/README.md`
- New index with three sections: Start here, Current reference, Status/audits, and Historical/design context.

---

## 4. Verification performed

```text
git diff --stat                  # docs only
grep -r "ci.mjs" .github/        # 0 matches (confirms T3 wording)
gh pr checks 1                   # 10/10 pass at 5bc736b
gh run list --limit 6            # main CI/E2E success
```

Doc checks:

- Every new relative link points to an existing file.
- The endpoint/model/migration lists were cross-checked against `apps/api-nestjs/src/app.module.ts`, the controllers, and `prisma/schema.prisma`.
- No code, workflow, test, dependency, or infrastructure file was modified.

---

## 5. Documentation status matrix

| Doc | After this pass |
|-----|-----------------|
| `README.md`, `docs/setup-from-zero.md`, `docs/bulk-product-import.md` | ✅ Current |
| `docs/tasks/admin-react-screens.md`, `docs/tasks/pos-flutter-screens.md` | ✅ Current |
| `docs/tasks/api-nestjs-endpoints.md` | ✅ Current (Payments, negative stock, tombstones, 17 models, 5 migrations) |
| `docs/audit/README.md`, `docs/audit/2026-11-24/ci-e2e-fix-results.md` | ✅ Current evidence |
| `docs/audit/2026-11-23/project-audit.md`, `remediation-log.md` | ✅ Dated baseline |
| `docs/mvp-design/*`, `*/progress/*`, `2026-11-22/*`, `manual_audit.md` | 📚 Historical (banner/indexed) |

---

## 6. Delivery history (2026-11-27)

The docs pass was merged by accident and re-landed after the CI flake it exposed was fixed.

| Step | Ref | Result |
|------|-----|--------|
| Docs branch pushed | `6db76ef`, `f40f25a` | PR #2 checks **10/10** — CI `46026164152`, E2E `46026164191`; then CI `46027026328`, E2E `46027026323` |
| Accidental merge | `c986c11` (PR #2) | `main` E2E `46027038425` **failed** in legacy drive: `Timed out waiting for Found 0 widgets with text containing Complete Sale: []` |
| Revert merge | PR [#3](https://github.com/ilmamhf/custom-pos-app/pull/3), `bbd3ce4` | **10/10** — CI `46028672853`, E2E `46028672861`; tree identical to `483108a` |
| Flake fix | PR [#4](https://github.com/ilmamhf/custom-pos-app/pull/4), `a55e968` | **10/10** — CI `46028884886`, E2E `46028884887`; legacy drive 2m5s |
| Docs re-land | PR #5 (this branch) | docs-only; checks recorded on the PR |

The failure was **not** caused by these docs. The same tree passed legacy drive at `f40f25a` (1m59s), on `main` run `45625352118`, and on the revert branch (2m21s). The test tapped **Charge** while the cart bottom sheet was still animating, so the tap could hit the modal barrier and dismiss the sheet; PR #4 waits for the sheet to settle and retries the tap without weakening any assertion.

---

## 7. Open findings (not fixed — outside a docs-only pass)

These were discovered during the audit and are recorded here so they are not lost. None were changed by this pass.

1. **Payments routes are unauthenticated.** `PaymentsController` has no `@UseGuards`/`@Roles`; only the global `ThrottlerGuard` applies. Add `JwtAuthGuard` + `RolesGuard` and role rules (owner for provider CRUD, staff for transaction lifecycle, signature-only webhook).
2. **Workflows do not call `ci.mjs`.** They mirror the steps inline. Add a parity check (or a thin workflow wrapper) so local and CI cannot drift silently.
3. **`ci.mjs` platform parity.** `containers`/`backup` use Linux-only `--network host`, `sleep`, `grep`, and assume Postgres on `5432` (local Compose publishes `15432`). `e2e-pos`/`e2e-patrol` always SKIP. Either document this as CI-only or add Windows/Compose-aware paths.
4. **Negative-stock policy Admin UI is missing.** The API and policy engine exist; React Admin only has the negative-stock filter/reconcile banner.
5. **Only the generic HTTP payment provider ships.** Real gateway adapters (signature formats, status codes) are still needed behind `IPaymentProvider`.
6. **Printer/cash drawer hardware is not implemented** (deferred).
7. **Open regression gaps** remain in `project-audit.md` §7 (cross-store e2e matrix, offline refund/PIN isolation, retry interceptor, multi-client connectivity).

---

## 8. Related

- [`../../../README.md`](../../../README.md) — setup and operations
- [`../../README.md`](../../README.md) — documentation index
- [`../../audit/README.md`](../../audit/README.md) — audit history and run evidence
- [`../../audit/2026-11-24/ci-e2e-fix-results.md`](../../audit/2026-11-24/ci-e2e-fix-results.md) — final CI/E2E results
- [`../api-nestjs-endpoints.md`](../api-nestjs-endpoints.md) — current API reference
- [`../../../AGENTS.md`](../../../AGENTS.md) — historical acceptance record
