import { supabase } from '../lib/supabase';
import { escapeLike, normalizeCedula, normalizeSearch, patientStatus } from '../lib/patients';
import type { Patient } from '../lib/types';

export const PATIENT_COLUMNS = 'id, full_name, birth_date, cedula';

/** Postgres unique_violation: `patients_cedula` already has this normalized cédula. */
export const DUPLICATE_CEDULA = '23505';

export interface PatientInput {
  full_name: string;
  /** 'aaaa-mm-dd' straight from <input type="date">, or null. */
  birth_date: string | null;
  cedula: string | null;
}

function clean(input: PatientInput) {
  const cedula = input.cedula?.trim() ?? '';
  return {
    full_name: input.full_name.trim(),
    birth_date: input.birth_date || null,
    cedula: cedula === '' ? null : cedula,
  };
}

/** Throws the Postgres error; code 23505 means the cédula is already registered. */
export async function createPatient(input: PatientInput): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .insert(clean(input))
    .select(PATIENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as Patient;
}

export async function updatePatient(id: string, input: PatientInput): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .update(clean(input))
    .eq('id', id)
    .select(PATIENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as Patient;
}

export async function getPatient(id: string): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Patient;
}

/** Patient whose normalized cédula matches (`cedula_norm`), or null. */
export async function findPatientByCedula(cedula: string): Promise<Patient | null> {
  const normalized = normalizeCedula(cedula);
  if (normalized === null) return null;
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_COLUMNS)
    .eq('cedula_norm', normalized)
    .maybeSingle();
  if (error) throw error;
  return data as Patient | null;
}

/** Patients with an open consultation (status Active), oldest consultation first. */
export async function listActivePatients(): Promise<Array<Patient & { consultation_id: string }>> {
  const { data, error } = await supabase
    .from('consultations')
    .select(`id, patients (${PATIENT_COLUMNS})`)
    .eq('status', 'open')
    .order('started_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ id: string; patients: Patient }>;
  return rows.map((row) => ({ ...row.patients, consultation_id: row.id }));
}

const SEARCH_LIMIT = 50;

/**
 * Patients plus their open consultation (if any): the embedded filter limits
 * `consultations` to open ones without filtering the patients themselves.
 */
const WITH_OPEN_CONSULTATION = `${PATIENT_COLUMNS}, consultations (id)`;

type PatientRow = Patient & { consultations: Array<{ id: string }> };

function toPatient({ consultations: _open, ...patient }: PatientRow): Patient {
  return patient;
}

export type PatientWithStatus = Patient & { status: 'active' | 'archived' };

/**
 * Search by part of the name (`ilike`, accent-sensitive) or by the start of
 * the cédula (`cedula_norm` prefix, only when the text has digits).
 * Merged, alphabetical, at most 50; names starting with the text come first.
 */
export async function searchPatients(query: string): Promise<PatientWithStatus[]> {
  const text = query.trim();
  if (text === '') return [];

  const byName = supabase
    .from('patients')
    .select(WITH_OPEN_CONSULTATION)
    .eq('consultations.status', 'open')
    .ilike('full_name', `%${escapeLike(text)}%`)
    .order('full_name', { ascending: true })
    .limit(SEARCH_LIMIT);

  const cedula = /\d/.test(text) ? normalizeCedula(text) : null;
  const byCedula = cedula
    ? supabase
        .from('patients')
        .select(WITH_OPEN_CONSULTATION)
        .eq('consultations.status', 'open')
        .like('cedula_norm', `${escapeLike(cedula)}%`)
        .order('full_name', { ascending: true })
        .limit(SEARCH_LIMIT)
    : null;

  const results = await Promise.all(byCedula ? [byName, byCedula] : [byName]);
  const rows = new Map<string, PatientRow>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of (data ?? []) as unknown as PatientRow[]) rows.set(row.id, row);
  }

  const needle = normalizeSearch(text);
  const startsWith = (row: PatientRow) => normalizeSearch(row.full_name).startsWith(needle);
  return [...rows.values()]
    .sort(
      (a, b) =>
        Number(startsWith(b)) - Number(startsWith(a)) ||
        a.full_name.localeCompare(b.full_name, 'es'),
    )
    .slice(0, SEARCH_LIMIT)
    .map((row) => ({ ...toPatient(row), status: patientStatus(row.consultations.length > 0) }));
}

/** Patients without an open consultation (Archived), alphabetically. */
export async function listArchivedPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from('patients')
    .select(WITH_OPEN_CONSULTATION)
    .eq('consultations.status', 'open')
    // No open consultation left after the embedded filter (anti-join).
    .is('consultations', null)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as PatientRow[]).map(toPatient);
}
