import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, fakeSupabase, resetFake, responses } from './testBuilder';

vi.mock('../lib/supabase', () => ({ supabase: fakeSupabase }));

const { addExpense, listExpenses, removeExpense, updateExpense } = await import('./expenses');

const EXPENSE = {
  id: 'e1',
  shift_id: 's1',
  description: 'Algodón',
  amount_pyg: 50000,
  created_at: '2026-11-10T14:00:00Z',
};

beforeEach(resetFake);

describe('listExpenses', () => {
  it("lists the shift's expenses, oldest first", async () => {
    responses.push({ data: [EXPENSE], error: null });
    await expect(listExpenses('s1')).resolves.toEqual([EXPENSE]);
    expect(calls).toContain('from(expenses)');
    expect(calls).toContain('eq(["shift_id","s1"])');
    expect(calls).toContain('order(["created_at",{"ascending":true}])');
  });

  it('returns an empty list when there are none', async () => {
    responses.push({ data: null, error: null });
    await expect(listExpenses('s1')).resolves.toEqual([]);
  });
});

describe('addExpense', () => {
  it('inserts the trimmed description and the amount', async () => {
    responses.push({ data: EXPENSE, error: null });
    await expect(addExpense('s1', '  Algodón ', 50000)).resolves.toEqual(EXPENSE);
    expect(calls).toContain('insert([{"shift_id":"s1","description":"Algodón","amount_pyg":50000}])');
  });

  it('rethrows the database error (e.g. shift_closed)', async () => {
    const failure = { code: 'P0001', message: 'shift_closed' };
    responses.push({ data: null, error: failure });
    await expect(addExpense('s1', 'x', 1)).rejects.toBe(failure);
  });
});

describe('updateExpense', () => {
  it('updates description and amount of the given expense', async () => {
    responses.push({ data: { ...EXPENSE, amount_pyg: 60000 }, error: null });
    await expect(updateExpense('e1', 'Algodón', 60000)).resolves.toMatchObject({ amount_pyg: 60000 });
    expect(calls).toContain('update([{"description":"Algodón","amount_pyg":60000}])');
    expect(calls).toContain('eq(["id","e1"])');
  });
});

describe('removeExpense', () => {
  it('deletes the given expense', async () => {
    responses.push({ data: null, error: null });
    await removeExpense('e1');
    expect(calls).toContain('delete([])');
    expect(calls).toContain('eq(["id","e1"])');
  });

  it('rethrows the database error', async () => {
    const failure = { code: 'P0001', message: 'shift_closed' };
    responses.push({ data: null, error: failure });
    await expect(removeExpense('e1')).rejects.toBe(failure);
  });
});
