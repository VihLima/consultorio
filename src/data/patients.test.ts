import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, fakeSupabase, resetFake, responses } from './testBuilder';

vi.mock('../lib/supabase', () => ({ supabase: fakeSupabase }));

const { createPatient, findPatientByCedula, listActivePatients } = await import('./patients');

const PATIENT = { id: 'p1', full_name: 'Ana', birth_date: null, cedula: '1.234.567' };

beforeEach(resetFake);

describe('findPatientByCedula', () => {
  it('looks up the normalized cédula', async () => {
    responses.push({ data: PATIENT, error: null });
    await expect(findPatientByCedula(' 1.234.567 ')).resolves.toEqual(PATIENT);
    expect(calls).toContain('eq(["cedula_norm","1234567"])');
  });

  it('returns null without querying when the cédula is empty', async () => {
    await expect(findPatientByCedula(' . ')).resolves.toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('createPatient', () => {
  it('trims the name and stores empty cédula as null', async () => {
    responses.push({ data: PATIENT, error: null });
    await createPatient({ full_name: '  Ana ', birth_date: null, cedula: '  ' });
    expect(calls).toContain('insert([{"full_name":"Ana","birth_date":null,"cedula":null}])');
  });
});

describe('listActivePatients', () => {
  it('flattens open consultations into patients with consultation_id', async () => {
    responses.push({ data: [{ id: 'c1', patients: PATIENT }], error: null });
    await expect(listActivePatients()).resolves.toEqual([{ ...PATIENT, consultation_id: 'c1' }]);
    expect(calls).toContain('eq(["status","open"])');
  });
});
