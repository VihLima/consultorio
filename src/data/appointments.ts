import { supabase } from '../lib/supabase';
import type { Appointment, AgendaConsultation } from '../lib/agenda';

const COLUMNS = 'id, patient_id, scheduled_at, note, cancelled_at, patients (full_name, phone)';

type AppointmentRow = Omit<Appointment, 'patient_name' | 'patient_phone'> & {
  patients: { full_name: string; phone: string | null };
};

function toAppointment({ patients, ...row }: AppointmentRow): Appointment {
  return { ...row, patient_name: patients.full_name, patient_phone: patients.phone };
}

/** Appointments scheduled in [fromIso, toIso), cancelled ones included, by time. */
export async function listAppointments(fromIso: string, toIso: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(COLUMNS)
    .gte('scheduled_at', fromIso)
    .lt('scheduled_at', toIso)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as AppointmentRow[]).map(toAppointment);
}

export async function createAppointment(
  patientId: string,
  scheduledAtIso: string,
  note: string,
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({ patient_id: patientId, scheduled_at: scheduledAtIso, note: note.trim() || null })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toAppointment(data as unknown as AppointmentRow);
}

/** Marks it cancelled (it stays in the agenda, struck through). */
export async function cancelAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

type ConsultationRow = Omit<AgendaConsultation, 'patient_name'> & { patients: { full_name: string } };

/**
 * Consultations to show in [fromIso, toIso): finished ones by closing time,
 * plus every open one (shown on the day it was started).
 */
export async function listAgendaConsultations(fromIso: string, toIso: string): Promise<AgendaConsultation[]> {
  const columns = 'id, patient_id, status, started_at, closed_at, patients (full_name)';
  const [closed, open] = await Promise.all([
    supabase
      .from('consultations')
      .select(columns)
      .eq('status', 'closed')
      .gte('closed_at', fromIso)
      .lt('closed_at', toIso),
    supabase.from('consultations').select(columns).eq('status', 'open'),
  ]);
  if (closed.error) throw closed.error;
  if (open.error) throw open.error;
  const rows = [...(closed.data ?? []), ...(open.data ?? [])] as unknown as ConsultationRow[];
  return rows.map(({ patients, ...row }) => ({ ...row, patient_name: patients.full_name }));
}
