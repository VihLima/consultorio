/**
 * Cédula as the database normalizes it (`patients.cedula_norm`): only letters
 * and digits, so '1.234.567' and ' 1 234 567 ' match. Nothing left → null.
 */
export function normalizeCedula(input: string): string | null {
  const normalized = input.replace(/[^0-9A-Za-z]/g, '');
  return normalized === '' ? null : normalized;
}
