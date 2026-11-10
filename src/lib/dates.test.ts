import { describe, expect, it } from 'vitest';
import { TZ, formatDate, formatDateOnly, formatTime, isStaleShift } from './dates';

// 2026-11-10T03:30:00Z is 00:30 on 10/11 in Asunción (UTC-3)
describe('dates in America/Asuncion', () => {
  it('uses the Asunción time zone', () => {
    expect(TZ).toBe('America/Asuncion');
  });

  it('formats dates as dd/mm/aaaa in local time', () => {
    expect(formatDate('2026-11-10T03:30:00Z')).toBe('10/11/2026');
    expect(formatDate('2026-11-10T02:30:00Z')).toBe('09/11/2026');
  });

  it('formats times as HH:MM in local time', () => {
    expect(formatTime('2026-11-10T03:30:00Z')).toBe('00:30');
  });
});

describe('isStaleShift', () => {
  it('is true when the shift was opened on an earlier local day', () => {
    expect(isStaleShift('2026-11-09T20:00:00Z', '2026-11-10T12:00:00Z')).toBe(true);
    // 02:30Z de 10/11 ainda é 09/11 em Assunção
    expect(isStaleShift('2026-11-10T02:30:00Z', '2026-11-10T12:00:00Z')).toBe(true);
  });

  it('is false when the shift was opened on the same local day', () => {
    expect(isStaleShift('2026-11-10T11:00:00Z', '2026-11-10T22:00:00Z')).toBe(false);
    // 02:00Z of 11/11 is still 10/11 (23:00) in Asunción
    expect(isStaleShift('2026-11-10T11:00:00Z', '2026-11-11T02:00:00Z')).toBe(false);
  });

  it('compares across month and year boundaries', () => {
    expect(isStaleShift('2026-12-31T20:00:00Z', '2027-01-01T12:00:00Z')).toBe(true);
  });
});

describe('formatDateOnly', () => {
  it('reorders a date-only string without shifting the day', () => {
    expect(formatDateOnly('1990-05-12')).toBe('12/05/1990');
    expect(formatDateOnly('2026-01-01')).toBe('01/01/2026');
  });
});
