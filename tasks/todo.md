# Task List: Cerita Page List Management (Incremental TDD & Hardened Defenses)

## Task 0: Foundation — Audit Actions & Rate Limiter

**Description:** Register new audit action definitions (`PAGE_CREATED`, `PAGE_DELETED`, `PAGE_REORDERED`) in `backend/src/services/audit.service.ts` with explicit severities (`info` for creation and reorder, `warning` for deletion). Export a dedicated user-keyed rate limiter `pagesWriteLimiter` (100 req/15min) in `backend/src/middlewares/rateLimit.middleware.ts` to prevent office-NAT lockouts.

**Acceptance criteria:**
- [x] `AUDIT_ACTIONS` defines `PAGE_CREATED`, `PAGE_DELETED`, and `PAGE_REORDERED` with fixed severities (`info`, `warning`, `info`).
- [x] `pagesWriteLimiter` keys on `user:${user.id}` for authenticated users and falls back to IP.
- [x] Existing audit and rate limiter tests pass without regression.

**Verification:**
- [x] Tests pass: `npx tsx --test src/__tests__/audit.service.test.ts`
- [ ] Linter passes: `npm run lint`

**Dependencies:** PR #59 (`feat/59-content-hierarchy`), PR #58 (`68823ac`)

**Files likely touched:**
- `backend/src/services/audit.service.ts`
- `backend/src/middlewares/rateLimit.middleware.ts`
- `backend/src/__tests__/audit.service.test.ts`

**Estimated scope:** Small (2-3 files)

---

## Checkpoint: Foundation
- [x] Audit actions and rate limiters tested and green.

---

## Task 1: Add Page (`POST /api/pages`) — TDD Edge Cases, XSS & TOCTOU (RED)

**Description:** Write failing unit tests for `POST /api/pages` covering security boundaries, XSS protection, TOCTOU races, and edge cases **before** writing the success path. Cover unauthenticated access (401), unauthorized role (403 for `user`), stored XSS in title (`<script>`, HTML tags, control characters), prototype pollution (`__proto__`), invalid slug regex, slug length > 100, backslashes (`\`), reserved slug keyword (`"reorder"`), slug TOCTOU race condition (trapping Prisma `P2002` to return 409 Conflict), and transaction rollback if the audit log insertion throws.

**Acceptance criteria:**
- [x] Test fails for 401 unauthenticated request and 403 regular `user` role.
- [x] Test fails for 400 on HTML tags in title (`/<[a-z][\s\S]*>/i`), control characters, or prototype pollution.
- [x] Test fails for 400 on empty title, invalid slug regex, backslashes, or reserved slug `"reorder"`.
- [x] Test fails for 409 on duplicate slug (including Prisma `P2002` concurrent insert race).
- [x] Test fails for transaction rollback when audit write fails (ensuring no orphan page inserted).

**Verification:**
- [x] Tests fail as expected (RED): `npx tsx --test src/__tests__/pages.service.test.ts src/__tests__/pages.controller.test.ts`

**Dependencies:** Task 0

**Files likely touched:**
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Small to Medium (3 test files)

---

## Task 2: Add Page (`POST /api/pages`) — TDD Happy Path & Implementation (GREEN & REFACTOR)

**Description:** Write the happy path test (201 Created with `{ page }`, explicit slug, auto-derived slug, auto-defaulted `sortOrder = max + 1`, and audit log written) then implement the minimal service logic in `createPage`, controller handler `createPageHandler`, and route wiring in `pages.routes.ts`. Implement input sanitization and P2002 conflict mapping.

**Acceptance criteria:**
- [x] `createPage` executes page creation and `page.created` audit log in a single transaction.
- [x] `createPageHandler` returns 201 with created `PageSummaryDTO` on success.
- [x] `POST /` route uses middleware chain: `apiLimiter` -> `verifyToken` -> `requireEditorOrAdmin` -> `pagesWriteLimiter`.
- [x] All tests from Task 1 and Task 2 pass (GREEN).

**Verification:**
- [x] Tests pass: `npx tsx --test src/__tests__/pages.*.test.ts`
- [x] Linter passes: `npm run lint`

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/services/pages.service.ts`
- `backend/src/controllers/pages.controller.ts`
- `backend/src/routes/pages.routes.ts`
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Medium (3-4 files)

---

## Checkpoint: Add Page Slice Complete
- [x] `POST /api/pages` slice fully tested and functional.
- [x] All previous read tests and new add-page tests pass.

---

## Task 3: Remove Page (`DELETE /api/pages/:slug`) — TDD Edge Cases, TOCTOU & Relational Restrictions (RED)

**Description:** Write failing unit tests for `DELETE /api/pages/:slug` covering failure modes, security boundaries, and relational integrity constraints **before** writing the success path. Cover unauthenticated access (401), unauthorized role (403), invalid slug format (400), non-existent page (404), relational conflict when sections have attached `content_blocks` (trapping Prisma `P2003` / MySQL errno 1451 `ON DELETE RESTRICT` to return 409 Conflict), and transaction rollback on audit write failure.

**Acceptance criteria:**
- [x] Test fails for 401 unauthenticated and 403 regular user.
- [x] Test fails for 400 on malformed slug.
- [x] Test fails for 404 when page does not exist.
- [x] Test fails for 409 Conflict when page contains sections with attached `content_blocks` (relational integrity / P2003).
- [x] Test fails for transaction rollback when audit log write fails.

**Verification:**
- [x] Tests fail as expected (RED): `npx tsx --test src/__tests__/pages.service.test.ts src/__tests__/pages.controller.test.ts src/__tests__/pages.routes.test.ts`

**Dependencies:** Task 2

**Files likely touched:**
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Small to Medium (3 test files)

---

## Task 4: Remove Page (`DELETE /api/pages/:slug`) — TDD Happy Path & Implementation (GREEN & REFACTOR)

**Description:** Write the happy path test (200 OK with `{ message, page }`, cascaded empty chapters/sections, and `page.deleted` warning audit log written), then implement `deletePage` in `pages.service.ts`, `deletePageHandler` in `pages.controller.ts`, and wire `DELETE /:slug` in `pages.routes.ts`. Refactor error catching so Prisma `P2003` foreign key restriction cleanly maps to 409 Conflict with an Indonesian message.

**Acceptance criteria:**
- [x] `deletePage` safely removes page, cascades empty chapters/sections, catches `P2003` to throw 409, and records `page.deleted` (severity: `warning`) in the transaction.
- [x] `deletePageHandler` returns 200 with deleted page info.
- [x] `DELETE /:slug` uses middleware chain: `apiLimiter` -> `verifyToken` -> `requireEditorOrAdmin` -> `pagesWriteLimiter`.
- [x] All tests from Task 3 and Task 4 pass (GREEN).

**Verification:**
- [x] Tests pass: `npx tsx --test src/__tests__/pages.*.test.ts`
- [x] Linter passes: `npm run lint`

**Dependencies:** Task 3

**Files likely touched:**
- `backend/src/services/pages.service.ts`
- `backend/src/controllers/pages.controller.ts`
- `backend/src/routes/pages.routes.ts`
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Medium (3-4 files)

---

## Checkpoint: Remove Page Slice Complete
- [x] `DELETE /api/pages/:slug` slice fully tested and functional.
- [x] Both Add and Remove slices pass all tests.

---

## Task 5: Reorder Pages (`PUT /api/pages/reorder`) — TDD Concurrency, Deadlocks & Edge Cases (RED)

**Description:** Write failing unit tests for `PUT /api/pages/reorder` covering failure modes, route collision/shadowing, deadlocks, and atomicity constraints **before** writing the success path. Cover route precedence (ensure `/reorder` does not match `GET /:slug`), unauthenticated (401), unauthorized (403), validation failures (empty array 400, non-array 400, duplicate IDs 400, negative/float sortOrder 400), non-existent page ID or concurrent deletion P2025 (404), deterministic lock ordering (`id` ascending) to eliminate InnoDB deadlocks (1213), no-op detection (same order returns 200 without DB updates or audit log), and single-transaction rollback (simulating failure on the N-th page or audit log ensuring 0 pages updated in DB).

**Acceptance criteria:**
- [x] Test fails for route shadowing (ensuring `/reorder` reaches reorder handler, not `/:slug`).
- [x] Test fails for 401 unauthenticated and 403 regular user.
- [x] Test fails for 400 on empty items, duplicate IDs, or negative/non-integer sortOrder.
- [x] Test fails for 404 when any page ID does not exist or vanishes concurrently (P2025).
- [x] Test fails for no-op detection (verifying unchanged order triggers 0 updates and 0 audit rows).
- [x] Test fails for transaction rollback when partial failure or audit failure occurs (proving atomicity).

**Verification:**
- [x] Tests fail as expected (RED): `npx tsx --test src/__tests__/pages.service.test.ts src/__tests__/pages.controller.test.ts src/__tests__/pages.routes.test.ts`

**Dependencies:** Task 4

**Files likely touched:**
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Small to Medium (3 test files)

---

## Task 6: Reorder Pages (`PUT /api/pages/reorder`) — TDD Happy Path & Implementation (GREEN & REFACTOR)

**Description:** Write the happy path test (200 OK with updated page list, verified DB sort orders, and `page.reordered` audit log), then implement `reorderPages` in `pages.service.ts` using a single `prisma.$transaction` with deterministic lock ordering (`id` asc) and no-op detection, implement `reorderPagesHandler` in `pages.controller.ts`, and mount `PUT /reorder` **before** `/:slug` in `pages.routes.ts`.

**Acceptance criteria:**
- [x] `reorderPages` updates all pages in deterministic ID order and writes `page.reordered` audit log inside a single transaction.
- [x] Detects no-op and returns immediately without DB writes or audit rows.
- [x] `PUT /reorder` is registered before `/:slug` routes to prevent Express route collision.
- [x] Route uses middleware chain: `apiLimiter` -> `verifyToken` -> `requireEditorOrAdmin` -> `pagesWriteLimiter`.
- [x] All tests from Task 5 and Task 6 pass (GREEN).

**Verification:**
- [x] Tests pass: `npx tsx --test src/__tests__/pages.*.test.ts`
- [x] Linter passes: `npm run lint`

**Dependencies:** Task 5

**Files likely touched:**
- `backend/src/services/pages.service.ts`
- `backend/src/controllers/pages.controller.ts`
- `backend/src/routes/pages.routes.ts`
- `backend/src/__tests__/pages.service.test.ts`
- `backend/src/__tests__/pages.controller.test.ts`
- `backend/src/__tests__/pages.routes.test.ts`

**Estimated scope:** Medium (3-4 files)

---

## Checkpoint: Reorder Pages Slice Complete
- [x] All three mutation endpoints (Add, Remove, Reorder) fully implemented and passing.
- [x] Concurrency, TOCTOU, XSS, and atomicity verified.

---

## Task 7: Documentation Synchronization & Full Quality Gates

**Description:** Document the page management endpoints, atomic transaction guarantees, and audit trail events in `docs/SPEC.md` §3 and §7. Update `AGENTS.md` to reflect the updated route, controller, and service responsibilities. Run full repository verification (all backend tests, type check, lint, format).

**Acceptance criteria:**
- [x] `docs/SPEC.md` §3 documents the endpoints, roles (Editor + Admin), and audit actions (`page.created`, `page.deleted`, `page.reordered`).
- [x] `AGENTS.md` lists the updated `pages.routes.ts`, `pages.controller.ts`, and `pages.service.ts` descriptions.
- [x] Full backend test suite (`npm test`) passes with 0 failures (468+ tests; achieved 680 passed).
- [x] `npm run lint` and `npm run format` complete cleanly.

**Verification:**
- [x] Full suite passes: `npm test`
- [x] Linter passes: `npm run lint`
- [x] Docs match implemented codebase.

**Dependencies:** Task 6

**Files likely touched:**
- `docs/SPEC.md`
- `AGENTS.md`

**Estimated scope:** Small (2 files)

---

## Checkpoint: Final Review & Quality Gates
- [x] All increments complete.
- [x] Zero code smells, zero regressions, hardened against TOCTOU and XSS.
- [x] Ready for pull request.
