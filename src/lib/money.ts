// Single place for formatting and parsing money (guaraníes, whole numbers).

const SYMBOL = '₲';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 150000 → "₲ 150.000". Negative values (e.g. a balance) → "₲ -80.000". */
export function formatPyg(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${SYMBOL} ${sign}${groupThousands(String(Math.abs(rounded)))}`;
}

/**
 * Parses what the user typed ("150.000", "150 000", "₲150.000", "150,000").
 * Guaraníes have no decimals, so every non-digit is treated as a separator.
 * Returns null for empty input, input without digits, or a negative sign.
 */
export function parsePyg(input: string): number | null {
  if (input.includes('-')) return null;
  const digits = input.replace(/\D/g, '');
  if (digits === '') return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
