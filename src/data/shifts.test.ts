import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal stand-in for the query builder: every chained call returns the
// builder, and the terminal calls resolve with the queued responses in order.
const responses: Array<{ data: unknown; error: unknown }> = [];
const calls: string[] = [];

function builder() {
  const next = () => Promise.resolve(responses.shift());
  const b: Record<string, unknown> = {};
  for (const name of ['select', 'insert', 'update', 'eq', 'is', 'not', 'order']) {
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

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => builder() },
}));

const { openShift, getOpenShift } = await import('./shifts');

const OPEN = { id: 's1', opened_at: '2026-11-10T11:00:00Z', closed_at: null };

beforeEach(() => {
  responses.length = 0;
  calls.length = 0;
});

describe('openShift', () => {
  it('returns the inserted shift', async () => {
    responses.push({ data: OPEN, error: null });
    await expect(openShift()).resolves.toEqual(OPEN);
  });

  it('returns the already open shift when the unique index rejects the insert', async () => {
    responses.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    responses.push({ data: OPEN, error: null });
    await expect(openShift()).resolves.toEqual(OPEN);
    expect(calls).toContain('is(["closed_at",null])');
  });

  it('rethrows any other error', async () => {
    const failure = { code: '42501', message: 'permission denied' };
    responses.push({ data: null, error: failure });
    await expect(openShift()).rejects.toBe(failure);
  });
});

describe('getOpenShift', () => {
  it('returns null when no shift is open', async () => {
    responses.push({ data: null, error: null });
    await expect(getOpenShift()).resolves.toBeNull();
  });
});
