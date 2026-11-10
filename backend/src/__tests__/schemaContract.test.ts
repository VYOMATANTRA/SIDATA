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

    it('conditionally revokes the blanket db grant via information_schema.SCHEMA_PRIVILEGES without restoring blanket SELECT', () => {
      assert.doesNotMatch(grantsSql, /GRANT\s+SELECT\s+ON\s+`<DB_NAME>`\.\*/i);
      assert.match(grantsSql, /information_schema\.SCHEMA_PRIVILEGES/);
      assert.match(grantsSql, /PREPARE\s+revoke_db_grant\s+FROM\s+@revoke_stmt/);
      assert.match(grantsSql, /EXECUTE\s+revoke_db_grant/);
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
