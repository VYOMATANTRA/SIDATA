# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

**Always use `npm ci` instead of `npm install`** — this ensures lockfile-locked versions.

Work from the appropriate directory:
- Frontend: `frontend/`
- Backend: `backend/`

Backend requires a `.env` file with `PORT=3000` (or your target port). See `backend/.env.example`.

## Development

### Frontend (Vue 3 + Vite + Tailwind)

| Task | Command | Location |
|------|---------|----------|
| Start dev server | `npm run dev` | `frontend/` |
| Build for production | `npm run build` | `frontend/` |
| Type-check | `npm run type-check` | `frontend/` |
| Run unit tests | `npm run test:unit` | `frontend/` |
| Lint & fix | `npm run lint` | `frontend/` |
| Format code | `npm run format` | `frontend/` |

Dev server runs on `http://localhost:5173` by default (Vite).

### Backend (Express + Prisma)

| Task | Command | Location |
|------|---------|----------|
| Lint | `npm run lint` | `backend/` |
| Format | `npm run format` | `backend/` |
| Run server | `npx tsx src/index.ts` or similar | `backend/` |

Backend runs on port from `PORT` env var (default 3000 from `.env.example`). Prisma client is generated to `generated/prisma/`.

## Architecture

### Frontend Structure
- `src/App.vue`: Root component
- `src/main.ts`: Entry point (Vue app initialization)
- `src/router/`: Vue Router routes
- `src/stores/`: Pinia state management
- `src/__tests__/`: Unit tests with Vitest
- `src/asstes/`: Static assets (note: typo in folder name)
- Styling: Tailwind CSS via Vite plugin

Key details:
- Single-File Components (`.vue` files) with `<script setup>` pattern (Vue 3)
- Import alias `@` → `src/` configured in Vite
- Vue DevTools plugin enabled
- Uses Oxlint + ESLint + Prettier for code quality

### Backend Structure
- `src/index.ts`: Express server entry point
- `prisma/schema.prisma`: ORM schema (PostgreSQL)
- `generated/prisma/`: Auto-generated Prisma client (do not edit)

Key details:
- Minimal Express app with JSON middleware and basic routing
- Prisma client output to custom location `../generated/prisma`
- Uses `dotenv` for environment configuration
- No test setup currently (placeholder in package.json)

## Tech Stack Summary

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Vue Router, Pinia, Tailwind CSS, Vite |
| Backend | Express.js, Prisma ORM |
| Database | PostgreSQL (configured in Prisma) |
| Language | TypeScript (both frontend and backend) |
| Node | ^22.18.0 or >=24.12.0 (frontend) |
| Linting | ESLint + Prettier (both) |

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

**Backend endpoint**: Add a route to `backend/src/index.ts` using `app.get()`, `app.post()`, etc. Middleware is already configured (`express.json()`).
