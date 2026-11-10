import type { Consultation } from './types';

/**
 * A save was refused because the consultation is no longer open. Given the
 * consultation as the server has it now, decides what that means for the
 * text (and amount) on screen:
 * - 'not-closed': it could not be read or is not closed — report the error as usual;
 * - 'done': the server already holds exactly this text (and amount, when one
 *   is being saved) — e.g. our own close whose response was lost; safe to leave;
 * - 'lost': it was closed with other content — what is on screen was NOT saved
 *   and must stay on screen (and in the local draft).
 * `amount` is null when the action does not save an amount (Volver).
 */
export function closedOutcome(
  fresh: Pick<Consultation, 'status' | 'clinical_history' | 'amount_pyg'> | null,
  history: string,
  amount: number | null,
): 'not-closed' | 'done' | 'lost' {
  if (!fresh || fresh.status !== 'closed') return 'not-closed';
  const sameText = fresh.clinical_history === history;
  const sameAmount = amount === null || fresh.amount_pyg === amount;
  return sameText && sameAmount ? 'done' : 'lost';
}
