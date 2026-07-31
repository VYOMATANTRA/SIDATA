# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

**Always use `npm ci` instead of `npm install`** — this ensures lockfile-locked versions.

Work from the appropriate directory:

- Frontend: `frontend/`
- Backend: `backend/`

Backend requires a `.env` file — `DATABASE_URL` (MySQL), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` at minimum (`PORT` defaults to 3000). See `backend/.env.example`. The server validates these at boot and fails fast if any are missing.

## Database

**MySQL** — resolved 2026-07-31. Do not suggest, scaffold, or migrate toward Postgres or MariaDB-specific code or adapters.

Deploy target: Docker on a self-managed VPS (may change pending stakeholder input — this affects hosting, not the DB engine choice, which is settled independently).

## Development

### Frontend (Vue 3 + Vite + Tailwind)

| Task                 | Command              | Location    |
| -------------------- | -------------------- | ----------- |
| Start dev server     | `npm run dev`        | `frontend/` |
| Build for production | `npm run build`      | `frontend/` |
| Type-check           | `npm run type-check` | `frontend/` |
| Run unit tests       | `npm run test:unit`  | `frontend/` |
| Lint & fix           | `npm run lint`       | `frontend/` |
| Format code          | `npm run format`     | `frontend/` |

Dev server runs on `http://localhost:5173` by default (Vite).

### Backend (Express + Prisma)

| Task           | Command                           | Location   |
| -------------- | --------------------------------- | ---------- |
| Lint           | `npm run lint`                    | `backend/` |
| Format         | `npm run format`                  | `backend/` |
| Run server     | `npx tsx src/index.ts` or similar | `backend/` |
| Run via Docker | `docker compose up --build`       | repo root  |

Backend runs on port from `PORT` env var (default 3000). Prisma client is generated to `generated/prisma/`.

## Git Conventions

**Commit atomically** — each commit should represent one logical, self-contained change (a single fix, feature, or refactor) that leaves the repo in a working state. Avoid bundling unrelated changes into one commit; split them into separate commits instead.

**Never develop directly on `main`** — always create a feature/fix/docs/chore branch and open a PR. `main` should only receive changes via merged PRs.

**Keep documentation in sync** — whenever a change affects setup, commands, architecture, env vars, or workflows, update the relevant docs (README.md, CONTRIBUTING.md, SECURITY.md, this file) in the same PR rather than leaving them stale.

## Architecture

### Frontend Structure

- `src/App.vue`: Root component
- `src/main.ts`: Entry point (Vue app initialization)
- `src/router/`: Vue Router routes
- `src/stores/`: Pinia state management
- `src/__tests__/`: Unit tests with Vitest
- `src/assets/`: Static assets, including `main.css` (Tailwind entry, imported in `main.ts`)
- Styling: Tailwind CSS via Vite plugin

Key details:

- Single-File Components (`.vue` files) with `<script setup>` pattern (Vue 3)
- Import alias `@` → `src/` configured in Vite
- Vue DevTools plugin enabled
- Uses Oxlint + ESLint + Prettier for code quality

### Backend Structure

- `src/index.ts`: Entry point — starts the HTTP listener
- `src/app.ts`: Express app setup (middleware, CORS, route mounting)
- `src/configs/index.ts`: Typed env var access; validated at boot
- `src/routes/`: Route definitions (`auth.routes.ts`, `health.routes.ts`)
- `src/controllers/`: Route handlers (`auth.controller.ts` — register/login)
- `src/middlewares/`: Express middleware (`auth.middleware.ts` — JWT verification)
- `src/utils/`: `jwt.ts` (token signing), `prisma.ts` (Prisma client instance)
- `prisma/schema.prisma`: ORM schema (MySQL)
- `prisma/seed.ts`: Seeds default roles (`user`, `admin`)
- `generated/prisma/`: Auto-generated Prisma client (do not edit)

Key details:

- Express app with JSON middleware, cookie parsing, CORS, and route mounting under `/api/*`
- Prisma client output to custom location `../generated/prisma`
- JWT access + refresh tokens; refresh tokens persisted in DB with `/api/auth/refresh` and `/api/auth/logout` endpoints
- Uses `dotenv` for environment configuration
- No test setup currently (placeholder in package.json)

## Tech Stack Summary

| Layer    | Tech                                         |
| -------- | -------------------------------------------- |
| Frontend | Vue 3, Vue Router, Pinia, Tailwind CSS, Vite |
| Backend  | Express.js, Prisma ORM                       |
| Database | MySQL (configured in Prisma)                 |
| Language | TypeScript (both frontend and backend)       |
| Node     | ^22.18.0 or >=24.12.0 (frontend)             |
| Linting  | ESLint + Prettier (both)                     |

## Key Files

- **Root README**: Overview of tech stack and `npm ci` requirement
- **Frontend README**: IDE setup, Vite/TypeScript guides, build commands
- **`package.json`** (both dirs): Scripts and dependencies—reference for available commands
- **ESLint configs**: `frontend/eslint.config.ts`, `backend/eslint.config.js`
- **TypeScript**: `frontend/tsconfig.json`, `backend/tsconfig.json` (with app config for frontend)
- **Vite config**: `frontend/vite.config.ts` (Tailwind, Vue plugins, `@` alias)

## Common Workflows

**Debug frontend type errors**: Use `npm run type-check` to get full TypeScript diagnostics before `npm run build`.

**Fix linting before commit**: Run `npm run lint` to fix ESLint and Prettier issues in one pass.

**Database schema changes**: Edit `backend/prisma/schema.prisma`, then run `npx prisma migrate dev` to apply and generate client.

**Add a route**: In `frontend/src/router/index.ts`, register a new route pointing to a component. Add the component in `frontend/src/` or a subdirectory.

**Add a store**: Create a new file in `frontend/src/stores/` following Pinia conventions (defineStore), then import and use in components via `useStore()`.

**Backend endpoint**: Add a handler in `backend/src/controllers/`, wire it in the matching file under `backend/src/routes/`, then mount that router in `backend/src/app.ts` if it's a new resource. Middleware (JSON parsing, cookies, CORS) is already configured in `app.ts`.
