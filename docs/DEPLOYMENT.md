# Deployment

Checklist for setting up a **new environment** (Docker Compose or bare-metal Ubuntu VPS). For local development see the
[README](../README.md#quick-start). Background: [`AGENTS.md`](../AGENTS.md) "Audit Trail" and
[`SECURITY.md`](../SECURITY.md).

## Overview

| #   | Step                                                  | When                                   |
| --- | ----------------------------------------------------- | -------------------------------------- |
| 1   | [Create a privileged database user](#1-privileged-database-user) | Once per environment        |
| 2   | [Run migrations as that user](#2-migrations)          | Every release                          |
| 3   | [Apply the audit-log grants](#3-audit-log-grants)     | Once, and after any new table          |
| 4   | [Schedule audit-log pruning](#4-audit-log-pruning)    | Once                                   |
| 5   | [Configure the reverse proxy](#5-reverse-proxy)       | Once                                   |
| 6   | [Set up media uploads](#6-media-uploads)              | Once, plus a daily cleanup job         |
| 7   | [Seed the database](#7-seeding-a-fresh-or-upgraded-database) | Fresh install or upgrade        |
| 8   | [Continuous Deployment (VPS without Docker)](#8-continuous-deployment-vps-without-docker) | Automated on `main` |

Why two database users: the app's runtime user is deliberately stripped of rights on `audit_logs`
(step 3) so log rows cannot be deleted or rewritten. Anything that needs those rights, such as
migrations and pruning, runs as a separate privileged user.

## 1. Privileged database user

Create a second MySQL user with full rights on the database and set `AUDIT_ADMIN_DATABASE_URL` to
it. This is separate from `DATABASE_URL`, the app's runtime user.

## 2. Migrations

Run migrations as the privileged user.

Under Compose:

```bash
docker compose --profile ops run --rm --build audit-pruner npx prisma migrate deploy
```

Without Compose, from `backend/`:

```bash
DATABASE_URL="$AUDIT_ADMIN_DATABASE_URL" npx prisma migrate deploy
```

Then set `RUN_MIGRATIONS=0` for the `backend` service. By default it runs `migrate deploy` at
start, which the restricted app user can no longer do after step 3.

## 3. Audit-log grants

> **Do this once per environment.** Skipping it leaves the app user with full rights on
> `audit_logs`, so the tamper defense has no database-level layer.

1. In `backend/scripts/grants/audit-logs-grants.sql`, substitute `<APP_DB_USER>`, `<APP_DB_HOST>`
   and `<DB_NAME>`.
2. Run it as a MySQL user that can `GRANT` (for example root), with **no database preselected**
   (the script runs its own ``USE `<DB_NAME>` ``):

   ```bash
   mysql -u root -p < grants.sql
   ```

3. Run the verification queries at the bottom of the file.

What it does and does not touch:

- It revokes the database-level grant by exact name, and `GRANT OPTION`.
- Wildcard grants such as `` `sidata%`.* ``, server-wide grants such as `DELETE ON *.*`, and extra
  table-level grants on `audit_logs` are a different scope. The script ends with a check that stops
  with an error naming any such grant the app user still holds. Revoke that one by hand and re-run.
- **Re-apply the script on every release that adds a table.** Once per-table grants are active, `backend/scripts/check-app-db-grants.ts` (run automatically during CD) blocks deployment if a new table is missing grants for the runtime DB user.

## 4. Audit-log pruning

Schedule retention pruning with **one** of:

- **Compose sidecar** (schedule from `AUDIT_PRUNE_SCHEDULE`, default daily at 03:00). It has no bind
  mount, so pass `--build` after every `git pull` or it runs the previously built image:

  ```bash
  docker compose --profile ops up -d --build audit-pruner
  ```

- **Host cron**, which needs `AUDIT_ADMIN_DATABASE_URL` and the other required backend variables in
  the root `.env`, and `npx` on cron's `PATH`:

  ```cron
  0 3 * * * cd /path/to/SIDATA/backend && npx tsx scripts/prune-audit-logs.ts >> /var/log/sidata-prune.log 2>&1
  ```

## 5. Reverse proxy

If SIDATA sits behind a reverse proxy, set `TRUST_PROXY`. Without it, every client appears to have
the proxy's address in rate limiting, CSRF and audit logs. See [section 6](#proxy-requirements) for
the media-specific proxy rules.

## 6. Media uploads

Applies to `media_assets` and `UPLOAD_DIR`.

### Storage directory

- Apply the grants script (step 3) again after the migration that adds `media_assets`. It already
  contains that table's line. The later `add_media_assets_detached_at` migration only adds a column,
  so it needs no grants change.
- Create the host directory for the bind mount (`UPLOADS_HOST_DIR`, default `./uploads`) and make it
  writable by the user the backend runs as (the dev image runs as root).
- The server creates `_staging/`, `photos/`, `documents/` and `derivatives/` itself and checks
  `UPLOAD_DIR` at boot. If it is unwritable or inside `backend/` or `frontend/`, the server still
  starts but logs a loud `WARNING: media storage is NOT usable` block. Uploads and media delivery then
  answer 503 `MEDIA_STORAGE_UNAVAILABLE` (no path in the body) while everything else keeps serving.
  Media recovers on its own, with no restart, once the directory is fixed. Watch the boot log for
  that warning.

### Proxy requirements

- Route `/api/media` to the backend like the rest of `/api`.
- Allow request bodies of at least 21 MiB there. For nginx, set `client_max_body_size 21m;` on that
  location; the default 1 MiB rejects every real upload.
- Pass the `Authorization` header through. The editor preview route (`/api/media/<id>/preview`)
  needs it; the CMS loads it with the authenticated API client and a blob URL.
- Do **not** serve the uploads directory directly. The API is the only reader, because it enforces
  the attached/private rule.

### Backups

**Back up the uploads directory and the `media_assets` table together**, from the same point in
time. Either one alone is unrecoverable: rows without files serve 404, and files without rows are
never reachable and never cleaned up.

### Upload limits and checks

- **CSV files** are scanned across comma, semicolon and tab delimiters for spreadsheet formula
  injection. Cells starting with `=`, `+`, `-`, `@`, tab or CR are rejected unless the cell is a
  plain number.
- **Photos** are re-encoded to WebP with a thumbnail. Processing is bound by a concurrency semaphore
  (`MEDIA_IMAGE_CONCURRENCY`, default 2, range 1–8) with a bounded queue of 20. When the queue is
  full, uploads answer 503 `MEDIA_PROCESSING_BUSY` with a `Retry-After: 5` header.

### Scheduled cleanup

Schedule `npm run media:cleanup` (daily is plenty). It:

- removes `_staging/` directories and unattached uploads whose grace period has passed (24 h by
  default; set `MEDIA_CLEANUP_GRACE_HOURS` or pass `--grace-hours=N`). The grace period counts from
  when content detached the upload (`detached_at`), or from the upload itself if it was never
  attached;
- writes a count-only `media.cleanup` audit row;
- keeps rows whose files failed to delete and retries them next run, exiting 1 so cron notices;
- uses the app's normal database user, so no privileged connection is needed.

Under Compose (primary), from the host's cron:

```cron
30 3 * * * cd /path/to/SIDATA && docker compose exec -T backend npm run media:cleanup >> /var/log/sidata-media-cleanup.log 2>&1
```

Without Docker, from `backend/`:

```cron
30 3 * * * cd /path/to/SIDATA/backend && npm run media:cleanup >> /var/log/sidata-media-cleanup.log 2>&1
```

Add `-- --dry-run` first to see what it would remove.

### Moving `UPLOAD_DIR`

1. Pause writes: stop the backend, or block `POST /api/media` at the proxy.
2. Copy the whole tree, preserving structure: `rsync -a old/ new/`.
3. Verify with `diff -r old new` or matching file counts and sizes, and spot-check a few
   `/api/media/<id>` URLs after the switch.
4. Point `UPLOAD_DIR` (or `UPLOADS_HOST_DIR`) at the new location and restart.
5. Keep the old copy until verified.

Storage keys in the database are relative, so no rows change.

## 7. Seeding a fresh or upgraded database

### Fresh installation

Run `npx prisma db seed` with `NODE_ENV=production`. In production, seeding creates 100 empty RT
slots (`rtNumber` 1–100, blank names and contacts, no spatial points) and sets
`maps.rt_leaders_sample_roster` to `false`. Enter real leader names, contacts and coordinates
through the CMS manual editor or CSV import.

### Upgrading a database that was seeded with sample data

Seeding uses `update: {}` so it never overwrites existing rows, which means previously seeded
synthetic records and points survive a re-seed. Before public release, check whether recognized
legacy synthetic records remain. If they do, run the cleanup from `backend/` during an authorized
maintenance window, with production configuration:

```bash
npm run dev:cleanup-sample-rt -- --force
```

The cleanup:

- resets recognized synthetic placeholder rows and removes synthetic RT points;
- preserves rows an editor has modified;
- writes a count-only audit log in the same transaction.

Synthetic data that does not match its narrow legacy fingerprints is **not** cleared automatically.
Verify it by hand, then set the `maps.rt_leaders_sample_roster` flag with `PATCH /api/maps/rt-leaders/sample-status`.

## 8. Continuous Deployment (VPS without Docker)

`.github/workflows/deploy.yml` automates deployment to a bare-metal Ubuntu VPS via SSH whenever `CI` succeeds on `main` (or when triggered manually via `workflow_dispatch` on `main`), scoped to the GitHub `production` environment:

- **GitHub Environment & Secrets**: configure the `production` environment in GitHub (leaving *Required reviewers* off keeps `main` deploys automatic; enabling it adds a manual approval gate). Store `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY`, and `VPS_KNOWN_HOSTS` as secrets, and `VITE_TURNSTILE_SITE_KEY` as a variable (baked into `frontend/dist` at build time; the build fails if unset). These match the connection settings used by `.github/workflows/test-ssh.yml`.
- **VPS layout under `/var/www/sidata/`** (owned by `deploy:deploy`):
  - `releases/<short-sha>-<run-id>-<attempt>/` — built `frontend/dist`, backend source + `generated/prisma`, symlinked `.env -> ../../shared/.env`, and `backend/node_modules` (reused from the active release via `package-lock.json` hash or installed with `npm ci`).
  - `current` — atomic symlink switched after `npx prisma migrate deploy` (using `AUDIT_ADMIN_DATABASE_URL`) and `npx tsx scripts/check-app-db-grants.ts` succeed.
  - `shared/.env` (`0600`) and `shared/uploads/` (`UPLOAD_DIR`, mode `0750`).
- **Process management & rollback scope**:
  - Restarts `sidata-backend.service` via a narrow `sudoers` rule; if `systemctl restart` fails or `/api/health` fails after a successful restart, the script immediately rolls back the `current` symlink and exits non-zero.
  - **Rollback limitation**: rolling back only repoints the `current` symlink to the previous release and restarts `sidata-backend` — it **cannot undo database migrations**. Keep all schema migrations backward-compatible (expand/contract).
- **First-time post-deploy steps**: immediately after the first deployment creates the tables, run `backend/scripts/grants/audit-logs-grants.sql` as MySQL `root`, run `NODE_ENV=production npx prisma db seed`, and install host cron jobs.

Reference templates for reproducing the bare-metal VPS setup (replace `<DOMAIN>` and Node path if different):

<details>
<summary>systemd unit, sudoers rule, Nginx site config, and host cron entries</summary>

`/etc/systemd/system/sidata-backend.service`:

```ini
[Unit]
Description=SIDATA Backend API
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/var/www/sidata/current/backend
Environment="PATH=/home/deploy/.nvm/versions/node/v24.22.3/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/var/www/sidata/shared/.env
ExecStart=/home/deploy/.nvm/versions/node/v24.22.3/bin/node /var/www/sidata/current/backend/node_modules/.bin/tsx src/index.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sidata-backend

[Install]
WantedBy=multi-user.target
```

`/etc/sudoers.d/sidata-deploy` (`chmod 440`, validate with `visudo -cf`):

```text
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart sidata-backend, /usr/bin/systemctl start sidata-backend, /usr/bin/systemctl stop sidata-backend, /usr/bin/systemctl status sidata-backend, /usr/bin/systemctl is-active sidata-backend
```

`/etc/nginx/sites-available/sidata` (enable HTTPS via `certbot --nginx` once the domain points to the VPS):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <DOMAIN>;

    root /var/www/sidata/current/frontend/dist;
    index index.html;

    location /api/media {
        client_max_body_size 21m;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Host `crontab` for `deploy` (sources NVM so `npx` uses the pinned Node LTS):

```cron
0 3 * * * bash -c 'export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use default >/dev/null; cd /var/www/sidata/current/backend && npx tsx scripts/prune-audit-logs.ts' >> /var/log/sidata/prune.log 2>&1
30 3 * * * bash -c 'export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use default >/dev/null; cd /var/www/sidata/current/backend && npm run media:cleanup' >> /var/log/sidata/media-cleanup.log 2>&1
```

</details>
