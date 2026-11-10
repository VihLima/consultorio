export const HOME_PATH = '/inicio';

/**
 * Where to go after signing in: the route RequireAuth saved in
 * `location.state.from`, or /inicio. Only same-app paths are accepted:
 * "//host" and "/\host" (browsers and react-router ≤ 7.17 read a backslash
 * as a slash, GHSA-wrjc-x8rr-h8h6) would leave the app.
 */
export function loginDestination(state: unknown): string {
  const from = (state as { from?: unknown } | null | undefined)?.from;
  return typeof from === 'string' && /^\/(?![/\\])/.test(from) ? from : HOME_PATH;
}
