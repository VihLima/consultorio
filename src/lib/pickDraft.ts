import type { Draft } from './draftStore';

/**
 * Chooses what the consultation form shows on open: the server text, or a
 * local draft that is newer than it. A local draft is newer only when it was
 * edited from exactly the text the server still has (`base === serverText`)
 * and differs from it; if the server changed since (saved later, here or on
 * another device), the local text is stale and the server wins. The amount is
 * stored only on the device, so it always comes from the local draft.
 */
export function pickDraft(
  serverText: string,
  local: Draft | null,
): { clinical_history: string; amount: string; restored: boolean } {
  if (!local) return { clinical_history: serverText, amount: '', restored: false };
  const newer = local.base === serverText && local.clinical_history !== serverText;
  return {
    clinical_history: newer ? local.clinical_history : serverText,
    amount: local.amount,
    restored: newer,
  };
}
