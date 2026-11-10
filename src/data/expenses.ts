import { supabase } from '../lib/supabase';
import type { Expense } from '../lib/types';

const COLUMNS = 'id, shift_id, description, amount_pyg, created_at';

// Expenses of a closed shift are rejected by the database (`shift_closed`);
// every function rethrows the error unchanged so the caller can tell.

/** The shift's expenses, in the order they were entered. */
export async function listExpenses(shiftId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(COLUMNS)
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function addExpense(
  shiftId: string,
  description: string,
  amount: number,
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ shift_id: shiftId, description: description.trim(), amount_pyg: amount })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function updateExpense(
  id: string,
  description: string,
  amount: number,
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update({ description: description.trim(), amount_pyg: amount })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function removeExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}
