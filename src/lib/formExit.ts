/**
 * Volver on the patient form while the name is empty:
 * - 'leave': a new form (no patient yet) without clinical text — nothing to keep;
 * - 'confirm-discard': a new form with clinical text — it cannot be saved
 *   without a name and is never dropped silently: ask for the name or an
 *   explicit discard;
 * - 'name-required': an existing patient — the name must be filled back in.
 */
export function unnamedBack(
  hasPatient: boolean,
  history: string,
): 'leave' | 'confirm-discard' | 'name-required' {
  if (hasPatient) return 'name-required';
  return history.trim() === '' ? 'leave' : 'confirm-discard';
}

/**
 * "Open existing patient" from a patient this form just created: true when
 * its consultation holds nothing worth saving — no text on screen or on the
 * server, no amount and no stored file (`storedFiles` null = could not check).
 */
export function nothingToKeep(state: {
  history: string;
  amount: string;
  serverText: string;
  storedFiles: number | null;
}): boolean {
  return (
    state.history.trim() === '' &&
    state.amount.trim() === '' &&
    state.serverText.trim() === '' &&
    state.storedFiles === 0
  );
}
