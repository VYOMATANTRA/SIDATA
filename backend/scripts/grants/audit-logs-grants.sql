-- Layer 2 of the audit_logs tamper defense (see docs/SPEC.md §3).
--
-- Layer 1 (src/utils/prisma.ts, src/utils/auditLogGuard.ts) blocks tampering from application
-- code via a Prisma client extension. It is a guardrail, not a security boundary — anything
-- with direct DB access bypasses it. THIS script is the layer that actually holds: it strips
-- the app's runtime DB user (the one in DATABASE_URL) down to exactly what it needs on
-- audit_logs, so it is physically incapable of deleting a row or editing anything except the
-- two acknowledge columns, no matter what application code does or how it's compromised.
--
-- Run this ONCE per environment, as a MySQL user with GRANT privileges (e.g. root), against the
-- already-migrated database. Safe to re-run (every statement is idempotent).
--
-- IMPORTANT — why this isn't a simple REVOKE on one table: the `MYSQL_USER`/`MYSQL_PASSWORD`
-- mechanism in the official mysql Docker image (and most managed-MySQL provisioning) grants the
-- app user `ALL PRIVILEGES ON <database>.*` — a DATABASE-level grant. MySQL's privilege model is
-- strictly additive across scopes (global/db/table/column): a table-level REVOKE cannot narrow a
-- database-level grant, because the effective privilege is the UNION of every scope, not
-- "most-specific wins". So `REVOKE ... ON db.audit_logs FROM user` is a no-op (and errors, since
-- there is no table-level grant record to revoke) as long as the db-level ALL grant still stands.
-- The only way to carve out one table is to replace the blanket grant with explicit per-table
-- grants. That means every table the app writes to must be listed below — WHEN YOU ADD A TABLE
-- (a Prisma migration, including future CMS tables per SPEC.md §7), ADD ITS GRANT HERE TOO, or
-- the app will lose write access to it the next time this script runs.
--
-- SKIPPING THIS SCRIPT ENTIRELY leaves the app's DB user with its original blanket db-level
-- grant — i.e. layer 2 absent, and the append-only guarantee resting entirely on layer 1's
-- application-level guard. Document this explicitly in any deploy runbook.
--
-- Substitute the three placeholders below before running:
--   <APP_DB_USER>  — the value of MYSQL_USER / the username portion of DATABASE_URL (e.g. sidata)
--   <APP_DB_HOST>  — the host the app connects from. Use '%' for Docker Compose's internal
--                    network (the `mysql` service is not reachable from outside it), or a
--                    specific host/CIDR in a VPS deployment with a locked-down MySQL bind.
--   <DB_NAME>      — the value of MYSQL_DATABASE (e.g. sidata)

-- 1. Remove the blanket database-level grant. This is the step that requires replacing it with
--    the explicit per-table grants below in the SAME script run — until step 2 runs, the app
--    has no access to the database at all.
REVOKE ALL PRIVILEGES ON `<DB_NAME>`.* FROM '<APP_DB_USER>'@'<APP_DB_HOST>';

-- 2. Full access to every table EXCEPT audit_logs. Keep this list in sync with
--    backend/prisma/schema.prisma's `@@map(...)` table names.
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`roles` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`users` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`refresh_tokens` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`email_otps` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`system_settings` TO '<APP_DB_USER>'@'<APP_DB_HOST>';

-- 3. Restricted access to audit_logs: read everything, insert new rows, and update only the two
--    acknowledge columns (MySQL supports column-scoped UPDATE grants). No DELETE, no
--    unrestricted UPDATE.
GRANT SELECT, INSERT ON `<DB_NAME>`.`audit_logs` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT UPDATE (`acknowledgedAt`, `acknowledgedById`) ON `<DB_NAME>`.`audit_logs`
  TO '<APP_DB_USER>'@'<APP_DB_HOST>';

FLUSH PRIVILEGES;

-- Verification (run as the app user, or via `SHOW GRANTS FOR '<APP_DB_USER>'@'<APP_DB_HOST>'`):
--   DELETE FROM audit_logs LIMIT 1;                     -- must fail: command denied
--   UPDATE audit_logs SET action = 'x' WHERE id = '...'; -- must fail: command denied
--   UPDATE audit_logs SET acknowledgedAt = NOW()
--     WHERE id = '...';                                  -- must succeed
--   SELECT 1 FROM users LIMIT 1;                          -- must still succeed (every other
--                                                          -- table keeps full access)
--
-- The pruning script (backend/scripts/prune-audit-logs.ts) and Prisma migrations both need
-- full DML/DDL rights and must run as a DIFFERENT, privileged MySQL user — set via
-- AUDIT_ADMIN_DATABASE_URL — never as the app user this script just restricted.
