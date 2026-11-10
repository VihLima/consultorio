import { supabase } from '../lib/supabase';
import { normalizeCedula } from '../lib/patients';
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
