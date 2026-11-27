import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAppDbGrants } from '../../scripts/check-app-db-grants.js';

describe('evaluateAppDbGrants', () => {
  const adminTables = ['_prisma_migrations', 'users', 'roles', 'audit_logs'];

  it('returns ok when per-table grants cover every application table except _prisma_migrations', () => {
    const result = evaluateAppDbGrants({
      dbName: 'sidata',
      adminTables,
      appVisibleTables: ['users', 'roles', 'audit_logs'],
      appGrants: [
        'GRANT USAGE ON *.* TO `sidata_app`@`localhost`',
        'GRANT ALL PRIVILEGES ON `sidata`.`users` TO `sidata_app`@`localhost`',
        'GRANT ALL PRIVILEGES ON `sidata`.`roles` TO `sidata_app`@`localhost`',
        'GRANT SELECT, INSERT, UPDATE (`acknowledgedAt`, `acknowledgedById`) ON `sidata`.`audit_logs` TO `sidata_app`@`localhost`',
      ],
    });

    assert.equal(result.status, 'ok');
    assert.deepEqual(result.missingTables, []);
  });

  it('returns missing_grants when per-table grants exist but a newly migrated table is ungranted', () => {
    const result = evaluateAppDbGrants({
      dbName: 'sidata',
      adminTables: [...adminTables, 'new_feature_table'],
      appVisibleTables: ['users', 'roles', 'audit_logs'],
      appGrants: [
        'GRANT USAGE ON *.* TO `sidata_app`@`localhost`',
        'GRANT ALL PRIVILEGES ON `sidata`.`users` TO `sidata_app`@`localhost`',
        'GRANT SELECT, INSERT ON `sidata`.`audit_logs` TO `sidata_app`@`localhost`',
      ],
    });

    assert.equal(result.status, 'missing_grants');
    assert.deepEqual(result.missingTables, ['new_feature_table']);
  });

  it('returns uninitialized on a fresh install when runtime user only has USAGE', () => {
    const result = evaluateAppDbGrants({
      dbName: 'sidata',
      adminTables,
      appVisibleTables: [],
      appGrants: ['GRANT USAGE ON *.* TO `sidata_app`@`localhost`'],
    });

    assert.equal(result.status, 'uninitialized');
    assert.deepEqual(result.missingTables, ['audit_logs', 'roles', 'users']);
  });

  it('returns unhardened when a blanket database grant is still active (including escaped underscore)', () => {
    const result = evaluateAppDbGrants({
      dbName: 'sidata_prod',
      adminTables,
      appVisibleTables: ['users', 'roles', 'audit_logs'],
      appGrants: [
        'GRANT USAGE ON *.* TO `sidata_app`@`localhost`',
        'GRANT ALL PRIVILEGES ON `sidata\\_prod`.* TO `sidata_app`@`localhost`',
      ],
    });

    assert.equal(result.status, 'unhardened');
  });
});
