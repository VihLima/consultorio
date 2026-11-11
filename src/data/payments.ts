import { supabase } from '../lib/supabase';
import type { Payment, PaymentMethod } from '../lib/types';
import { getOpenShift } from './shifts';

const COLUMNS = 'id, patient_id, consultation_id, shift_id, amount_pyg, method, paid_at';

/** Same shape as the database errors, so callers check it with hasDbMessage. */
const NO_OPEN_SHIFT = { message: 'no_open_shift' };

// The database accepts a payment only in an open shift and removes one only
// while its shift is open (`shift_closed`); errors are rethrown unchanged.

/** A patient's payments, most recent first. */
export async function listPatientPayments(patientId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(COLUMNS)
    .eq('patient_id', patientId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Payment[];
}

/** A payment of the pending balance, received now in the open shift. */
export async function addPayment(
  patientId: string,
  amount: number,
  method: PaymentMethod,
): Promise<Payment> {
  const shift = await getOpenShift();
  if (!shift) throw NO_OPEN_SHIFT;
  const { data, error } = await supabase
    .from('payments')
    .insert({ patient_id: patientId, shift_id: shift.id, amount_pyg: amount, method })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Payment;
}

/** Removes a payment taken by mistake (only while its shift is open). */
export async function removePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}

export interface ShiftPayment extends Payment {
  patient_name: string;
}

/** Money received in a shift (its income), in the order it was received. */
export async function listShiftPayments(shiftId: string): Promise<ShiftPayment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`${COLUMNS}, patients (full_name)`)
    .eq('shift_id', shiftId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Payment & { patients: { full_name: string } }>;
  return rows.map(({ patients, ...payment }) => ({ ...payment, patient_name: patients.full_name }));
}
