import { supabase } from '../lib/supabase';
import { shiftTotals, type ShiftTotals } from '../lib/totals';
import type { Consultation, Shift } from '../lib/types';
import { getOpenShift } from './shifts';

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

export async function getConsultation(id: string): Promise<Consultation> {
  const { data, error } = await supabase
    .from('consultations')
    .select(CONSULTATION_COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Consultation;
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

/**
 * Saves the clinical history of an open consultation. A closed one is refused
 * by the `consultations_guard` trigger (`consultation_closed`). If no row was
 * updated at all (not visible to this user, or gone), that is reported as
 * `consultation_not_open` — never as a successful save.
 */
export async function saveConsultationDraft(id: string, clinical_history: string): Promise<void> {
  const { data, error } = await supabase
    .from('consultations')
    .update({ clinical_history })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw { message: 'consultation_not_open' };
}

/** Closes the consultation in the open shift (RPC); errors keep the database message. */
export async function closeConsultation(id: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('close_consultation', {
    p_consultation_id: id,
    p_amount: amount,
  });
  if (error) throw error;
}

export type ClosedConsultation = Consultation & { file_count: number };

/** A patient's finished consultations, most recent first, with their number of files. */
export async function listClosedConsultations(patientId: string): Promise<ClosedConsultation[]> {
  const { data, error } = await supabase
    .from('consultations')
    .select(`${CONSULTATION_COLUMNS}, consultation_files (count)`)
    .eq('patient_id', patientId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<
    Consultation & { consultation_files: Array<{ count: number }> }
  >;
  return rows.map(({ consultation_files: files, ...consultation }) => ({
    ...consultation,
    file_count: files[0]?.count ?? 0,
  }));
}

export interface ShiftIncome {
  consultation_id: string;
  patient_name: string;
  closed_at: string;
  amount_pyg: number;
}

/**
 * Income of a shift: the consultations finished in it (each consultation has
 * a single `shift_id`, so it is never counted twice), in closing order.
 */
export async function listShiftIncomes(shiftId: string): Promise<ShiftIncome[]> {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, closed_at, amount_pyg, patients (full_name)')
    .eq('shift_id', shiftId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    closed_at: string;
    amount_pyg: number;
    patients: { full_name: string };
  }>;
  return rows.map((row) => ({
    consultation_id: row.id,
    patient_name: row.patients.full_name,
    closed_at: row.closed_at,
    amount_pyg: row.amount_pyg,
  }));
}

export type ShiftSummaryRow = Shift & ShiftTotals;

/**
 * Closed shifts, most recent first, with their totals. One request: the
 * amounts of the shift's closed consultations and expenses come embedded and
 * are added up here.
 */
export async function listShiftSummaries(): Promise<ShiftSummaryRow[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id, opened_at, closed_at, consultations (amount_pyg), expenses (amount_pyg)')
    .eq('consultations.status', 'closed')
    .not('closed_at', 'is', null)
    .order('opened_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<
    Shift & {
      consultations: Array<{ amount_pyg: number }>;
      expenses: Array<{ amount_pyg: number }>;
    }
  >;
  return rows.map(({ consultations, expenses, ...shift }) => ({
    ...shift,
    ...shiftTotals(
      consultations.map((c) => c.amount_pyg),
      expenses.map((e) => e.amount_pyg),
    ),
  }));
}

/**
 * Reactivation: a new blank consultation for an archived patient. Requires an
 * open shift — resolves to null (nothing created) when there is none.
 */
export async function reactivatePatient(patientId: string): Promise<Consultation | null> {
  const shift = await getOpenShift();
  if (!shift) return null;
  return startConsultation(patientId);
}
