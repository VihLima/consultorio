import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, fakeSupabase, resetFake, responses } from './testBuilder';

vi.mock('../lib/supabase', () => ({ supabase: fakeSupabase }));

const { closeConsultation, hasDbMessage, startConsultation } = await import('./consultations');

const OPEN = {
  id: 'c1',
  patient_id: 'p1',
  shift_id: null,
  clinical_history: '',
  amount_pyg: null,
  status: 'open',
  started_at: '2026-11-10T12:00:00Z',
  closed_at: null,
};

beforeEach(resetFake);

describe('startConsultation', () => {
  it('returns the inserted consultation', async () => {
    responses.push({ data: OPEN, error: null });
    await expect(startConsultation('p1')).resolves.toEqual(OPEN);
    expect(calls).toContain('insert([{"patient_id":"p1"}])');
  });

  it('returns the already open consultation when the unique index rejects the insert', async () => {
    responses.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    responses.push({ data: OPEN, error: null });
    await expect(startConsultation('p1')).resolves.toEqual(OPEN);
    expect(calls).toContain('eq(["status","open"])');
  });
});

describe('closeConsultation', () => {
  it('calls the close_consultation RPC', async () => {
    responses.push({ data: null, error: null });
    await closeConsultation('c1', 150000);
    expect(calls).toContain('rpc(close_consultation,{"p_consultation_id":"c1","p_amount":150000})');
  });

  it('rethrows the database error so the caller can tell no_open_shift apart', async () => {
    const failure = { code: 'P0001', message: 'no_open_shift' };
    responses.push({ data: null, error: failure });
    const error = await closeConsultation('c1', 0).catch((e: unknown) => e);
    expect(error).toBe(failure);
    expect(hasDbMessage(error, 'no_open_shift')).toBe(true);
    expect(hasDbMessage(error, 'invalid_amount')).toBe(false);
    expect(hasDbMessage(new TypeError('Failed to fetch'), 'no_open_shift')).toBe(false);
  });
});
