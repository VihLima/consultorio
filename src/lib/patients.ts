/**
 * Cédula as the database normalizes it (`patients.cedula_norm`): only letters
 * and digits, uppercased, so '1.234.567' and ' 1 234 567 ' match, and so do
 * 'ab-12' and 'AB12'. Nothing left → null.
 */
export function normalizeCedula(input: string): string | null {
  const normalized = input.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return normalized === '' ? null : normalized;
}

/**
 * Accented letters folded for name search, and what each becomes (same
 * position). MUST stay identical to the `translate(...)` lists of the
 * generated column `patients.full_name_search` in the migration (a test
 * compares them).
 */
export const SEARCH_FOLD_FROM = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇáàâãäéèêëíìîïóòôõöúùûüñç';
export const SEARCH_FOLD_TO = 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc';

const FOLD = new Map([...SEARCH_FOLD_FROM].map((char, i) => [char, SEARCH_FOLD_TO[i]]));

/**
 * Search text compared loosely, the way `patients.full_name_search` is
 * computed (`lower(translate(full_name, FROM, TO))`), plus trimmed:
 * 'José Ñandú' → 'jose nandu'.
 */
export function normalizeSearch(input: string): string {
  return [...input.normalize('NFC').trim()]
    .map((char) => FOLD.get(char) ?? char)
    .join('')
    .toLowerCase();
}

/** Active = has an open consultation; Archived = has none. */
export function patientStatus(hasOpenConsultation: boolean): 'active' | 'archived' {
  return hasOpenConsultation ? 'active' : 'archived';
}

/**
 * Escapes the LIKE/ILIKE wildcards (`%`, `_`) and the escape character so user
 * text matches literally inside a pattern. Values go through supabase-js
 * filter methods (`.ilike()`, `.like()`), not an `or=(…)` string, so commas
 * and parentheses need no escaping.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
