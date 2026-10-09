# Implementation Plan: Cerita Page List Management (Incremental TDD with Concurrency & Security Hardening)

**Spec:** §3 (Editor: manage the Cerita page list) · **Size:** M  
**Dependencies:** PR #59 (`feat/59-content-hierarchy`), Editor role from PR #58 (`requireEditorOrAdmin`).  
**Methodology:** Incremental Vertical Slices with **Test-Driven Development (TDD) — Happy Path Last**.

---

## 1. Overview & Threat/Concurrency Model

This plan provides the complete backend service, controller, routes, audit logging, and documentation for managing the Cerita page list in SIDATA (`POST /api/pages`, `DELETE /api/pages/:slug`, `PUT /api/pages/reorder`).

Because SIDATA is a public statistical portal deployed in an administrative setting (multi-editor environment, office NAT IP), this implementation explicitly hardens against:
1. **TOCTOU & Race Conditions** (concurrent slug creation, concurrent reorder deadlocks, concurrent delete vs content block attachment).
2. **XSS & Injection Attacks** (stored XSS in page titles, path traversal/protocol-relative attacks in slugs, prototype pollution).
3. **Office NAT IP Lockout** (rate-limiter exhaustion across staff).
4. **Transaction Atomicity & Rollback Integrity** (audit logging inside the same transaction; no unlogged mutations or phantom logs).

---

## 2. Hardened Architecture Decisions

### Decision 1: Concurrency, TOCTOU & Deadlock Defenses
1. **Slug Uniqueness TOCTOU (P2002 Race):**
   - In addition to application-level checks, `createPage` explicitly traps Prisma `P2002` (`Unique constraint failed on the fields: (slug)`) and maps it to `409 Conflict` (`Slug halaman sudah digunakan`).
2. **Relational Integrity TOCTOU (P2003 Race on Delete):**
   - Even if application checks verify no attached content blocks prior to deletion, a concurrent request could attach a block before `tx.page.delete` runs. The `sections.id` foreign key on `content_blocks` has `ON DELETE RESTRICT`. `deletePage` catches Prisma `P2003` (foreign key restriction error) and MySQL errno `1451`, returning a clean `409 Conflict` (`Halaman tidak dapat dihapus karena masih memiliki data terkait (blok konten)`).
3. **Deterministic Lock Ordering in Reorder (InnoDB Deadlock Elimination):**
   - When concurrent requests reorder pages (e.g. Thread A updates [1, 2] and Thread B updates [2, 1]), updating rows in arbitrary order causes InnoDB lock deadlocks (errno `1213` / Prisma `P2034`).
   - **Mitigation:** In `reorderPages`, updates inside `tx` are **strictly sorted by page `id` ascending** before executing. Deterministic lock acquisition order mathematically prevents cyclic lock deadlocks.
4. **Concurrent Reorder & Delete (P2025 Missing Record Race):**
   - If a page is deleted during a reorder transaction, `tx.page.update` throws `P2025` (Record to update not found). `reorderPages` catches `P2025` and rolls back with `404 Not Found` (`Satu atau lebih halaman telah dihapus atau tidak ditemukan`).
5. **No-Op Reorder Detection:**
   - If all submitted sort orders match the existing database state, `reorderPages` treats it as a **no-op**: returns current state with `200 OK` without triggering useless DB writes or false-positive audit logs (matching the repository's comparator standard).

### Decision 2: XSS, Slug Traversal & Input Sanitization
1. **Stored XSS Prevention in `title`:**
   - Reject HTML markup (`/<[a-z][\s\S]*>/i` or `<` / `>` characters) with `400 Bad Request` (`Judul halaman tidak boleh mengandung tag HTML`).
   - Reject control characters (`[\x00-\x1F\x7F]`).
   - Enforce trimmed length 1–255 characters.
2. **Strict Slug & Route Collision Defense:**
   - Strictly validate `slug` against `PAGE_SLUG_PATTERN`: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
   - Reject backslashes (`\`) and URL-encoded backslashes (`%5c`).
   - Reject reserved route keywords (`RESERVED_SLUGS = new Set(['reorder', 'api', 'admin', 'auth', 'settings', 'public', 'health', 'null', 'undefined'])`) with `400 Bad Request` (`Slug halaman menggunakan kata kunci terproteksi`).
   - In [pages.routes.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/routes/pages.routes.ts), mount `PUT /reorder` **before** `/:slug` routes to eliminate Express parameter shadowing.
3. **Prototype Pollution & Strict Schemas:**
   - Reject payloads containing `__proto__`, `constructor`, or `prototype`.
   - Apply `.strict()` on Zod schemas to reject unrecognized fields.

### Decision 3: Office NAT Rate Limiting Stack
- To prevent office staff sharing an IP from exhausting write quotas:
  1. `apiLimiter` (IP-based pre-auth DoS defense).
  2. `verifyToken` (JWT authentication).
  3. `requireEditorOrAdmin` (Role authorization).
  4. `pagesWriteLimiter` (dedicated 100 req/15min bucket keyed on `user:${user.id}`).
  5. Controller handler.

### Decision 4: Audit Trail Standards
- Action definitions in [AUDIT_ACTIONS](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/services/audit.service.ts#L32):
  - `PAGE_CREATED`: `defineAction('page.created', 'info')`
  - `PAGE_DELETED`: `defineAction('page.deleted', 'warning')` (destructive action)
  - `PAGE_REORDERED`: `defineAction('page.reordered', 'info')`
- All audit writes executed inside the mutation transaction via `buildAuditLog(..., tx)` to guarantee no unlogged mutations or phantom logs.

---

## 3. Incremental Implementation Slices

### Increment 0: Foundation (Audit Actions & Rate Limiting)
- **Goal:** Provide shared audit constants and isolated write rate limiter without affecting existing functionality.
- **TDD Steps:**
  1. Write test in `backend/src/__tests__/audit.service.test.ts` verifying `AUDIT_ACTIONS.PAGE_CREATED`, `PAGE_DELETED`, and `PAGE_REORDERED` have fixed severities (`info`, `warning`, `info`).
  2. Add actions to `AUDIT_ACTIONS` in [audit.service.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/services/audit.service.ts).
  3. Add and export `pagesWriteLimiter` (`createUserKeyedLimiter(100)`) in [rateLimit.middleware.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/middlewares/rateLimit.middleware.ts).
- **Verification:** `npm test src/__tests__/audit.service.test.ts` passes.

---

### Increment 1: Vertical Slice — Add Cerita Page (`POST /api/pages`)
- **Goal:** Allow Editors and Admins to add a new Cerita page with XSS, TOCTOU, and rollback protection.
- **TDD Steps (Happy Path Last):**
  1. **RED (Auth & Role Guard):** Test `POST /api/pages` returns 401 unauthenticated, 403 for `user` role.
  2. **RED (XSS & Control Character Validation):** Test returns 400 when `title` contains HTML tags (`<script>`, `<b>`), control characters, or prototype-polluting keys (`__proto__`).
  3. **RED (Slug Validation & Reserved Keywords):** Test returns 400 for empty body, whitespace title, title > 255 chars, invalid slug format, backslashes, and reserved slug `"reorder"`.
  4. **RED (TOCTOU & Slug Conflict):** Test returns 409 if page with `slug` already exists; test catching Prisma `P2002` race condition returns 409 cleanly without 500.
  5. **RED (Atomicity & Rollback):** Test transaction rolls back and no page is inserted if audit log write throws an error.
  6. **RED (Happy Path):** Test returns 201 Created with `{ page }` when valid payload provided; verify explicit `slug`, auto-derived slug from `title`, auto-assigned `sortOrder = max + 1`, and audit log recorded.
  7. **GREEN:** Implement `createPage` in [pages.service.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/services/pages.service.ts), `createPageHandler` in [pages.controller.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/controllers/pages.controller.ts), and wire `POST /` route in [pages.routes.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/routes/pages.routes.ts).
  8. **REFACTOR:** Clean up validation helpers and sanitize inputs.
- **Verification:** Focused test `npx tsx --test src/__tests__/pages.*.test.ts` passes.

---

### Increment 2: Vertical Slice — Remove Cerita Page (`DELETE /api/pages/:slug`)
- **Goal:** Allow Editors and Admins to delete a Cerita page safely with foreign key restriction and TOCTOU protection.
- **TDD Steps (Happy Path Last):**
  1. **RED (Auth & Role Guard):** Test `DELETE /api/pages/:slug` returns 401 unauthenticated, 403 for `user` role.
  2. **RED (Validation & Not Found):** Test returns 400 for invalid slug syntax; returns 404 if page does not exist.
  3. **RED (Relational Integrity Conflict & P2003 Catch):** Test returns 409 Conflict when the page has sections with attached `content_blocks` (trapping Prisma `P2003` / MySQL errno 1451).
  4. **RED (Atomicity & Rollback):** Test transaction rolls back and page is not deleted if audit log write fails.
  5. **RED (Happy Path):** Test returns 200 OK with `{ message, page }` on successful deletion of empty page; verifies MySQL cascades empty chapters/sections, and audit log `page.deleted` (severity: `warning`) is written.
  6. **GREEN:** Implement `deletePage` in [pages.service.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/services/pages.service.ts), `deletePageHandler` in [pages.controller.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/controllers/pages.controller.ts), and wire `DELETE /:slug` in [pages.routes.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/routes/pages.routes.ts).
  7. **REFACTOR:** Ensure clean error mapping and explicit Indonesian error message for 409.
- **Verification:** Focused test `npx tsx --test src/__tests__/pages.*.test.ts` passes.

---

### Increment 3: Vertical Slice — Reorder Cerita Pages (`PUT /api/pages/reorder`)
- **Goal:** Allow Editors and Admins to reorder pages atomically with deadlock prevention, TOCTOU handling, and no-op detection.
- **TDD Steps (Happy Path Last):**
  1. **RED (Route Shadowing & Auth):** Test `PUT /reorder` does NOT get shadowed by `/:slug`; returns 401 unauthenticated, 403 for `user` role.
  2. **RED (Validation & Boundaries):** Test returns 400 for empty array, non-array payload, duplicate page IDs, non-integer `sortOrder`, or negative `sortOrder`.
  3. **RED (Not Found & P2025 Concurrency):** Test returns 404 if any referenced page ID does not exist in the database or if a page vanishes concurrently during update (P2025).
  4. **RED (Deterministic Lock Ordering & Deadlock Elimination):** Test that row updates inside the transaction execute in deterministic order (`id` ascending) to prevent InnoDB deadlocks (errno 1213).
  5. **RED (No-Op Detection):** Test that submitting the exact same order does not trigger DB updates or audit log creation, returning 200 immediately.
  6. **RED (Transaction Atomicity & Rollback):** Test single transaction behavior — if any page update fails OR audit write throws, NO pages have their sortOrder changed in the database.
  7. **RED (Happy Path):** Test returns 200 OK with updated pages array; verifies all pages have new `sortOrder` values in DB, and `page.reordered` audit log is recorded.
  8. **GREEN:** Implement `reorderPages` in [pages.service.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/services/pages.service.ts), `reorderPagesHandler` in [pages.controller.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/controllers/pages.controller.ts), and mount `PUT /reorder` **before** `/:slug` in [pages.routes.ts](file:///home/perhanjay/Documents/Programming/SIDATA/backend/src/routes/pages.routes.ts).
  9. **REFACTOR:** Optimize database update batching within the transaction.
- **Verification:** Focused test `npx tsx --test src/__tests__/pages.*.test.ts` passes.

---

### Increment 4: Documentation & Full Quality Gates
- **Goal:** Keep documentation in sync and verify zero regressions across the entire repository.
- **Steps:**
  1. Update [docs/SPEC.md](file:///home/perhanjay/Documents/Programming/SIDATA/docs/SPEC.md) §3 and §7 with endpoint specs, atomic reorder transaction rule, and audit log actions.
  2. Update [AGENTS.md](file:///home/perhanjay/Documents/Programming/SIDATA/AGENTS.md) with updated route, controller, and service descriptions.
  3. Run full test suite: `npm test` in `backend/` (all 468+ tests must pass).
  4. Run linter and formatting checks: `npm run lint` and `npm run format`.
- **Verification:** 100% green tests, 0 lint warnings, clean git diff.

---

## 4. Concurrency & Security Threat Matrix

| Threat / Risk | Impact | Concrete Mitigation |
|---|---|---|
| **TOCTOU on Slug (P2002)** | Medium | Catch Prisma `P2002` on insert and return `409 Conflict`. |
| **TOCTOU on Delete (P2003)** | Medium | Rely on DB `ON DELETE RESTRICT` and catch `P2003` to return `409 Conflict`. |
| **Deadlock on Reorder (1213)** | High | Deterministically sort updates by `id` ascending before executing in `tx`. |
| **Record Vanishing Race (P2025)**| Medium | Catch `P2025` inside reorder transaction and return `404 Not Found`. |
| **Stored XSS in Title** | High | Reject `<script>`, `<b>`, and HTML tags with `400 Bad Request`. |
| **Path Traversal / Open Redirect** | High | Strictly enforce `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, reject backslashes, block reserved words. |
| **Route Shadowing (`/reorder`)** | High | Mount `/reorder` before `/:slug` in Express; disallow `"reorder"` as a page slug. |
| **Office NAT Rate Limit Lockout** | Medium | User-keyed `pagesWriteLimiter` (`user:${user.id}`) placed after `verifyToken`. |
| **Audit Log Decoupling** | Critical | Wrap `buildAuditLog` in the exact same `tx` as mutations; failure rolls back DB. |
