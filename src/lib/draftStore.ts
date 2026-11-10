/** Unsaved consultation text kept on the device (survives reloads and offline saves). */
export interface Draft {
  clinical_history: string;
  amount: string;
}

const PREFIX = 'draft:';

function isDraft(value: unknown): value is Draft {
  if (value === null || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.clinical_history === 'string' && typeof draft.amount === 'string';
}

// localStorage can throw (private mode, quota, blocked storage): the local
// draft is a safety net, so failures there never break the form.
export const draftStore = {
  /** `key` is the consultation id, or 'new' before the consultation exists. */
  save(key: string, draft: Draft): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(draft));
    } catch {
      // ignore
    }
  },

  load(key: string): Draft | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isDraft(parsed)
        ? { clinical_history: parsed.clinical_history, amount: parsed.amount }
        : null;
    } catch {
      return null;
    }
  },

  clear(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // ignore
    }
  },
};
