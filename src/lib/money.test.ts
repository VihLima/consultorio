import { describe, expect, it } from 'vitest';
import { formatPyg, parsePyg } from './money';

describe('formatPyg', () => {
  it('formats guaraníes with dot thousands separator and no decimals', () => {
    expect(formatPyg(150000)).toBe('₲ 150.000');
    expect(formatPyg(0)).toBe('₲ 0');
    expect(formatPyg(1234567)).toBe('₲ 1.234.567');
  });
});

describe('parsePyg', () => {
  it('accepts common ways of typing an amount', () => {
    expect(parsePyg('150.000')).toBe(150000);
    expect(parsePyg('150 000')).toBe(150000);
    expect(parsePyg('₲150.000')).toBe(150000);
    expect(parsePyg('150,000')).toBe(150000);
    expect(parsePyg('0')).toBe(0);
  });

  it('returns null for empty, invalid or negative input', () => {
    expect(parsePyg('')).toBeNull();
    expect(parsePyg('abc')).toBeNull();
    expect(parsePyg('-500')).toBeNull();
  });
});
