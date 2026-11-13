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

- Git
- **Docker + Docker Compose** — for option A and B below
- **Node.js** `^22.18.0` or `>=24.12.0` — only for options B and C (running the apps on your machine)
- **MySQL** `8.4` — only for option C (options A and B use the Compose `mysql` service)

> **Always use `npm ci`, not `npm install`** — this installs the exact lockfile versions CI uses.

## Quick Start

```bash
git clone git@github.com:VYOMATANTRA/SIDATA.git
cd SIDATA
cp .env.example .env
```

`.env.example` works as-is for local development: it ships placeholder secrets, Cloudflare's
always-pass Turnstile test keys and placeholder Google credentials. Pick **one** way to run:

| Option | Backend + frontend | MySQL           | Use when                              |
| ------ | ------------------ | --------------- | ------------------------------------- |
| **A**  | Docker             | Docker          | You just want it running (recommended) |
| **B**  | Your machine       | Docker          | Day-to-day coding with fast reloads   |
| **C**  | Your machine       | Your own MySQL  | You cannot use Docker                 |

Default ports: frontend `5173`, backend `3000`, MySQL `3306`. Stop anything already using them
(for example a local MySQL) or change `FRONTEND_PORT` / `BACKEND_PORT` in `.env`.

### A. Everything in Docker

```bash
docker compose up --build
```

The first start takes a few minutes. The backend container installs dependencies, generates the
Prisma client, applies migrations and seeds default data before serving; wait for the log line
saying the server is listening. Then open <http://localhost:5173>.

Create a login (see [Logging in locally](#logging-in-locally)):

```bash
docker compose exec backend npm run dev:seed
```

Source code is bind-mounted, so edits reload automatically. Dependencies live in named Docker
volumes: after pulling a change to a `package-lock.json`, restart with `docker compose up --build`,
and see [Troubleshooting](#troubleshooting) if modules still look stale.

### B. MySQL in Docker, apps on your machine

1. Start only the database and point `.env` at it. In `.env`, change the host in `DATABASE_URL`
   from `mysql` to `localhost`:

   ```bash
   docker compose up -d mysql
   # .env: DATABASE_URL=mysql://sidata:changeme@localhost:3306/sidata
   ```

2. Backend (terminal 1). The Prisma CLI does not read the root `.env` by itself, so load it into
   your shell first (once per terminal):

   ```bash
   cd backend
   npm ci
   set -a && . ../.env && set +a
   npx prisma generate
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev:seed
   npx tsx watch src/index.ts
   ```

3. Frontend (terminal 2). Vite reads `frontend/.env`, not the root one:

   ```bash
   cd frontend
   cp .env.example .env
   npm ci
   npm run dev
   ```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

### C. Everything on your machine

Same as B, but create the database yourself instead of `docker compose up -d mysql`:

```sql
CREATE DATABASE sidata CHARACTER SET utf8mb4;
CREATE USER 'sidata'@'localhost' IDENTIFIED BY 'changeme';
GRANT ALL PRIVILEGES ON sidata.* TO 'sidata'@'localhost';
```

Then set `DATABASE_URL` in `.env` to match (for example
`mysql://sidata:changeme@localhost:3306/sidata`) and follow steps 2 and 3 of option B.

## Logging in locally

- **Dev admin (use this).** `npm run dev:seed` (from `backend/`; in Docker,
  `docker compose exec backend npm run dev:seed`) creates a verified admin:
  `dev-admin@example.com` / `DevPassword123!`. It refuses to run with `NODE_ENV=production`.
- **Registering a new account** needs an emailed OTP. The placeholder `RESEND_API_KEY` sends nothing,
  so no code will arrive. Use a real Resend key if you need to test registration.
- **Google sign-in** only works with real `GOOGLE_*` credentials (callback
  `http://localhost:3000/api/auth/google/callback`).
- **Turnstile** passes automatically with the test keys from the examples. If login says the
  anti-bot check failed, see [Troubleshooting](#troubleshooting).

## Environment Variables

Two files, read by different programs:

| File            | Read by                                         | Template                |
| --------------- | ----------------------------------------------- | ----------------------- |
| `.env` (root)   | Backend (via dotenv), Docker Compose            | `.env.example`          |
| `frontend/.env` | Vite when run on your machine (options B and C) | `frontend/.env.example` |

Under Docker (option A) the frontend container takes `VITE_API_URL_DOCKER` and
`VITE_TURNSTILE_SITE_KEY` from the root `.env`; `frontend/.env` is not used.

The backend validates required variables at boot and exits with `Missing required environment
variable: NAME` if one is missing **or empty**. Required in the root `.env`:

| Variable                        | Description                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | MySQL connection string. Host `mysql` under Docker Compose, `localhost` otherwise. Keep it in sync with the `MYSQL_*` values by hand — Compose does not expand variables inside `.env`. |
| `JWT_SECRET`                    | Secret used to sign access tokens                                                                                             |
| `JWT_REFRESH_SECRET`            | Secret used to sign refresh tokens                                                                                            |
| `CSRF_SECRET`                   | Secret used to sign CSRF tokens and cookies                                                                                   |
| `COOKIE_ENCRYPTION_KEY`         | Secret used to encrypt temporary OAuth state and verifier cookies                                                             |
| `CORS_ORIGIN`                   | Frontend origin allowed to make credentialed requests, e.g. `http://localhost:5173`                                           |
| `GOOGLE_CLIENT_ID`              | Google OAuth2 Client ID (placeholder is fine unless testing Google sign-in)                                                   |
| `GOOGLE_CLIENT_SECRET`          | Google OAuth2 Client Secret (same)                                                                                            |
| `GOOGLE_CALLBACK_URL`           | e.g. `http://localhost:3000/api/auth/google/callback`                                                                         |
| `GOOGLE_OAUTH_SUCCESS_REDIRECT` | Frontend URL for successful OAuth redirect, e.g. `http://localhost:5173/auth/callback`                                        |
| `GOOGLE_OAUTH_FAILURE_REDIRECT` | Frontend URL for failed OAuth redirect, e.g. `http://localhost:5173/login?error=oauth_failed`                                 |
| `TURNSTILE_SECRET`              | Cloudflare Turnstile secret (`1x0000000000000000000000000000000AA` always passes, for local testing)                          |
| `RESEND_API_KEY`                | Resend API key for transactional emails (placeholder boots but sends nothing)                                                 |
| `EMAIL_FROM`                    | Sender identity, e.g. `"SIDATA Kelurahan Manggar <onboarding@resend.dev>"`                                                    |

Optional: `PORT` (backend, default `3000`), `OAUTH_STATE_TTL_SECONDS` / `OAUTH_PKCE_TTL_SECONDS`
(default `300`), `TRUST_PROXY`, `UPLOAD_DIR` / `UPLOADS_HOST_DIR`, `AUDIT_ADMIN_DATABASE_URL`,
`AUDIT_PRUNE_SCHEDULE`, `RUN_MIGRATIONS`, `MEDIA_CLEANUP_GRACE_HOURS`, `MEDIA_IMAGE_CONCURRENCY`.
They are documented inline in `.env.example`.

Frontend (`frontend/.env`): `VITE_API_URL` (backend URL the dev proxy targets) and
`VITE_TURNSTILE_SITE_KEY` (`1x00000000000000000000AA` always passes; must pair with
`TURNSTILE_SECRET`).

## Troubleshooting

| Symptom                                                                    | Cause and fix                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EBADENGINE` warnings, or odd syntax/module errors on your machine         | Wrong Node version. Check `node -v`: it must be `^22.18.0` or `>=24.12.0` (Node 20 is not supported). Switch with `nvm install 22 && nvm use 22`, then re-run `npm ci`.                            |
| `Missing required environment variable: X`                                 | `X` is absent or empty in the root `.env`. Re-copy from `.env.example`.                                                                                                                              |
| `Can't reach database server` / `ECONNREFUSED` / `getaddrinfo ENOTFOUND mysql` | Wrong host in `DATABASE_URL`: `mysql` only resolves inside Compose; use `localhost` when the backend runs on your machine. Also wait for MySQL's healthcheck (`docker compose ps`).       |
| Prisma CLI: `Cannot read properties of undefined` / empty datasource URL   | The CLI reads `DATABASE_URL` from the shell or `backend/.env`, not the root `.env`. Run `set -a && . ../.env && set +a` in `backend/` first.                                                        |
| `Cannot find module '…/generated/prisma'`                                  | The Prisma client is generated, not committed. Run `npx prisma generate` in `backend/` (also after pulling schema changes).                                                                          |
| `prisma migrate dev` fails with P3014 / "permission denied to create database" | `migrate dev` needs a shadow database, which the app user cannot create. Use `npx prisma migrate deploy` to just apply migrations. When authoring a new migration, run `migrate dev` with a `DATABASE_URL` for `root` (password `MYSQL_ROOT_PASSWORD`). |
| Login/register says the anti-bot check failed                              | Turnstile keys must be the Cloudflare test pair: `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` in `.env` and `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` in the file Vite reads. Restart Vite after editing. |
| Frontend loads but every API call fails                                    | Backend not running or wrong `VITE_API_URL` in `frontend/.env` (host runs: `http://localhost:3000`). Credentialed requests also need `CORS_ORIGIN` to equal the exact frontend URL.                   |
| `port is already allocated` / `EADDRINUSE`                                 | Another process holds 3306, 3000 or 5173 (often a local MySQL). Stop it or change `BACKEND_PORT` / `FRONTEND_PORT` in `.env`; for 3306 edit the `ports` mapping of the `mysql` service.            |
| Docker frontend/backend cannot find a package after a dependency change    | `node_modules` live in named volumes. Run `docker compose down`, then `docker volume rm sidata_frontend_node_modules_glibc` (frontend) or `sidata_backend_node_modules` (backend), then `docker compose up --build`. `docker compose down -v` removes **all** volumes, including the database. |
| Changed `MYSQL_*` but the database still uses old credentials              | MySQL only applies them on first creation of its volume. Update `DATABASE_URL` to match, and either recreate the user by hand or `docker compose down -v` (wipes local data).                        |
| `npm ci` fails during a Docker build                                       | Network or registry issue. Build with plain output and test registry access (below).                                                                                                                 |

```bash
docker compose --progress plain build frontend
docker run --rm node:22-bookworm-slim npm ping --fetch-retries=0 --fetch-timeout=10000
```

## Daily Development

- **Schema changes**: edit `backend/prisma/schema.prisma`, run `npx prisma migrate dev` (see the P3014
  note above), and commit the migration. If it adds a table, also add its `GRANT` line to
  `backend/scripts/grants/audit-logs-grants.sql`.
- **Seed data**: `npx prisma db seed` loads default roles, settings, content blocks and the Cerita
  pages. In non-production it also loads synthetic RT leaders and delegates recognized legacy-sample
  cleanup to the same transactional service used by the maintenance CLI. The cleanup is
  fingerprint-limited, preserves edited rows, and writes a count-only warning audit record in the
  same transaction when it changes data. For a manual cleanup, run `npm run dev:cleanup-sample-rt`
  from `backend/`; production requires the explicit `--force` flag.
- **Ketua RT page**: the public page refreshes its roster and `isSampleRoster` notice every 60
  seconds while visible, keeping the last successful roster displayed if a refresh fails.
- **Auth API**: CSRF tokens come from `GET /api/auth/csrf-token`. Send the returned token in the
  `x-csrf-token` header on mutating auth requests.
- **Uploaded media** lives in `UPLOADS_HOST_DIR` (default `./uploads`, git-ignored) on the host.
  Under Docker it is bind-mounted into the backend at `/var/lib/sidata/uploads` (`UPLOAD_DIR`), so it
  survives rebuilds. Outside Docker, `UPLOAD_DIR` is optional and defaults to `<repo-root>/uploads`.
- Docker notes: frontend and backend use Node 22 on Debian Bookworm and install their lockfiles with
  `npm ci`. The backend uses the full Bookworm image for Prisma's OpenSSL dependency. The opt-in
  `audit-pruner` build target adds BusyBox for scheduled pruning.

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

| Task                    | Command                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| Run server              | `npx tsx src/index.ts` (or `npx tsx watch src/index.ts` to reload)       |
| Run unit tests          | `npm test`                                                               |
| Run integration tests   | `docker compose -f docker-compose.test.yml run --rm backend-integration` (repo root) |
| Lint                    | `npm run lint`                                                           |
| Format code             | `npm run format`                                                         |
| Create local dev admin  | `npm run dev:seed`                                                       |
| Seed sample indicators  | `npm run seed:indicator`                                                 |
| Clean sample RT data    | `npm run dev:cleanup-sample-rt`                                          |
| Clean stale media       | `npm run media:cleanup` (`-- --dry-run`, `-- --grace-hours=N`)           |

Integration tests (`backend/tests/integration/`) need a real MySQL because they assert
concurrency behaviour that a mocked client cannot reproduce: no InnoDB deadlocks under
opposite-order imports, atomic rollback, no-op re-imports, and the seed-mode matrix. The
Compose stack in `docker-compose.test.yml` starts a throwaway `mysql:8.4` on tmpfs, applies
migrations, and runs the suite — it never reads the development database. The runner mounts
`./backend` and therefore reuses the dependencies already installed by `npm ci`.

They are intentionally excluded from `npm test` and CI: they require Docker, and they write
to a live database. Run them locally before touching the RT import, spatial write paths, or
`prisma/seed.ts`.

## Deployment

Production setup (privileged DB user, audit-log grants, pruning, reverse proxy, media uploads,
seeding) is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Not needed for local development.

## Public Content Sources

For factual website content, use the [Descan Manggar 2026 source guide](docs/CONTENT_SOURCES.md),
which points to the canonical Google Drive folder and records source periods, citations, and
verification rules.

## Project Structure

```
SIDATA/
├── frontend/   # Vue 3 + Vite + Tailwind app
├── backend/    # Express + Prisma API
└── docker-compose.yml
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a map of both apps.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines. Use the
[issue templates](.github/ISSUE_TEMPLATE/) to report bugs or request features.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

MIT — see [LICENSE](LICENSE).
