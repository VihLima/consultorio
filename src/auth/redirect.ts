export const HOME_PATH = '/inicio';

/**
 * Where to go after signing in: the route RequireAuth saved in
 * `location.state.from`, or /inicio. Only same-app paths are accepted.
 */
export function loginDestination(state: unknown): string {
  const from = (state as { from?: unknown } | null | undefined)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : HOME_PATH;
}
