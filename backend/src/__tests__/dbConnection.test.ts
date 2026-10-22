import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allowPublicKeyRetrievalFrom } from '../utils/dbConnection.js';

describe('allowPublicKeyRetrievalFrom', () => {
  it('stays off when the connection string says nothing', () => {
    const url = new URL('mysql://user:pass@localhost:3306/sidata');
    assert.equal(allowPublicKeyRetrievalFrom(url), false);
  });

  it('stays off for any value other than an explicit true', () => {
    for (const value of ['false', 'FALSE', '1', 'yes', '']) {
      const url = new URL(
        `mysql://user:pass@localhost:3306/sidata?allowPublicKeyRetrieval=${value}`,
      );
      assert.equal(allowPublicKeyRetrievalFrom(url), false, `value "${value}" must not enable it`);
    }
  });

  it('turns on only when the deployment asks for it explicitly', () => {
    const url = new URL('mysql://user:pass@localhost:3306/sidata?allowPublicKeyRetrieval=true');
    assert.equal(allowPublicKeyRetrievalFrom(url), true);
  });
});
