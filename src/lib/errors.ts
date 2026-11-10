function field(error: unknown, name: 'code' | 'message'): unknown {
  return error !== null && typeof error === 'object' ? (error as Record<string, unknown>)[name] : undefined;
}

/**
 * The request never reached the server (offline, DNS, CORS…). postgrest-js
 * does not throw then: it returns an error with an empty `code` and the fetch
 * error as the message ("TypeError: Failed to fetch").
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = field(error, 'message');
  return (
    field(error, 'code') === '' &&
    typeof message === 'string' &&
    /^(TypeError|FetchError|AbortError)\b/.test(message)
  );
}

/**
 * The row does not exist for this user: `.single()` found no row (PGRST116),
 * or the id in the address is not a uuid at all (22P02).
 */
export function isNotFoundError(error: unknown): boolean {
  const code = field(error, 'code');
  return code === 'PGRST116' || code === '22P02';
}

/** Message for a failed "close shift". */
export function closeShiftErrorKey(
  error: unknown,
): 'shift.readOnly' | 'errors.network' | 'errors.generic' {
  // Closed meanwhile (another tab or device): shifts_guard_update refuses it.
  if (field(error, 'message') === 'shift_closed') return 'shift.readOnly';
  if (isNetworkError(error)) return 'errors.network';
  return 'errors.generic';
}
