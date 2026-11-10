import { describe, expect, it } from 'vitest';
import { closeShiftErrorKey, isNetworkError, isNotFoundError } from './errors';

// What postgrest-js returns (as `error`) when fetch itself fails.
const OFFLINE = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };

describe('isNetworkError', () => {
  it('recognizes fetch failures, raw or wrapped by supabase-js', () => {
    expect(isNetworkError(OFFLINE)).toBe(true);
    expect(isNetworkError({ ...OFFLINE, message: 'FetchError: request failed' })).toBe(true);
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('is false for database errors and anything else', () => {
    expect(isNetworkError({ code: 'P0001', message: 'shift_closed' })).toBe(false);
    expect(isNetworkError({ code: '', message: 'TypeError: x' })).toBe(true);
    expect(isNetworkError({ code: '42501', message: 'TypeError: x' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError('offline')).toBe(false);
  });
});

describe('isNotFoundError', () => {
  it('is true for no row (.single()) and for an id that is not a uuid', () => {
    expect(isNotFoundError({ code: 'PGRST116', message: 'JSON object requested…' })).toBe(true);
    expect(isNotFoundError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(
      true,
    );
  });

  it('is false otherwise', () => {
    expect(isNotFoundError(OFFLINE)).toBe(false);
    expect(isNotFoundError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});

describe('closeShiftErrorKey', () => {
  it('maps an already closed shift to the read-only message', () => {
    expect(closeShiftErrorKey({ code: 'P0001', message: 'shift_closed' })).toBe('shift.readOnly');
  });

  it('maps fetch failures to the network message', () => {
    expect(closeShiftErrorKey(OFFLINE)).toBe('errors.network');
  });

  it('uses the generic message for anything else', () => {
    expect(closeShiftErrorKey({ code: 'PGRST116', message: 'no rows' })).toBe('errors.generic');
  });
});
