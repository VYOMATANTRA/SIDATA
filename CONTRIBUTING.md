# Contributing to SIDATA

Thanks for taking the time to contribute. This document covers the local setup and conventions
used in this repository.

## Setup

> **Always use `npm ci`, not `npm install`** — this ensures lockfile-locked versions match CI.

Work from the appropriate directory:

- Frontend: `frontend/`
- Backend: `backend/`

Backend requires a `.env` file (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`CORS_ORIGIN` at minimum — see `backend/.env.example`). The server validates these at boot and
fails fast if any are missing.

## Database

The project uses **MySQL** exclusively. Do not introduce Postgres or MariaDB-specific code,
migrations, or adapters — this decision is settled and independent of hosting/deploy choices.

## Development workflow

### Frontend (`frontend/`)

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type-check | `npm run type-check` |
| Unit tests | `npm run test:unit` |
| Lint & fix | `npm run lint` |
| Format | `npm run format` |
| Build | `npm run build` |

Run `npm run type-check` before `npm run build` to catch TypeScript issues early.

### Backend (`backend/`)

| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Format | `npm run format` |
| Run server | `npx tsx src/index.ts` |

After editing `backend/prisma/schema.prisma`, run `npx prisma migrate dev` to apply the change
and regenerate the Prisma client.

## Before opening a PR

1. Run lint and format in the directory(ies) you touched: `npm run lint`, `npm run format`.
2. For frontend changes, run `npm run type-check` and `npm run test:unit`.
3. Keep commits focused; write commit messages that explain *why*, not just *what*.
4. Branch names should describe the change area, e.g. `feature/<short-name>` or
   `fix/<short-name>`.
5. Open the PR against `main` with a clear description of the change and any manual testing
   performed.

## Code style

- TypeScript throughout; avoid `any` where a real type is available.
- Follow existing patterns: Vue 3 `<script setup>` SFCs on the frontend, Express
  routes/controllers/middlewares layering on the backend (see `CLAUDE.md` for the full
  architecture breakdown).
- ESLint + Prettier (and Oxlint on the frontend) are the source of truth for style — run
  `npm run lint` rather than hand-formatting.

## Reporting bugs / security issues

For regular bugs, open a GitHub issue with reproduction steps. For security vulnerabilities,
do **not** open a public issue — see [SECURITY.md](SECURITY.md) instead.
