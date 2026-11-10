import { describe, expect, it } from 'vitest';
import { escapeLike, normalizeCedula, normalizeSearch, patientStatus } from './patients';

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

describe('normalizeSearch', () => {
  it('trims, lowercases and removes accents', () => {
    expect(normalizeSearch('  José Ñandú ')).toBe('jose nandu');
    expect(normalizeSearch('   ')).toBe('');
  });
});

describe('patientStatus', () => {
  it('is active with an open consultation, archived otherwise', () => {
    expect(patientStatus(true)).toBe('active');
    expect(patientStatus(false)).toBe('archived');
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    // input 50%_a\b → output 50\%\_a\\b
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(escapeLike('Ana, María')).toBe('Ana, María');
  });
});
