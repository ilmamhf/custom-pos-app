# E2E flow catalog and automation plan

- **Branch:** `test/e2e-critical-flows`
- **Strategy:** hybrid — Playwright for React Admin and cross-application checks;
  Patrol web for the POS UI (legacy `flutter drive` integration_test kept as a
  fallback). API calls are used for setup, assertions, and data seeding.
- **Rule:** every flow is listed; only **Critical** flows are automated.
  High/Medium/Low are documented as follow-ups.
- **Environment:** dedicated `pos_e2e` database, real API, real browsers.
  Tests run serially because stock/sales are shared mutable state.

Status legend: `AUTO` = automated in this change · `DOC` = listed, not automated
· `GAP` = blocked by a product gap · `N/A` = not testable end-to-end.

## React Admin

| # | Flow | Severity | Status | Harness |
|---|---|---|---|---|
| A1 | Login with valid Owner → dashboard | Critical | AUTO | Playwright |
| A2 | Login with invalid credentials → error message | High | DOC | Playwright |
| A3 | Logout → login screen, cache cleared | High | DOC | Playwright |
| A4 | Session revalidation via `/auth/me` | Medium | DOC | — |
| A5 | 401 → unauthorized cleanup | Medium | DOC | — |
| A6 | Cashier is blocked from Admin routes and cost prices | Critical | AUTO | Playwright |
| A7 | Manager blocked from Settings; Owner allowed | Critical | AUTO | Playwright |
| A8 | Dashboard KPIs load | Critical | AUTO | Playwright |
| A9 | Store switcher refetches scoped KPIs | Critical | AUTO | Playwright |
| A10 | Date presets (Today/7/30/All) | Medium | DOC | — |
| A11 | Dashboard refresh button | Low | DOC | — |
| A12 | Dashboard error state | Medium | DOC | — |
| A13 | Sales list scoped to store | Critical | AUTO | Playwright |
| A14 | Status filter | Medium | DOC | — |
| A15 | Receipt detail drawer | Critical | AUTO | Playwright |
| A16 | Refund with manager PIN | Critical | AUTO | Playwright |
| A17 | Refund validation (PIN/reason/qty) | High | DOC | — |
| A18 | Refund updates status/refunded qty | Critical | AUTO | Playwright |
| A19 | Sales pagination | Low | DOC | — |
| A20 | Product list/search | Critical | AUTO | Playwright |
| A21 | Create product | Critical | AUTO | Playwright |
| A22 | Edit product + integer price validation | High | DOC | — |
| A23 | Per-store price override | Critical | AUTO | Playwright |
| A24 | Clear price override | High | DOC | — |
| A25 | Inventory list scoped | Critical | AUTO | Playwright |
| A26 | Low/negative filters mutually exclusive | Medium | DOC | — |
| A27 | Adjust/restock stock | Critical | AUTO | Playwright |
| A28 | Reconcile negative stock | High | DOC | — |
| A29 | Inter-store transfer | Critical | AUTO | Playwright |
| A30 | Stock ledger view/filter | Medium | DOC | — |
| A31 | Server-side negative count | Low | DOC | — |
| A32 | Store config edit (name/address/tax) | High | DOC | — |
| A33 | Create staff with store assignments | High | DOC | — |
| A34 | Deactivate/activate staff | High | DOC | — |
| A35 | Staff store mapping display | Medium | DOC | — |

## Flutter POS

| # | Flow | Severity | Status | Harness |
|---|---|---|---|---|
| F1 | Login with valid cashier | Critical | AUTO | Patrol (web) |
| F2 | Invalid login | High | DOC | — |
| F3 | Offline demo session | Low | DOC | — |
| F4 | Logout clears PIN cache | High | DOC | — |
| F5 | Select store | Critical | AUTO | Patrol (web) |
| F6 | Change store | Medium | DOC | — |
| F7 | Open shift | Critical | AUTO | Patrol (web) |
| F8 | Close shift + variance | Critical | AUTO | Patrol (web) |
| F9 | No POS without an open shift | Critical | AUTO (route guard unit) | Flutter test |
| F10 | Shift syncs open/close to server | Critical | AUTO (asserted by API) | Flutter integration |
| F11 | Catalog is store-scoped | Critical | AUTO | Patrol (web) |
| F12 | Search by name | High | DOC | — |
| F13 | Barcode/SKU exact add | High | DOC | — |
| F14 | Add/increment/decrement/remove cart lines | Critical | AUTO | Patrol (web) |
| F15 | Item discount | High | DOC | — |
| F16 | Order discount | High | DOC | — |
| F17 | Price change from Admin appears after sync | Critical | AUTO | Patrol (web) |
| F18 | Out-of-stock/low-stock display | Medium | DOC | — |
| F19 | Cash sale | Critical | AUTO | Patrol (web) |
| F20 | QRIS / Card sale | High | DOC | — |
| F21 | Cash below total blocked | High | DOC | — |
| F22 | Empty cart blocked | High | DOC | — |
| F23 | Atomic local sale + outbox | Critical | AUTO (unit) | Flutter test |
| F24 | Sale syncs to server | Critical | AUTO | Patrol (web) |
| F25 | Sale complete dialog | Critical | AUTO | Patrol (web) |
| F26 | Refund from POS UI | Critical | **GAP** | — |
| F27 | Manager PIN online | Critical | DOC | — |
| F28 | Offline PIN grant | Medium | DOC | — |
| F29 | Refund restores stock/status locally | Critical | DOC | — |
| F30 | Refund syncs to server | Critical | DOC | — |
| F31 | Sync badge states | Medium | DOC | — |
| F32 | Manual sync | High | DOC | — |
| F33 | Retry failed outbox entries | High | DOC | — |
| F34 | Catalog/price/cart pull | Critical | AUTO | Patrol (web) |
| F35 | Offline → reconnect | High | DOC | — |

## Cross-application

| # | Flow | Severity | Status | Harness |
|---|---|---|---|---|
| X1 | POS sale appears in Admin sales and decrements stock | Critical | AUTO | API seed + Playwright |
| X2 | POS refund reflected in Admin status/stock | Critical | AUTO | API seed + Playwright |
| X3 | Admin price override reaches POS after sync | Critical | AUTO | Flutter integration (API setup) |
| X4 | Admin product create/deactivate reaches POS | High | DOC | — |
| X5 | Admin stock adjust/transfer reaches POS | High | DOC | — |
| X6 | Cashier cannot access Admin data | Critical | AUTO | Playwright |
| X7 | Multi-store isolation (reads/mutations) | Critical | DOC (covered by API e2e) | API |

## Not testable end-to-end

- Printer hardware / Bluetooth / cash drawer (not implemented).
- Real QRIS/card gateway (labels only, no provider).
- Native mobile UI (web only).
- Pixel-perfect canvas screenshots (Flutter renders to canvas).
- Full network-partition matrix (partially simulatable with Playwright
  `context.setOffline`; deferred).

## Known product gap blocking F26–F30

The POS has a `RefundScreen` at `/refund/:saleId`, but **no UI entry point
navigates to it** (the POS app bar, cart, and sale-complete dialog only offer
POS/shift/logout). Refunds are therefore unreachable in the browser UI.
Recommended fix: add a "Receipts" or "Refund last sale" action. Until then,
refund correctness is covered by the API e2e suite and Admin refund flow.

## Automation scope in this branch

**Playwright (React + cross-app):** A1, A6, A7, A8, A9, A13, A15, A16, A18,
A20, A21, A23, A25, A27, A29, X1, X2, X6.

**Patrol (Flutter web):** F1, F5, F7, F8, F10, F11, F14, F17, F19, F24,
F25, F34 (plus existing unit tests for F9/F23). Web video via `--web-video`;
slow motion via `--web-slow-mo`.

## Test data strategy

- Separate database `pos_e2e`, migrations + seed before the suite.
- Each spec creates unique SKUs/emails/receipts through the API.
- Serial execution (single worker) to avoid stock races.
- Cross-app specs seed sales/refunds through `POST /sync/push`; Admin then
  verifies the UI.
