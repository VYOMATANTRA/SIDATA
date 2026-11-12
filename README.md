# SIDATA

[![CI](https://github.com/VYOMATANTRA/SIDATA/actions/workflows/ci.yml/badge.svg)](https://github.com/VYOMATANTRA/SIDATA/actions/workflows/ci.yml)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Pinia](https://img.shields.io/badge/Pinia-4-FFDD67?logo=pinia&logoColor=black)](https://pinia.vuejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%5E22.18.0%20%7C%7C%20%3E%3D24.12.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Full-stack TypeScript web application with a Vue 3 frontend and an Express + Prisma backend backed by MySQL.

## Tech Stack

| Layer    | Tech                                         | Version                                                                              |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Frontend | Vue 3, Vue Router, Pinia, Tailwind CSS, Vite | Vue `^3.5.40`, Vue Router `^5.2.0`, Pinia `^4.0.2`, Tailwind `^4.3.3`, Vite `^8.1.5` |
| Backend  | Express.js, Prisma ORM                       | Express `^5.2.1`, Prisma `^7.9.0`                                                    |
| Database | MySQL                                        | `8.4` (see `docker-compose.yml`)                                                     |
| Language | TypeScript                                   | Frontend `~6.0.0`, Backend `^5.7.3`                                                  |
| Node     | —                                            | `^22.18.0` or `>=24.12.0`                                                            |

## Prerequisites

- Node.js `^22.18.0` or `>=24.12.0`
- MySQL `8.4` (or use the provided Docker service)
- Docker + Docker Compose (optional, for containerized setup)

## Getting Started

> **Always use `npm ci`, not `npm install`** — this ensures lockfile-locked versions.

### 1. Clone and install

```bash
git clone git@github.com:VYOMATANTRA/SIDATA.git
cd SIDATA
```

### 2. Backend setup

Copy `.env.example` to `.env` at the root of the repository:

```bash
cp .env.example .env
```

> **Note for local (non-Docker) runs**: `.env.example` defaults `DATABASE_URL` to host `mysql` for Docker Compose. When running MySQL directly on your machine or connecting to a local instance, update `DATABASE_URL` in `.env` to use `localhost` (e.g. `mysql://sidata:changeme@localhost:3306/sidata` or with your local MySQL credentials).

Install backend dependencies:

```bash
cd backend
npm ci
```

Fill in `.env` with at least:

| Variable                        | Description                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | MySQL connection string, e.g. `mysql://root:password@localhost:3306/sidata` (swap host `mysql` to `localhost` for local runs) |
| `JWT_SECRET`                    | Secret used to sign access tokens                                                                                             |
| `JWT_REFRESH_SECRET`            | Secret used to sign refresh tokens                                                                                            |
| `CSRF_SECRET`                   | Secret used to sign CSRF tokens and cookies                                                                                   |
| `COOKIE_ENCRYPTION_KEY`         | Secret used to encrypt temporary OAuth state and verifier cookies                                                             |
| `CORS_ORIGIN`                   | Frontend origin allowed to make credentialed requests, e.g. `http://localhost:5173`                                           |
| `GOOGLE_CLIENT_ID`              | Google OAuth2 Client ID                                                                                                       |
| `GOOGLE_CLIENT_SECRET`          | Google OAuth2 Client Secret                                                                                                   |
| `GOOGLE_CALLBACK_URL`           | Google OAuth2 Callback URL, e.g. `http://localhost:3000/api/auth/google/callback`                                             |
| `GOOGLE_OAUTH_SUCCESS_REDIRECT` | Frontend URL for successful OAuth redirect, e.g. `http://localhost:5173/auth/callback`                                        |
| `GOOGLE_OAUTH_FAILURE_REDIRECT` | Frontend URL for failed OAuth redirect, e.g. `http://localhost:5173/login?error=oauth_failed`                                 |
| `OAUTH_STATE_TTL_SECONDS`       | _(optional)_ TTL for the temporary `oauth_state` cookie, defaults to `300`                                                    |
| `OAUTH_PKCE_TTL_SECONDS`        | _(optional)_ TTL for the temporary `oauth_verifier` cookie, defaults to `300`                                                 |
| `TURNSTILE_SECRET`              | Cloudflare Turnstile anti-bot secret key (`1x0000000000000000000000000000000AA` for local testing)                            |
| `RESEND_API_KEY`                | Resend API key for transactional emails                                                                                       |
| `EMAIL_FROM`                    | Sender identity for transactional emails, e.g. `"SIDATA Kelurahan Manggar <onboarding@resend.dev>"`                           |
| `PORT`                          | _(optional)_ Backend port, defaults to `3000`                                                                                 |

The server validates required variables at boot and fails fast if any are missing. Optional variables fall back to documented defaults.

In non-production environments, `npx prisma db seed` loads synthetic RT leaders and delegates
recognized legacy-sample cleanup to the same transactional service used by the maintenance CLI.
The cleanup is fingerprint-limited, preserves edited rows, and writes a count-only warning audit
record in the same transaction when it changes data. For a manual cleanup, run
`npm run dev:cleanup-sample-rt` from `backend/`; production requires the explicit `--force` flag.
The public Ketua RT page refreshes its roster and `isSampleRoster` notice every 60 seconds while
visible, keeping the last successful roster displayed if a refresh fails.

The auth API issues CSRF tokens from `GET /api/auth/csrf-token`. Include the returned token in the `x-csrf-token` header on mutating auth requests.

Apply the Prisma schema and seed default roles:

```bash
npx prisma migrate dev
npx prisma db seed
```

Run the backend:

```bash
npx tsx src/index.ts
```

### 3. Frontend setup

```bash
cd frontend
npm ci
npm run dev
```

The dev server runs on `http://localhost:5173` by default.

### Docker (alternative)

From the repo root, with a `.env` copied from `.env.example` and filled in (Compose passes the
MySQL credentials, backend env vars, and `VITE_API_URL_DOCKER`/`VITE_TURNSTILE_SITE_KEY` through
to the containers — see `docker-compose.yml`):

```bash
cp .env.example .env
docker compose up --build
```

Uploaded media is bind-mounted from `UPLOADS_HOST_DIR` (default `./uploads`, git-ignored) into the
backend container at `/var/lib/sidata/uploads` (`UPLOAD_DIR`), so it survives rebuilds. Outside Docker,
`UPLOAD_DIR` is optional and defaults to `<repo-root>/uploads`.

## Deployment

Checklist for a new environment (Docker on a VPS). Background: [`AGENTS.md`](AGENTS.md) "Audit Trail",
[`SECURITY.md`](SECURITY.md).

1. Create a second, privileged MySQL user (full rights on the database) and set
   `AUDIT_ADMIN_DATABASE_URL` to it. This is separate from `DATABASE_URL`, the app's runtime user.
2. Run migrations as the privileged user. Under Compose:
   `docker compose --profile ops run --rm --build audit-pruner npx prisma migrate deploy`; outside Compose:
   `DATABASE_URL="$AUDIT_ADMIN_DATABASE_URL" npx prisma migrate deploy` (from `backend/`).
   Also set `RUN_MIGRATIONS=0` for the `backend` service from here on — it runs `migrate deploy` at
   start by default, which the restricted app user can no longer do after step 3.
3. **Apply the audit-log grants once per environment.** Substitute `<APP_DB_USER>`, `<APP_DB_HOST>`
   and `<DB_NAME>` in `backend/scripts/grants/audit-logs-grants.sql`, run it as a MySQL user with
   `GRANT` privileges (e.g. root) with no database preselected (the script runs its own
   ``USE `<DB_NAME>` ``; e.g. `mysql -u root -p < grants.sql` on the substituted copy), then run the
   verification queries at the bottom of the file. It revokes the db-level grant by exact name
   (and GRANT OPTION). Wildcard grants such as `sidata%`.* and server-wide grants such as
   `DELETE ON *.*` (or an extra table-level grant on `audit_logs`) are a different scope the
   script does not touch: it ends with a check that stops with an error naming any such grant
   still held by the app user — revoke that one manually and re-run.
   Skipping this leaves the app user with full rights on `audit_logs` (no tamper defense layer 2).
   Re-apply it after any migration that adds a table.
4. Schedule retention pruning, using either:
   - the Compose sidecar (it has no bind mount, so pass `--build` after every `git pull` or it runs the
     previously built image): `docker compose --profile ops up -d --build audit-pruner` (schedule from
     `AUDIT_PRUNE_SCHEDULE`, default daily at 03:00), or
   - host cron, from `backend/`:
     `0 3 * * * cd /path/to/SIDATA/backend && npx tsx scripts/prune-audit-logs.ts >> /var/log/sidata-prune.log 2>&1`
     (needs `AUDIT_ADMIN_DATABASE_URL` and the other required backend variables in the root `.env`, and `npx` on cron's `PATH`).
5. If behind a reverse proxy, set `TRUST_PROXY`.
6. **Media uploads (`media_assets` + `UPLOAD_DIR`).**
   - Apply the grants script (step 3) again after the migration that adds `media_assets`; it already
     contains that table's line. The later `add_media_assets_detached_at` migration only adds a column,
     so it needs no grants change.
   - Create the host directory for the bind mount (`UPLOADS_HOST_DIR`, default `./uploads`) and make it
     writable by the user the backend runs as (the dev image runs as root). The server creates the
     `_staging/`, `photos/`, `documents/` and `derivatives/` subdirectories itself and checks `UPLOAD_DIR` at boot. If it is unwritable or inside `backend/` or `frontend/`, the server
     still starts but logs a loud `WARNING: media storage is NOT usable` block; uploads and media delivery
     answer 503 `MEDIA_STORAGE_UNAVAILABLE` (no path in the body) while everything else keeps serving, and
     media recovers on its own (no restart) once the directory is fixed. Watch the boot log for that warning.
   - The editor preview route (`/api/media/<id>/preview`) needs the `Authorization` header; the CMS loads it
     with the authenticated API client and a blob URL, so the proxy must pass that header through.
   - **Back up the uploads directory and the `media_assets` table together**, from the same point in
     time. Either one alone is unrecoverable: rows without files serve 404, files without rows are never
     reachable and are not cleaned up.
   - The reverse proxy must route `/api/media` to the backend like the rest of `/api`, allow request
     bodies of at least 21 MiB there (nginx: `client_max_body_size 21m;` on that location; the default
     1 MiB would reject every real upload), and must not serve the uploads directory itself: the API
     is the only reader, because it enforces the attached/private rule.
   - Uploaded CSV files are scanned across comma, semicolon, and tab delimiters for spreadsheet
     formula injection (rejecting cells starting with `=`, `+`, `-`, `@`, tab, or CR unless the cell
     is a plain number).
   - Photo processing (re-encoding to WebP and thumbnail creation) is bound by a concurrency
     semaphore (`MEDIA_IMAGE_CONCURRENCY`, default 2, range 1–8) with a bounded queue of 20.
     When the queue is full, uploads answer 503 `MEDIA_PROCESSING_BUSY` with a `Retry-After: 5` header.
   - Schedule `npm run media:cleanup` (daily is plenty). It removes `_staging/` directories and
     unattached uploads whose grace period (24 h, `MEDIA_CLEANUP_GRACE_HOURS` or
     `--grace-hours=N`) has passed, counted from the moment content detached them (`detached_at`), or from
     the upload for assets that were never attached and writes a count-only `media.cleanup` audit row (including files that failed to delete: those rows are kept and retried on the next run, and the script exits 1 so cron notices). It uses the app's normal DB
     user (no privileged connection needed). Under Compose (primary), from the host's cron:
     `30 3 * * * cd /path/to/SIDATA && docker compose exec -T backend npm run media:cleanup >> /var/log/sidata-media-cleanup.log 2>&1`;
     or without Docker, from `backend/`:
     `30 3 * * * cd /path/to/SIDATA/backend && npm run media:cleanup >> /var/log/sidata-media-cleanup.log 2>&1`. Add
     `-- --dry-run` first to see what it would remove.
   - **Moving `UPLOAD_DIR` to a new location:** (1) pause writes (stop the backend, or block `POST
     /api/media` at the proxy); (2) copy the whole tree preserving structure, e.g.
     `rsync -a old/ new/`; (3) verify, e.g. `diff -r old new` or matching file counts and sizes, and
     spot-check a few `/api/media/<id>` URLs after the switch; (4) point `UPLOAD_DIR` (or
     `UPLOADS_HOST_DIR`) at the new location and restart; (5) keep the old copy until verified. Storage
     keys in the database are relative, so no rows change.
7. **Database initialization vs. upgrade runbook:**
   - **Fresh installation:** Run `npx prisma db seed` with `NODE_ENV=production`. In production, seeding initializes 100 empty RT slots (`rtNumber` 1–100 with blank names/contacts and no spatial points) and initializes `maps.rt_leaders_sample_roster` to `false`. Real leader names, contacts, and coordinates must be entered through the CMS manual editor or imported via CSV.
   - **Upgrading an existing database previously seeded with sample/dev data:** Because seeding uses `update: {}` to prevent overwriting existing rows, previously seeded synthetic records or points will survive a re-seed. Before public release, operators must verify whether recognized legacy synthetic records remain. If present, run the maintenance cleanup command from `backend/` during an authorized maintenance window with production configuration:
     ```bash
     npm run dev:cleanup-sample-rt -- --force
     ```
     This cleanup is fingerprint-limited: it resets recognized synthetic placeholder rows, removes synthetic RT points, preserves editor-modified rows, and writes a count-only audit log in the same transaction. Synthetic data that does not match narrow legacy fingerprints will not be automatically cleared; operators must verify and toggle the appropriate `maps.rt_leaders_sample_roster` flag via the Admin CMS (/admin/rukun-tetangga) or `PATCH /api/maps/rt-leaders/sample-status` once verified.

## Public Content Sources

For factual website content, use the [Descan Manggar 2026 source guide](docs/CONTENT_SOURCES.md),
which points to the canonical Google Drive folder and records source periods, citations, and
verification rules.

## Available Scripts

### Frontend (`frontend/`)

| Task                 | Command              |
| -------------------- | -------------------- |
| Start dev server     | `npm run dev`        |
| Build for production | `npm run build`      |
| Type-check           | `npm run type-check` |
| Run unit tests       | `npm run test:unit`  |
| Lint & fix           | `npm run lint`       |
| Format code          | `npm run format`     |

### Backend (`backend/`)

| Task                    | Command                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| Run unit tests          | `npm test`                                                              |
| Run integration tests   | `docker compose -f docker-compose.test.yml run --rm backend-integration` |
| Lint                    | `npm run lint`                                                          |
| Format code             | `npm run format`                                                        |
| Clean stale media       | `npm run media:cleanup` (`-- --dry-run`, `-- --grace-hours=N`)          |
| Run server              | `npx tsx src/index.ts`                                                  |
| Run via Docker          | `docker compose up --build` (repo root)                                 |

Integration tests (`backend/tests/integration/`) need a real MySQL because they assert
concurrency behaviour that a mocked client cannot reproduce: no InnoDB deadlocks under
opposite-order imports, atomic rollback, no-op re-imports, and the seed-mode matrix. The
Compose stack in `docker-compose.test.yml` starts a throwaway `mysql:8.4` on tmpfs, applies
migrations, and runs the suite — it never reads the development database. The runner mounts
`./backend` and therefore reuses the dependencies already installed by `npm ci`.

They are intentionally excluded from `npm test` and CI: they require Docker, and they write
to a live database. Run them locally before touching the RT import, spatial write paths, or
`prisma/seed.ts`.

## Project Structure

```
SIDATA/
├── frontend/   # Vue 3 + Vite + Tailwind app
├── backend/    # Express + Prisma API
└── docker-compose.yml
```

See `CLAUDE.md` for a detailed architecture breakdown of both apps.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines. Use the
[issue templates](.github/ISSUE_TEMPLATE/) to report bugs or request features.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

MIT — see [LICENSE](LICENSE).
