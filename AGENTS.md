# AGENTS.md

This file provides guidance to Claude Code, Google Antigravity, GitHub Copilot, Jetbrains AI, Junie, Codex, and other agents that support AGENTS.md when working with code in this repository.

- Read [`docs/SPEC.md`](docs/SPEC.md) before changing product behavior (roles, content model, data entry, schema, pages, wording rules). It is not auto-loaded.
- Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) to find where code lives.

## Setup

**Always use `npm ci` instead of `npm install`** — this ensures lockfile-locked versions. Work from `frontend/` or `backend/`. First-run steps and common errors are in the README (Quick Start, Troubleshooting).

- Backend env lives in the **root `.env`** (copy `.env.example`). The server validates required variables at boot and fails fast if any is missing **or empty**. `PORT` defaults to 3000.
- The frontend reads its own `frontend/.env` (template: `frontend/.env.example`) when run outside Docker; under Compose it takes `VITE_*` values from the root `.env`.
- The Prisma CLI reads `DATABASE_URL` from the shell or `backend/.env`, not the root `.env`: source it first (`set -a && . ../.env && set +a`). `DATABASE_URL` host is `mysql` under Compose, `localhost` otherwise.
- Keep `OAUTH_STATE_TTL_SECONDS` and `OAUTH_PKCE_TTL_SECONDS` equal (default 300): a shorter state TTL causes false `critical` `AUTH_OAUTH_STATE_MISMATCH` audit logs.
- Set `TRUST_PROXY` behind any reverse proxy, or `req.ip` (audit rows, rate limiters, CSRF session key) resolves to the proxy.
- `AUDIT_ADMIN_DATABASE_URL` is a privileged connection used only by `backend/scripts/`, never by the running server.

## Database

DB engine is **MySQL**, full stop — but you'll correctly see @prisma/adapter-mariadb in code, since that's Prisma 7's single driver adapter for both engines. Don't 'correct' it.

Deploy target: Docker on a self-managed VPS (may change pending stakeholder input — this affects hosting, not the DB engine choice, which is settled independently).


## Commands

| Task                    | Frontend (`frontend/`) | Backend (`backend/`)                                     |
| ----------------------- | ---------------------- | -------------------------------------------------------- |
| Dev server / run        | `npm run dev` (:5173)  | `npx tsx src/index.ts` (:3000)                           |
| Unit tests              | `npm run test:unit`    | `npm test` (`npm run test:coverage` for coverage)        |
| Lint (fix)              | `npm run lint`         | `npm run lint`                                           |
| Format                  | `npm run format`       | `npm run format`                                         |
| Type-check / build      | `npm run type-check` / `npm run build` | —                                        |
| Seed dev admin          | —                      | `npm run dev:seed`                                       |
| Seed indicators         | —                      | `npm run seed:indicator`                                 |
| Cleanup sample RT data  | —                      | `npm run dev:cleanup-sample-rt`                          |
| Clean stale media       | —                      | `npm run media:cleanup`                                  |

Integration tests (need Docker): `docker compose -f docker-compose.test.yml run --rm backend-integration` from the repo root. Full stack: `docker compose up --build`. The Prisma client is generated to `backend/generated/prisma/` (do not edit; `npx prisma generate`).

## Git Conventions

**Commit atomically** — each commit should represent one logical, self-contained change (a single fix, feature, or refactor) that leaves the repo in a working state. Avoid bundling unrelated changes into one commit; split them into separate commits instead.

**Never develop directly on `main`** — always create a feature/fix/docs/chore branch and open a PR. `main` should only receive changes via merged PRs.

**Never commit or push production data** — real production data (including names, phone numbers, addresses, coordinates, user records, exports, database dumps, and credentials) must never be committed or pushed to GitHub under any circumstance unless the repository owner explicitly instructs it. Use synthetic data for development and tests; production data enters at runtime through the CMS, CSV import, or deployment environment, never through the repository.

**Keep documentation in sync** — whenever a change affects setup, commands, architecture, env vars, or workflows, update the relevant docs (README.md, CONTRIBUTING.md, SECURITY.md, docs/ARCHITECTURE.md, this file) in the same PR rather than leaving them stale.

**Keep the spec in sync** — whenever a change settles or revises a product/domain decision (page structure, content model, roles, data-entry rules, schema design intent, scope), update `docs/SPEC.md` in the same PR. Record the decision and the rule it implies, not the deliberation behind it — rationale for settled questions is context every future session pays for. Unresolved questions belong in SPEC.md §10 and nowhere else.

**Ground public content in source material** — before writing or changing factual website copy, read [`docs/CONTENT_SOURCES.md`](docs/CONTENT_SOURCES.md) and verify claims against the cited files in the Google Drive `Descan Manggar 2026` folder. Preserve data/fieldwork periods, cite source pages/tables, and keep unresolved source conflicts in `docs/SPEC.md` §10.

**Accessibility** — frontend markup MUST use semantic HTML and SHOULD conform to WCAG 2.1 Level A. See `docs/ACCESSIBILITY.md` for the concrete rules; apply them while writing a component, not as a retrofit.

**Frontend error messages** — operators see the backend sentence only for 400/422, filtered by `readableServerMessage` in `frontend/src/utils/userMessages.ts`. Backend sentences that name API fields must be added to `HIDDEN_API_TOKENS` there, and new backend 400 messages shown to operators should be plain Indonesian (no field names, no zod/English defaults).

**Admin error banners** — render load/save failures with `components/common/AlertBanner.vue` and pass the store's `errorKind` as `kind`; never hand-roll a banner or use `window.alert`. Expired tokens are `401` on the backend (never `403`) so `apiFetch` can refresh silently.


## Architecture essentials

The file-by-file map is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The rules below are the ones not obvious from the code.

**Frontend**

- Vue 3 `<script setup>` SFCs; `@` aliases `src/`; Tailwind via the Vite plugin; Oxlint + ESLint + Prettier.
- `layouts/PublicLayout.vue` owns the skip link, navbar, the single `<main id="main-content">` and the footer. Public views must not render their own. Admin routes mount inside `layouts/AdminLayout.vue`.
- `config/adminNav.ts` is the single role-to-items source for the admin sidebar **and** the router guards; change access there, not in two places.
- Media previews need the `Authorization` header: load them with `apiFetch` and display a blob URL, never a bare `<img src>`. `contentBlocks.store` `editableBlocks` excludes `figure` blocks (managed only in `/admin/cerita`).

**Backend**

- Layering: route → thin controller → service. Put non-trivial logic (external calls, caching, transforms) in `src/services/`. Mount a new resource's router in `src/app.ts`.
- Every mutation writes its `audit_logs` row in the same transaction (see Audit Trail).
- CSRF is global: fetch a token from `GET /api/auth/csrf-token` and send it as `x-csrf-token` on mutating requests.
- Unit tests live in `src/__tests__/` (Node test runner via `tsx`). Integration tests under `tests/integration/` need a real MySQL.

#### Audit Trail

Every admin user-management action and security-relevant auth event writes an `audit_logs` row (see `docs/SPEC.md` §3 for the product-level rules — severity levels, retention policy, what must never appear in `metadata`). Two things make this more than "just another table":

- **Tamper defense is two layers.** Layer 1 is app-level: the Prisma client singleton in `src/utils/prisma.ts` is `$extends`-wrapped so `auditLog.update`/`.delete`/`.deleteMany`/`.upsert` throw unless the write touches only `acknowledgedAt`/`acknowledgedById` (logic in `src/utils/auditLogGuard.ts`). This is a guardrail against careless app code, not a security boundary. Layer 2 is the one that actually holds: `backend/scripts/grants/audit-logs-grants.sql` strips the app's runtime DB user down to `SELECT`, `INSERT`, and column-scoped `UPDATE` on `audit_logs` — no `DELETE`, no unrestricted `UPDATE` — via MySQL grants. **Run that script once per environment**, or the app's DB user retains its default full rights on the table and layer 2 is absent.
- **Retention pruning runs outside the app.** `backend/scripts/prune-audit-logs.ts` connects with `AUDIT_ADMIN_DATABASE_URL` — a separate, privileged DB connection, never the app's — because deleting rows is exactly what layer 2 just took away from the app user. Run it on a schedule: the opt-in `audit-pruner` Compose sidecar (`docker compose --profile ops up -d --build audit-pruner`, schedule via `AUDIT_PRUNE_SCHEDULE`) or a host cron entry — see the Deployment checklist in `docs/DEPLOYMENT.md`, which also covers applying the grants script once per environment. It reads the per-severity retention settings (`GET`/`PATCH /api/settings/audit-retention`, admin-only), never prunes an unacknowledged `critical` row regardless of age, and writes its own `audit.pruned` summary row.

#### Media Storage

Uploads (photos, PDF/DOCX documents, XLSX/CSV data) share one service; see `docs/SPEC.md` §7 for the
product rules. Things to know when touching it:

- **Layout under `UPLOAD_DIR`**: `photos/<purpose>/<ownerKey>/<assetId>.webp`,
  `documents/<purpose>/<ownerKey>/<assetId>.<ext>`, `derivatives/<assetId>/thumbnail.webp`, `_staging/`.
  `purpose` comes from the server-side allowlist in `mediaPolicy.ts`; `ownerKey` is chosen by the server
  (fixed key for singletons, the uploader's user id otherwise). A client-supplied filename, title or slug
  never reaches a path.
- **Validation is by file signature**, not extension or client MIME. Limits live in `mediaPolicy.ts` only.
- **Serving** resolves `storage_key` under the canonical upload root with a realpath containment check and
  derives `Content-Type` from the stored extension. Public routes return 404 unless `attached_at` is set.
- **Editor preview contract**: `previewUrl` in the upload response is an API *path* (`/api/media/<id>/preview`),
  not a browser-loadable URL. The route needs an `Authorization: Bearer` header, so the CMS must fetch it with
  the authenticated API client (`apiFetch`) and display a blob URL (`URL.createObjectURL`); a bare `<img src>`
  or `<a href>` gets 401. Decision: no signed URLs. Public pages use `/api/media/<id>` and `/download`.
- **Content PRs** attach media inside their own transaction with `attachMedia(tx, ids, { purpose })` and
  call `detachMedia` when a reference is removed. Do not set `attached_at`/`detached_at` any other way:
  `detachMedia` stamps `detached_at`, `attachMedia` clears it, and cleanup ages an unattached asset from
  `COALESCE(detached_at, created_at)` so a swapped-out old asset keeps a full grace period.
  Section figures (`sectionFigure.service.ts`) are the first caller: reference
  `{ type: 'content_block', id: <figure block id>, slot: 'figure' }`, purpose `cerita`, with the affected
  assets locked in ascending id order up front so two figures swapping shared photos cannot deadlock.
- **New table grants**: `media_assets` is in `scripts/grants/audit-logs-grants.sql`.
- **Cleanup removes files before the row** (a failed delete keeps the row for the next run) and re-verifies `attached_at IS NULL` before touching files; see `mediaCleanup.service.ts` for the documented residual window.
- **Run `npm run media:cleanup` on a schedule** (see docs/DEPLOYMENT.md) or abandoned uploads accumulate.

## Common Workflows

**Database schema changes**: edit `backend/prisma/schema.prisma`, then run `npx prisma migrate dev` (needs a shadow database; see README Troubleshooting). If the migration adds a table, also add its `GRANT` line to `backend/scripts/grants/audit-logs-grants.sql`: that script replaces the app user's blanket db-level grant with per-table grants, so a table missing from it becomes inaccessible to the app once the script is (re-)applied.

**Before committing**: `npm run lint` fixes ESLint and Prettier in one pass; `npm run type-check` (frontend) gives full TypeScript diagnostics before `npm run build`.
