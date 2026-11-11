import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, fakeSupabase, resetFake, responses } from './testBuilder';

vi.mock('../lib/supabase', () => ({ supabase: fakeSupabase }));
vi.mock('./shifts', () => ({ getOpenShift: vi.fn() }));

const { getOpenShift } = await import('./shifts');
const { hasDbMessage } = await import('./consultations');
const { addPayment, listPatientPayments, listShiftPayments, removePayment } = await import('./payments');

const PAYMENT = {
  id: 'pay1',
  patient_id: 'p1',
  consultation_id: null,
  shift_id: 's1',
  amount_pyg: 50000,
  method: 'transfer',
  paid_at: '2026-11-11T14:00:00Z',
};

beforeEach(() => {
  resetFake();
  vi.mocked(getOpenShift).mockReset();
});

describe('listPatientPayments', () => {
  it("lists the patient's payments, newest first", async () => {
    responses.push({ data: [PAYMENT], error: null });
    await expect(listPatientPayments('p1')).resolves.toEqual([PAYMENT]);
    expect(calls).toContain('from(payments)');
    expect(calls).toContain('eq(["patient_id","p1"])');
    expect(calls).toContain('order(["paid_at",{"ascending":false}])');
  });
});

describe('addPayment', () => {
  it('records the payment in the open shift', async () => {
    vi.mocked(getOpenShift).mockResolvedValue({ id: 's1', opened_at: '2026-11-11T11:00:00Z', closed_at: null });
    responses.push({ data: PAYMENT, error: null });
    await expect(addPayment('p1', 50000, 'transfer')).resolves.toEqual(PAYMENT);
    expect(calls).toContain('insert([{"patient_id":"p1","shift_id":"s1","amount_pyg":50000,"method":"transfer"}])');
  });

  it('refuses without an open shift, without writing anything', async () => {
    vi.mocked(getOpenShift).mockResolvedValue(null);
    const error = await addPayment('p1', 50000, 'cash').catch((e: unknown) => e);
    expect(hasDbMessage(error, 'no_open_shift')).toBe(true);
    expect(calls).not.toContain('from(payments)');
  });
});

describe('removePayment', () => {
  it('rethrows shift_closed from the database', async () => {
    const failure = { code: 'P0001', message: 'shift_closed' };
    responses.push({ data: null, error: failure });
    await expect(removePayment('pay1')).rejects.toBe(failure);
    expect(calls).toContain('eq(["id","pay1"])');
  });
});

describe('listShiftPayments', () => {
  it("returns the shift's payments with the patient name, oldest first", async () => {
    responses.push({ data: [{ ...PAYMENT, patients: { full_name: 'Ana' } }], error: null });
    await expect(listShiftPayments('s1')).resolves.toEqual([{ ...PAYMENT, patient_name: 'Ana' }]);
    expect(calls).toContain('eq(["shift_id","s1"])');
    expect(calls).toContain('order(["paid_at",{"ascending":true}])');
  });
});
