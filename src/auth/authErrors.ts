import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

export type AuthErrorKey = 'errors.invalidCredentials' | 'errors.network' | 'errors.generic';

/** Maps a Supabase sign-in error to a translation key (never raw Supabase text). */
export function signInErrorKey(error: unknown): AuthErrorKey {
  // Network down / server unreachable: supabase-js wraps fetch failures in this class.
  if (isAuthRetryableFetchError(error) || error instanceof TypeError) return 'errors.network';
  if (isAuthApiError(error)) {
    // Older GoTrue versions send a bare 400 without an error code.
    if (error.code === 'invalid_credentials' || (!error.code && error.status === 400)) {
      return 'errors.invalidCredentials';
    }
  }
  return 'errors.generic';
}
