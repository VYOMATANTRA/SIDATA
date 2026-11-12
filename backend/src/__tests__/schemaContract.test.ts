import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const backendPath = (relative: string): string =>
  fileURLToPath(new URL(`../../${relative}`, import.meta.url));

const read = (relative: string): string => readFileSync(backendPath(relative), 'utf8');

/** Drop `--` comment lines so prose in the header can never satisfy (or break) a match. */
const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

describe('schema contract', () => {
  describe('audit-logs-grants.sql covers every table', () => {
    const schemaSource = read('prisma/schema.prisma');
    const schemaTables = [...schemaSource.matchAll(/@@map\("([a-z_]+)"\)/g)].map((m) => m[1]!);
    const modelCount = [...schemaSource.matchAll(/^model\s+\w+\s*\{/gm)].length;
    const grantsSql = stripSqlComments(read('scripts/grants/audit-logs-grants.sql'));

    it('maps every model to a table, so the parser below cannot silently skip one', () => {
      assert.ok(modelCount > 0);
      assert.equal(
        schemaTables.length,
        modelCount,
        'a model in schema.prisma has no @@map; add one so its grants line can be checked',
      );
      assert.ok(schemaTables.includes('audit_logs'));
      assert.ok(schemaTables.includes('indicators'));
      assert.ok(schemaTables.includes('comparison_templates'));
      assert.equal(new Set(schemaTables).size, schemaTables.length, 'duplicate @@map names');
    });

    // AGENTS.md "Database schema changes": the grants script replaces the app user's blanket
    // db-level grant with per-table grants, so a table missing from it becomes inaccessible
    // to the app the next time the script is applied.
    for (const table of schemaTables.filter((t) => t !== 'audit_logs')) {
      it(`grants the app user full access to ${table}`, () => {
        const pattern = new RegExp(
          `GRANT ALL PRIVILEGES ON \`<DB_NAME>\`\\.\`${table}\` TO '<APP_DB_USER>'@'<APP_DB_HOST>';`,
        );
        assert.match(grantsSql, pattern);
      });
    }

    it('keeps audit_logs append-only: no blanket grant, only SELECT/INSERT + column-scoped UPDATE', () => {
      assert.doesNotMatch(grantsSql, /GRANT ALL PRIVILEGES ON `<DB_NAME>`\.`audit_logs`/);
      assert.match(
        grantsSql,
        /GRANT SELECT, INSERT ON `<DB_NAME>`\.`audit_logs` TO '<APP_DB_USER>'@'<APP_DB_HOST>';/,
      );
      assert.match(
        grantsSql,
        /GRANT UPDATE \(`acknowledgedAt`, `acknowledgedById`\) ON `<DB_NAME>`\.`audit_logs`/,
      );
    });

    it('grants no table that schema.prisma does not declare (no stale lines)', () => {
      const granted = [
        ...grantsSql.matchAll(/GRANT ALL PRIVILEGES ON `<DB_NAME>`\.`([a-z_]+)`/g),
      ].map((m) => m[1]!);
      for (const table of granted) {
        assert.ok(schemaTables.includes(table), `grants script lists unknown table ${table}`);
      }
    });

    it('unconditionally revokes the blanket db-level grant using a temporary procedure and 1141 handler', () => {
      assert.doesNotMatch(grantsSql, /^GRANT\s+.*\s+ON\s+`<DB_NAME>`\.\*/m);
      assert.match(grantsSql, /CREATE PROCEDURE _sidata_revoke_blanket_db_grant\(\)/);
      assert.match(grantsSql, /DECLARE CONTINUE HANDLER FOR 1141 BEGIN END;/);
      assert.match(
        grantsSql,
        /'REVOKE ALL PRIVILEGES ON `', db_plain, '`\.\* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>'''/,
      );
      assert.match(
        grantsSql,
        /'REVOKE GRANT OPTION ON `', db_plain, '`\.\* FROM ''<APP_DB_USER>''@''<APP_DB_HOST>'''/,
      );
      // MySQL stores `_` escaped in db-level grants; the escaped spelling must be revoked too.
      assert.match(grantsSql, /'REVOKE ALL PRIVILEGES ON `', db_escaped, '`/);
      assert.match(grantsSql, /'REVOKE GRANT OPTION ON `', db_escaped, '`/);
      assert.match(grantsSql, /CALL _sidata_revoke_blanket_db_grant\(\);/);
      assert.match(grantsSql, /DROP PROCEDURE IF EXISTS _sidata_revoke_blanket_db_grant;/);
    });

    it('selects the database before creating any procedure (no ERROR 1046)', () => {
      const use = grantsSql.indexOf('USE `<DB_NAME>`;');
      const firstCreate = grantsSql.indexOf('CREATE PROCEDURE');
      assert.ok(use >= 0, 'script has a USE `<DB_NAME>` line');
      assert.ok(use < firstCreate, 'USE precedes the first CREATE PROCEDURE');
      const verifyUse = grantsSql.lastIndexOf('USE `<DB_NAME>`;');
      assert.ok(verifyUse < grantsSql.indexOf('CREATE PROCEDURE _sidata_verify'));
    });

    it('verifies post-condition that no blanket, wildcard, global or extra audit_logs grant remains', () => {
      assert.match(grantsSql, /CREATE PROCEDURE _sidata_verify_no_blanket_db_grant\(\)/);
      assert.match(grantsSql, /FROM information_schema\.SCHEMA_PRIVILEGES/);
      assert.match(grantsSql, /WHERE GRANTEE = app_grantee/);
      assert.match(
        grantsSql,
        /app_grantee VARCHAR\(400\) DEFAULT CONCAT\('''', '<APP_DB_USER>', '''@''', '<APP_DB_HOST>', ''''\)/,
      );
      assert.match(grantsSql, /'<DB_NAME>' LIKE TABLE_SCHEMA/);
      assert.match(
        grantsSql,
        /TABLE_SCHEMA IN \('<DB_NAME>', REPLACE\('<DB_NAME>', '_', '\\\\_'\)\)/,
      );
      assert.match(grantsSql, /FROM information_schema\.USER_PRIVILEGES/);
      assert.match(
        grantsSql,
        /PRIVILEGE_TYPE IN \('DELETE', 'UPDATE', 'DROP', 'ALTER', 'GRANT OPTION'\)/,
      );
      assert.match(grantsSql, /FROM information_schema\.TABLE_PRIVILEGES/);
      assert.match(grantsSql, /PRIVILEGE_TYPE NOT IN \('SELECT', 'INSERT'\)/);
      assert.match(grantsSql, /SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = failure_message;/);
      assert.match(grantsSql, /Revoke db-level grant on <DB_NAME>/);
      assert.match(grantsSql, /Revoke server-wide grant on \*\.\*/);
      assert.match(grantsSql, /Revoke extra table grant on <DB_NAME>\.audit_logs/);
      assert.match(grantsSql, /CALL _sidata_verify_no_blanket_db_grant\(\);/);
      assert.match(grantsSql, /DROP PROCEDURE IF EXISTS _sidata_verify_no_blanket_db_grant;/);
    });
  });

  describe('add_comparison_templates migration', () => {
    const migrationDirs = readdirSync(backendPath('prisma/migrations')).filter((d) =>
      d.endsWith('_add_comparison_templates'),
    );

    it('exists exactly once', () => {
      assert.equal(migrationDirs.length, 1);
    });

    const sql = stripSqlComments(
      migrationDirs[0] ? read(`prisma/migrations/${migrationDirs[0]}/migration.sql`) : '',
    );

    it('creates the comparison_templates table with the template text columns', () => {
      assert.match(sql, /CREATE TABLE `comparison_templates`/);
      for (const column of ['slug', 'label', 'body', 'trend_naik', 'trend_turun', 'trend_tetap']) {
        assert.match(sql, new RegExp(`\`${column}\` (VARCHAR\\(\\d+\\)|TEXT) NOT NULL`), column);
      }
      assert.match(sql, /UNIQUE INDEX `comparison_templates_slug_key`\(`slug`\)/);
    });

    it('adds a nullable comparison_template_id column to indicators', () => {
      assert.match(
        sql,
        /ALTER TABLE `indicators` ADD COLUMN `comparison_template_id` VARCHAR\(191\) NULL;/,
      );
    });

    it('uses RESTRICT for both FK actions (MySQL 3823: no CASCADE/SET NULL on a CHECK column)', () => {
      assert.match(
        sql,
        /ADD CONSTRAINT `indicators_comparison_template_id_fkey` FOREIGN KEY \(`comparison_template_id`\) REFERENCES `comparison_templates`\(`id`\) ON DELETE RESTRICT ON UPDATE RESTRICT/,
      );
    });

    it('adds the CHECK that a template needs a computed, fully paired indicator', () => {
      const check = sql.match(
        /ADD CONSTRAINT `check_indicators_comparison_template_paired` CHECK \(([^;]+)\);/,
      );
      assert.ok(check, 'CHECK constraint missing');
      const expr = check![1]!;
      assert.match(expr, /`comparison_template_id` IS NULL/);
      assert.match(expr, /`is_computed_comparison` = TRUE/);
      assert.match(expr, /`value_previous` IS NOT NULL/);
      assert.match(expr, /`period_previous` IS NOT NULL/);
    });
  });

  describe('add_media_lifecycle_columns migration', () => {
    const migrationDirs = readdirSync(backendPath('prisma/migrations')).filter((d) =>
      d.endsWith('_add_media_lifecycle_columns'),
    );

    it('exists', () => {
      assert.equal(migrationDirs.length, 1);
    });

    const sql = stripSqlComments(
      migrationDirs[0] ? read(`prisma/migrations/${migrationDirs[0]}/migration.sql`) : '',
    );

    it('adds cleanup_claimed_at and cleanup_quarantine_reason to media_assets and creates media_asset_references with RESTRICT FK', () => {
      assert.match(sql, /ADD COLUMN `cleanup_claimed_at` DATETIME\(3\) NULL/);
      assert.match(sql, /ADD COLUMN `cleanup_quarantine_reason` VARCHAR\(64\) NULL/);
      assert.match(sql, /CREATE TABLE `media_asset_references`/);
      assert.match(
        sql,
        /UNIQUE INDEX `media_asset_references_tuple_key`\(`reference_type`, `reference_id`, `slot`, `asset_id`\)/,
      );
      assert.match(sql, /INDEX `media_asset_references_asset_id_idx`\(`asset_id`\)/);
      assert.match(
        sql,
        /FOREIGN KEY \(`asset_id`\) REFERENCES `media_assets`\(`id`\) ON DELETE RESTRICT ON UPDATE RESTRICT/,
      );
    });
  });
});
