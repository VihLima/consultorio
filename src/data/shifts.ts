import { supabase } from '../lib/supabase';
import type { Shift } from '../lib/types';

const COLUMNS = 'id, opened_at, closed_at';

/** Postgres unique_violation: `shifts_one_open` already has an open shift for this user. */
const UNIQUE_VIOLATION = '23505';

/** The logged-in user's open shift, if any (RLS limits rows to the user). */
export async function getOpenShift(): Promise<Shift | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select(COLUMNS)
    .is('closed_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as Shift | null;
}

/**
 * Opens a shift. If one is already open (double tap, second device), the
 * unique index rejects the insert and the existing open shift is returned.
 */
export async function openShift(): Promise<Shift> {
  const { data, error } = await supabase.from('shifts').insert({}).select(COLUMNS).single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const open = await getOpenShift();
      if (open) return open;
    }
    throw error;
  }
  return data as Shift;
}

export async function closeShift(id: string): Promise<Shift> {
  const { data, error } = await supabase
    .from('shifts')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Shift;
}

export async function getShift(id: string): Promise<Shift> {
  const { data, error } = await supabase.from('shifts').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data as Shift;
}
