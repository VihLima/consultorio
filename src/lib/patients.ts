/**
 * Cédula as the database normalizes it (`patients.cedula_norm`): only letters
 * and digits, so '1.234.567' and ' 1 234 567 ' match. Nothing left → null.
 */
export function normalizeCedula(input: string): string | null {
  const normalized = input.replace(/[^0-9A-Za-z]/g, '');
  return normalized === '' ? null : normalized;
}

/** Search text compared loosely: trimmed, lowercase, without accents ('José Ñandú' → 'jose nandu'). */
export function normalizeSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
