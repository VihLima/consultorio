import { describe, expect, it } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { signInErrorKey } from './authErrors';

describe('signInErrorKey', () => {
  it('maps wrong e-mail or password to errors.invalidCredentials', () => {
    expect(signInErrorKey(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'errors.invalidCredentials',
    );
    expect(signInErrorKey(new AuthApiError('Invalid login credentials', 400, undefined))).toBe(
      'errors.invalidCredentials',
    );
  });

  it('maps fetch failures to errors.network', () => {
    expect(signInErrorKey(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('errors.network');
    expect(signInErrorKey(new TypeError('Failed to fetch'))).toBe('errors.network');
  });

  it('maps anything else to errors.generic', () => {
    expect(signInErrorKey(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'))).toBe(
      'errors.generic',
    );
    expect(signInErrorKey(new Error('boom'))).toBe('errors.generic');
  });
});
