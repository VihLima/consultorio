import { supabase } from '../lib/supabase';
import type { Consultation } from '../lib/types';

export const CONSULTATION_COLUMNS =
  'id, patient_id, shift_id, clinical_history, amount_pyg, status, started_at, closed_at';

/** Postgres unique_violation: `consultations_one_open` already has an open consultation. */
const UNIQUE_VIOLATION = '23505';

/**
 * True when a Supabase/Postgres error carries the given message — the names
 * raised by the triggers and the RPC (`no_open_shift`, `consultation_not_open`,
 * `invalid_amount`, `consultation_closed`, …).
 */
export function hasDbMessage(error: unknown, name: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    (error as { message: unknown }).message === name
  );
}

export async function getOpenConsultation(patientId: string): Promise<Consultation | null> {
  const { data, error } = await supabase
    .from('consultations')
    .select(CONSULTATION_COLUMNS)
    .eq('patient_id', patientId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw error;
  return data as Consultation | null;
}

/**
 * Opens a consultation for the patient. If one is already open (double tap,
 * second device), the unique index rejects the insert and that one is returned.
 */
export async function startConsultation(patientId: string): Promise<Consultation> {
  const { data, error } = await supabase
    .from('consultations')
    .insert({ patient_id: patientId })
    .select(CONSULTATION_COLUMNS)
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const open = await getOpenConsultation(patientId);
      if (open) return open;
    }
    throw error;
  }
  return data as Consultation;
}

export async function saveConsultationDraft(id: string, clinical_history: string): Promise<void> {
  const { error } = await supabase.from('consultations').update({ clinical_history }).eq('id', id);
  if (error) throw error;
}

/** Closes the consultation in the open shift (RPC); errors keep the database message. */
export async function closeConsultation(id: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('close_consultation', {
    p_consultation_id: id,
    p_amount: amount,
  });
  if (error) throw error;
}
