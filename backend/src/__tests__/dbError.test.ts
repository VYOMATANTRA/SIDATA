import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { describeDbConnectionFailure, formatDbConnectionFailure } from '../utils/dbError.js';

/** Mirrors the shape the MariaDB driver adapter produces for a failed connection. */
function adapterError(cause: unknown, originalMessage = 'pool timeout') {
  return {
    name: 'PrismaClientKnownRequestError',
    message: originalMessage,
    meta: {
      driverAdapterError: {
        originalCode: '45028',
        originalMessage,
        kind: 'mysql',
        code: '45028',
        state: 'HY000',
        cause,
      },
    },
  };
}

describe('describeDbConnectionFailure', () => {
  it('reports the real reason behind the pool timeout', () => {
    // The driver sets the innermost cause to a plain string, not an Error.
    const error = adapterError('connect ECONNREFUSED 127.0.0.1:3306');

    const failure = describeDbConnectionFailure(error);

    assert.ok(failure);
    assert.equal(failure.reason, 'connect ECONNREFUSED 127.0.0.1:3306');
    assert.equal(failure.code, '45028');
    assert.equal(failure.retryable, true);
  });

  it('marks a refused connection as retryable and a rejected credential as not', () => {
    const refused = describeDbConnectionFailure(
      adapterError('connect ECONNREFUSED 127.0.0.1:3306'),
    );
    const denied = describeDbConnectionFailure(
      adapterError(
        "(conn:190, no: 1045, SQLState: 28000) Access denied for user 'root'@'localhost' (using password: YES)",
      ),
    );

    assert.equal(refused?.retryable, true);
    assert.equal(denied?.retryable, false);
    assert.match(denied?.reason ?? '', /Access denied/);
  });

  it('ignores errors that are not connection failures', () => {
    const unrelated = {
      name: 'PrismaClientKnownRequestError',
      message: 'Unique constraint failed on the fields: (`email`)',
      meta: { driverAdapterError: { originalCode: 'P2002', code: 'P2002' } },
    };

    assert.equal(describeDbConnectionFailure(unrelated), null);
    assert.equal(describeDbConnectionFailure(new Error('boom')), null);
  });
});

describe('formatDbConnectionFailure', () => {
  it('points at MySQL when the database is unreachable', () => {
    const failure = describeDbConnectionFailure(
      adapterError('connect ECONNREFUSED 127.0.0.1:3306'),
    );

    assert.ok(failure);
    const message = formatDbConnectionFailure(failure);
    assert.match(message, /ECONNREFUSED/);
    assert.match(message, /MySQL/);
  });

  it('points at the credentials when the connection is rejected', () => {
    const failure = describeDbConnectionFailure(
      adapterError(
        "(conn:190, no: 1045, SQLState: 28000) Access denied for user 'root'@'localhost' (using password: YES)",
      ),
    );

    assert.ok(failure);
    const message = formatDbConnectionFailure(failure);
    assert.match(message, /kredensial/);
    assert.match(message, /DATABASE_URL/);
  });
});
