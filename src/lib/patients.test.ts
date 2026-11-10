import { describe, expect, it } from 'vitest';
import { normalizeCedula } from './patients';

describe('normalizeCedula', () => {
  it('keeps only letters and digits', () => {
    expect(normalizeCedula('1.234.567')).toBe('1234567');
    expect(normalizeCedula(' 1 234 567 ')).toBe('1234567');
    expect(normalizeCedula('1-234.567a')).toBe('1234567a');
  });

  it('returns null when nothing is left', () => {
    expect(normalizeCedula('')).toBeNull();
    expect(normalizeCedula(' . ')).toBeNull();
  });
});
