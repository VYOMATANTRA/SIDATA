# AGENTS.md

This file provides guidance to Claude Code, Google Antigravity, GitHub Copilot, Jetbrains AI, Junie, Codex, and other agents that support AGENTS.md when working with code in this repository. For specification, see @docs/SPEC.md

## Setup

**Always use `npm ci` instead of `npm install`** — this ensures lockfile-locked versions.

Work from the appropriate directory:

- Frontend: `frontend/`
- Backend: `backend/`

Backend requires a `.env` file at the repository root — `DATABASE_URL` (MySQL, `localhost` for local dev or `mysql` under Docker Compose), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `COOKIE_ENCRYPTION_KEY`, `CORS_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_OAUTH_SUCCESS_REDIRECT`, `GOOGLE_OAUTH_FAILURE_REDIRECT`, `TURNSTILE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` (`PORT` defaults to 3000). See `.env.example`. The server validates these at boot and fails fast if any are missing.

## Database

DB engine is **MySQL**, full stop — but you'll correctly see @prisma/adapter-mariadb in code, since that's Prisma 7's single driver adapter for both engines. Don't 'correct' it.

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
| Run tests      | `npm test`                        | `backend/` |
| Run tests with coverage | `npm run test:coverage`  | `backend/` |
| Format         | `npm run format`                  | `backend/` |
| Run server     | `npx tsx src/index.ts` or similar | `backend/` |
| Run via Docker | `docker compose up --build`       | repo root  |

Backend runs on port from `PORT` env var (default 3000). Prisma client is generated to `generated/prisma/`.

## Git Conventions

**Commit atomically** — each commit should represent one logical, self-contained change (a single fix, feature, or refactor) that leaves the repo in a working state. Avoid bundling unrelated changes into one commit; split them into separate commits instead.

**Never develop directly on `main`** — always create a feature/fix/docs/chore branch and open a PR. `main` should only receive changes via merged PRs.

**Keep documentation in sync** — whenever a change affects setup, commands, architecture, env vars, or workflows, update the relevant docs (README.md, CONTRIBUTING.md, SECURITY.md, this file) in the same PR rather than leaving them stale.

**Keep the spec in sync** — whenever a change settles or revises a product/domain decision (page structure, content model, roles, data-entry rules, schema design intent, scope), update `docs/SPEC.md` in the same PR. Record the decision and the rule it implies, not the deliberation behind it — rationale for settled questions is context every future session pays for. Unresolved questions belong in SPEC.md §10 and nowhere else.

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
- `src/routes/`: Route definitions (`auth.routes.ts`, `health.routes.ts`, `profile.routes.ts`, `users.routes.ts`, `weather.routes.ts`)
- `src/controllers/`: Decoupled route handlers (`auth.controller.ts` for local auth, `oauth.controller.ts` for Google OAuth, `otp.controller.ts` for OTP verification, `profile.controller.ts` for self-service credential changes, `users.controller.ts` for user management, `weather.controller.ts` — forecast lookup)
- `src/services/`: Business logic sitting between controllers and external/data sources (`users.service.ts` — user management & role administration, `profile.service.ts` — self-service credential updates, `weather.service.ts` — caches and transforms BMKG forecasts)
- `src/middlewares/`: Express middleware (`auth.middleware.ts` for JWT, `role.middleware.ts` for role-based authorization, `turnstile.middleware.ts` for anti-bot, `rateLimit.middleware.ts` — per-route rate limiters))
- `src/utils/`: `jwt.ts` (token signing), `oauth.ts` (Google OAuth PKCE & token verification), `otp.ts` (OTP hashing & expiry), `mailer.ts` (transactional email), `turnstile.ts` (Turnstile API client), `prisma.ts` (Prisma instance), `bmkg.ts` (BMKG API fetch + response validation)
- `prisma/schema.prisma`: ORM schema (MySQL)
- `prisma/seed.ts`: Seeds default roles (`user`, `admin`)
- `generated/prisma/`: Auto-generated Prisma client (do not edit)

Key details:

- Express app with JSON middleware, cookie parsing, CORS, and route mounting under `/api/*`
- CSRF protection is applied globally after `cookie-parser`/`cors`; fetch a token from `/api/auth/csrf-token` and send it in `x-csrf-token` for mutating auth requests
- Prisma client output to custom location `../generated/prisma`
- JWT access + refresh tokens; refresh tokens persisted in DB with `/api/auth/refresh` and `/api/auth/logout` endpoints
- Uses `dotenv` for environment configuration
- Unit tests under `src/__tests__/` run via Node's built-in test runner through `tsx` (`npm test`). `npm run test:coverage` runs the same suite with `--experimental-test-coverage` via `backend/scripts/coverage.mjs`, which strips `src/__tests__/**` and `generated/**` out of the printed report so the numbers reflect application code only

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

**Backend endpoint**: Add a handler in `backend/src/controllers/`, wire it in the matching file under `backend/src/routes/`, then mount that router in `backend/src/app.ts` if it's a new resource. Middleware (JSON parsing, cookies, CORS) is already configured in `app.ts`. If the endpoint has non-trivial logic (external API calls, caching, data transforms), put that in `backend/src/services/` and keep the controller a thin pass-through.
