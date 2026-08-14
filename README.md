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

```bash
cd backend
npm ci
cp .env.example .env
```

Fill in `.env` with at least:

| Variable                         | Description                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | MySQL connection string, e.g. `mysql://root:password@localhost:3306/sidata`                          |
| `JWT_SECRET`                     | Secret used to sign access tokens                                                                    |
| `JWT_REFRESH_SECRET`             | Secret used to sign refresh tokens                                                                   |
| `CSRF_SECRET`                    | Secret used to sign CSRF tokens and cookies                                                          |
| `CORS_ORIGIN`                    | Frontend origin allowed to make credentialed requests, e.g. `http://localhost:5173`                  |
| `GOOGLE_CLIENT_ID`               | Google OAuth2 Client ID                                                                              |
| `GOOGLE_CLIENT_SECRET`           | Google OAuth2 Client Secret                                                                          |
| `GOOGLE_CALLBACK_URL`           | Google OAuth2 Callback URL, e.g. `http://localhost:3000/api/auth/google/callback`                    |
| `GOOGLE_OAUTH_SUCCESS_REDIRECT` | Frontend URL for successful OAuth redirect, e.g. `http://localhost:5173/auth/callback`              |
| `GOOGLE_OAUTH_FAILURE_REDIRECT` | Frontend URL for failed OAuth redirect, e.g. `http://localhost:5173/login?error=oauth_failed`       |
| `TURNSTILE_SECRET`               | Cloudflare Turnstile anti-bot secret key (`1x0000000000000000000000000000000AA` for local testing)   |
| `RESEND_API_KEY`                 | Resend API key for transactional emails                                                              |
| `EMAIL_FROM`                     | Sender identity for transactional emails, e.g. `"SIDATA Kelurahan Manggar <onboarding@resend.dev>"`  |
| `PORT`                           | _(optional)_ Backend port, defaults to `3000`                                                        |

The server validates these at boot and fails fast if any are missing.

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

From the repo root, with a `.env` providing `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`:

```bash
docker compose up --build
```

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

| Task           | Command                                 |
| -------------- | --------------------------------------- |
| Lint           | `npm run lint`                          |
| Format         | `npm run format`                        |
| Run server     | `npx tsx src/index.ts`                  |
| Run via Docker | `docker compose up --build` (repo root) |

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
