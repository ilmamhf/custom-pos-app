import { buildAuthAttemptKey, maskIdentifier } from './auth-attempt.util';

describe('auth attempt utilities', () => {
  it('normalizes endpoint, IP and identifier into a composite key', () => {
    expect(buildAuthAttemptKey('login', ' 127.0.0.1 ', 'Kasir@Toko.ID')).toBe(
      'login:127.0.0.1:kasir@toko.id',
    );
    expect(buildAuthAttemptKey('refresh', '127.0.0.1')).toBe('refresh:127.0.0.1');
    expect(buildAuthAttemptKey('login', '')).toBe('login:unknown');
  });

  it('masks emails without exposing the local part', () => {
    expect(maskIdentifier('kasir1@toko.id')).toBe('k***@toko.id');
    expect(maskIdentifier('owner@toko.id')).toBe('o***@toko.id');
  });

  it('masks non-email identifiers', () => {
    expect(maskIdentifier('abcd')).toBe('***');
    expect(maskIdentifier('store-1234')).toBe('st***34');
  });
});
