/** Country code used when a number is typed in national format (Paraguay). */
export const DEFAULT_COUNTRY_CODE = '595';

/**
 * The number in international form, digits only, as WhatsApp expects it, or
 * null when it cannot be a phone number.
 *
 * - '+55 11 91234-5678' / '0055…' → kept as international ('5511912345678')
 * - '0981 123 456' (national, leading 0) → '595981123456'
 * - '981 123 456' (9 digits starting with 9, a Paraguayan mobile) → '595981123456'
 * - anything else is assumed to already carry its country code
 */
export function whatsappNumber(input: string): string | null {
  const text = input.trim();
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith('9')) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Link that opens a WhatsApp chat with this number, or null if it is not usable. */
export function whatsappUrl(input: string): string | null {
  const number = whatsappNumber(input);
  return number ? `https://wa.me/${number}` : null;
}
