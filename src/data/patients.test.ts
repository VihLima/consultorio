import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, fakeSupabase, resetFake, responses } from './testBuilder';

vi.mock('../lib/supabase', () => ({ supabase: fakeSupabase }));

const { createPatient, findPatientByCedula, listActivePatients, listArchivedPatients, searchPatients } =
  await import('./patients');

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

describe('searchPatients', () => {
  it('searches by name only when the text has no digits, with status', async () => {
    responses.push({
      data: [
        { ...PATIENT, consultations: [{ id: 'c1' }] },
        { id: 'p2', full_name: 'Anabel', birth_date: null, cedula: null, consultations: [] },
      ],
      error: null,
    });
    await expect(searchPatients('  an%a ')).resolves.toEqual([
      { ...PATIENT, status: 'active' },
      { id: 'p2', full_name: 'Anabel', birth_date: null, cedula: null, status: 'archived' },
    ]);
    // pattern %an\%a% (JSON-encoded in the recorded call)
    expect(calls).toContain('ilike(["full_name","%an\\\\%a%"])');
    expect(calls).toContain('eq(["consultations.status","open"])');
    expect(calls).toContain('limit([50])');
    expect(calls.filter((c) => c.startsWith('from('))).toHaveLength(1);
  });

  it('also matches the normalized cédula by prefix and merges without duplicates', async () => {
    responses.push({ data: [], error: null }); // by name
    responses.push({ data: [{ ...PATIENT, consultations: [] }], error: null }); // by cédula
    await expect(searchPatients('1.234')).resolves.toEqual([{ ...PATIENT, status: 'archived' }]);
    expect(calls.some((c) => c.startsWith('like('))).toBe(false);
    expect(calls).toContain('ilike(["cedula_norm","1234%"])');
  });

  it('does not query for blank text', async () => {
    await expect(searchPatients('   ')).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('listArchivedPatients', () => {
  it('keeps patients without an open consultation, alphabetically', async () => {
    responses.push({ data: [{ ...PATIENT, consultations: [] }], error: null });
    await expect(listArchivedPatients()).resolves.toEqual([PATIENT]);
    expect(calls).toContain('eq(["consultations.status","open"])');
    expect(calls).toContain('is(["consultations",null])');
    expect(calls).toContain('order(["full_name",{"ascending":true}])');
  });
});
