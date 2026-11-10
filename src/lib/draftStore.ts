/** Unsaved consultation text kept on the device (survives reloads and offline saves). */
export interface Draft {
  clinical_history: string;
  amount: string;
  /** Consultation drafts: the server text this draft was edited from (see pickDraft). */
  base?: string;
  /** New-patient drafts (`draft:new`): the fixed data, so the text returns with its owner. */
  full_name?: string;
  birth_date?: string;
  cedula?: string;
}

const PREFIX = 'draft:';
const OPTIONAL_FIELDS = ['base', 'full_name', 'birth_date', 'cedula'] as const;

function isDraft(value: unknown): value is Draft {
  if (value === null || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.clinical_history === 'string' &&
    typeof draft.amount === 'string' &&
    OPTIONAL_FIELDS.every((field) => draft[field] === undefined || typeof draft[field] === 'string')
  );
}

/** Copies only the known fields (drops anything else stored under the key). */
function pickFields(draft: Draft): Draft {
  const result: Draft = { clinical_history: draft.clinical_history, amount: draft.amount };
  for (const field of OPTIONAL_FIELDS) {
    if (draft[field] !== undefined) result[field] = draft[field];
  }
  return result;
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
      return isDraft(parsed) ? pickFields(parsed) : null;
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
