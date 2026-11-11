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
--
-- Run it with no database preselected (`mysql -u root -p < file`); the USE below selects one.
-- (The helper procedures are stored routines and must live inside a database; without a USE,
-- MySQL stops with ERROR 1046: No database selected.) A `--database` flag is harmless: USE wins.

-- 1. Remove the blanket database-level grant.
--    GRANT OPTION is revoked by its own statement (MySQL has no `ALL PRIVILEGES, GRANT OPTION ON
--    db.*` form): `REVOKE ALL PRIVILEGES` alone leaves a lone GRANT OPTION behind, which would be
--    a db-level grant record the check below (rightly) rejects. Error 1141 (no such grant) is
--    ignored for each statement, so re-runs are idempotent.
--    MySQL records a db-level grant on a name containing `_` in ESCAPED form (`sidata\_x`), and a
--    REVOKE naming the unescaped spelling does not touch that record (verified on MySQL 8.0). So
--    each REVOKE runs for both spellings, via prepared statements.
--    Wildcard (`sidata%`.*) and server-wide (*.*) grants are DIFFERENT scopes and are not revoked
--    here; the final check below stops the script naming them, and the operator removes them by hand.
USE `<DB_NAME>`;
DROP PROCEDURE IF EXISTS _sidata_revoke_blanket_db_grant;
DELIMITER $$
CREATE PROCEDURE _sidata_revoke_blanket_db_grant()
BEGIN
  DECLARE db_plain VARCHAR(128) DEFAULT '<DB_NAME>';
  DECLARE db_escaped VARCHAR(256) DEFAULT REPLACE('<DB_NAME>', '_', '\\_');
  DECLARE CONTINUE HANDLER FOR 1141 BEGIN END;
  SET @sidata_stmt = CONCAT('REVOKE ALL PRIVILEGES ON `', db_plain, '`.* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>''');
  PREPARE sidata_revoke FROM @sidata_stmt; EXECUTE sidata_revoke; DEALLOCATE PREPARE sidata_revoke;
  SET @sidata_stmt = CONCAT('REVOKE GRANT OPTION ON `', db_plain, '`.* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>''');
  PREPARE sidata_revoke FROM @sidata_stmt; EXECUTE sidata_revoke; DEALLOCATE PREPARE sidata_revoke;
  SET @sidata_stmt = CONCAT('REVOKE ALL PRIVILEGES ON `', db_escaped, '`.* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>''');
  PREPARE sidata_revoke FROM @sidata_stmt; EXECUTE sidata_revoke; DEALLOCATE PREPARE sidata_revoke;
  SET @sidata_stmt = CONCAT('REVOKE GRANT OPTION ON `', db_escaped, '`.* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>''');
  PREPARE sidata_revoke FROM @sidata_stmt; EXECUTE sidata_revoke; DEALLOCATE PREPARE sidata_revoke;
END$$
DELIMITER ;
CALL _sidata_revoke_blanket_db_grant();
DROP PROCEDURE IF EXISTS _sidata_revoke_blanket_db_grant;

-- 2. Full access to every table EXCEPT audit_logs. Keep this list in sync with
--    backend/prisma/schema.prisma's `@@map(...)` table names.
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`roles` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`users` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`refresh_tokens` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`email_otps` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`system_settings` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`indicators` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`comparison_templates` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`spatial_points` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`spatial_point_rt` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`rt_leaders` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`content_blocks` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`pages` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`chapters` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`sections` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`indicator_tables` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT ALL PRIVILEGES ON `<DB_NAME>`.`indicator_table_rows` TO '<APP_DB_USER>'@'<APP_DB_HOST>';

-- 3. Restricted access to audit_logs: read everything, insert new rows, and update only the two
--    acknowledge columns (MySQL supports column-scoped UPDATE grants). No DELETE, no
--    unrestricted UPDATE.
GRANT SELECT, INSERT ON `<DB_NAME>`.`audit_logs` TO '<APP_DB_USER>'@'<APP_DB_HOST>';
GRANT UPDATE (`acknowledgedAt`, `acknowledgedById`) ON `<DB_NAME>`.`audit_logs`
  TO '<APP_DB_USER>'@'<APP_DB_HOST>';

FLUSH PRIVILEGES;

-- Post-condition check: fail loudly if the app user still holds ANY grant, at any scope, that
-- would let it delete or rewrite audit_logs rows. Three scopes are inspected:
--   (a) database-level grants (information_schema.SCHEMA_PRIVILEGES) whose schema pattern matches
--       <DB_NAME>: the exact name (plain or `\_`-escaped) AND wildcard patterns such as
--       `sidata%`.* (a pattern matches when '<DB_NAME>' LIKE the stored pattern; `\_` in a stored
--       pattern is a literal underscore, a bare `_` or `%` is a wildcard);
--   (b) server-wide grants (information_schema.USER_PRIVILEGES) of DELETE, UPDATE, DROP, ALTER or
--       GRANT OPTION. A global USAGE (or SELECT/INSERT) does not fail;
--   (c) table-level grants on <DB_NAME>.audit_logs (information_schema.TABLE_PRIVILEGES) other than
--       SELECT and INSERT, or any grantable one. The column-scoped UPDATE this script grants is
--       recorded in COLUMN_PRIVILEGES, so it never trips this check.
-- This script can only revoke the exact-name database grant (step 1). A wildcard or global grant
-- is a different scope that it must not silently rewrite, so the check stops with an error naming
-- the problem and the operator revokes it by hand (see SHOW GRANTS FOR the app user) and re-runs.
USE `<DB_NAME>`;
DROP PROCEDURE IF EXISTS _sidata_verify_no_blanket_db_grant;
DELIMITER $$
CREATE PROCEDURE _sidata_verify_no_blanket_db_grant()
BEGIN
  DECLARE db_grants INT DEFAULT 0;
  DECLARE db_list TEXT DEFAULT NULL;
  DECLARE global_grants INT DEFAULT 0;
  DECLARE global_list TEXT DEFAULT NULL;
  DECLARE table_grants INT DEFAULT 0;
  DECLARE table_list TEXT DEFAULT NULL;
  DECLARE failure_message VARCHAR(128) DEFAULT '';
  DECLARE app_grantee VARCHAR(400) DEFAULT CONCAT('''', '<APP_DB_USER>', '''@''', '<APP_DB_HOST>', '''');

  SELECT COUNT(*),
         GROUP_CONCAT(DISTINCT TABLE_SCHEMA SEPARATOR ', ')
    INTO db_grants, db_list
  FROM information_schema.SCHEMA_PRIVILEGES
  WHERE GRANTEE = app_grantee
    AND ('<DB_NAME>' LIKE TABLE_SCHEMA OR TABLE_SCHEMA IN ('<DB_NAME>', REPLACE('<DB_NAME>', '_', '\\_')));

  SELECT COUNT(*), GROUP_CONCAT(PRIVILEGE_TYPE SEPARATOR ', ')
    INTO global_grants, global_list
  FROM information_schema.USER_PRIVILEGES
  WHERE GRANTEE = app_grantee
    AND PRIVILEGE_TYPE IN ('DELETE', 'UPDATE', 'DROP', 'ALTER', 'GRANT OPTION');

  SELECT COUNT(*), GROUP_CONCAT(PRIVILEGE_TYPE SEPARATOR ', ')
    INTO table_grants, table_list
  FROM information_schema.TABLE_PRIVILEGES
  WHERE GRANTEE = app_grantee
    AND TABLE_SCHEMA IN ('<DB_NAME>', REPLACE('<DB_NAME>', '_', '\\_'))
    AND TABLE_NAME = 'audit_logs'
    AND (PRIVILEGE_TYPE NOT IN ('SELECT', 'INSERT') OR IS_GRANTABLE = 'YES');

  -- MESSAGE_TEXT is capped at 128 characters: put the actionable part first.
  IF db_grants > 0 THEN
    SET failure_message = LEFT(CONCAT('Revoke db-level grant on <DB_NAME> (wildcard?): ', IFNULL(db_list, '?')), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = failure_message;
  END IF;
  IF global_grants > 0 THEN
    SET failure_message = LEFT(CONCAT('Revoke server-wide grant on *.* : ', IFNULL(global_list, '?')), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = failure_message;
  END IF;
  IF table_grants > 0 THEN
    SET failure_message = LEFT(CONCAT('Revoke extra table grant on <DB_NAME>.audit_logs: ', IFNULL(table_list, '?')), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = failure_message;
  END IF;
END$$
DELIMITER ;
CALL _sidata_verify_no_blanket_db_grant();
DROP PROCEDURE IF EXISTS _sidata_verify_no_blanket_db_grant;

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
-- The app user is deliberately NOT granted `_prisma_migrations` or CREATE/ALTER, so after this
-- script runs, `prisma migrate deploy` must use the privileged URL (prisma.config.ts reads
-- DATABASE_URL):
--   DATABASE_URL="$AUDIT_ADMIN_DATABASE_URL" npx prisma migrate deploy
-- (Compose: set RUN_MIGRATIONS=0 on `backend`, migrate via the audit-pruner service — see README.)
-- Then re-run this script if the migration added a table.
