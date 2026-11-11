// Test-only stand-in for the supabase-js query builder: every chained call
// is recorded and returns the builder; terminal calls (single, maybeSingle,
// await, rpc) resolve with the queued responses in order.
export const responses: Array<{ data: unknown; error: unknown }> = [];
export const calls: string[] = [];

const CHAIN = [
  'gte', 'lt', 'or',
  'select', 'insert', 'update', 'delete', 'eq', 'is', 'not', 'in', 'order', 'limit', 'ilike', 'like',
];

function next() {
  return Promise.resolve(responses.shift() ?? { data: null, error: null });
}

export function builder(table: string) {
  calls.push(`from(${table})`);
  const b: Record<string, unknown> = {};
  for (const name of CHAIN) {
    b[name] = (...args: unknown[]) => {
      calls.push(`${name}(${JSON.stringify(args)})`);
      return b;
    };
  }
  b.single = next;
  b.maybeSingle = next;
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    next().then(resolve, reject);
  return b;
}

export const fakeSupabase = {
  from: (table: string) => builder(table),
  rpc: (name: string, args: unknown) => {
    calls.push(`rpc(${name},${JSON.stringify(args)})`);
    return next();
  },
};

export function resetFake() {
  responses.length = 0;
  calls.length = 0;
}
