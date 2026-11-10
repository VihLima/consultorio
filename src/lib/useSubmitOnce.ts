import { useCallback, useRef, useState } from 'react';

/**
 * Wraps an async action so a double tap runs it once: calls made while it is
 * still running resolve to undefined without calling `fn`. Errors from `fn`
 * are rethrown to the caller.
 */
export function useSubmitOnce<T>(fn: () => Promise<T>): {
  run(): Promise<T | undefined>;
  busy: boolean;
} {
  const [busy, setBusy] = useState(false);
  // The state update lands after the next render; the ref blocks a second
  // call that arrives before that.
  const busyRef = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fnRef.current();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
