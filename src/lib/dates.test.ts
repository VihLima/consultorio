import { describe, expect, it } from 'vitest';
import { TZ, formatDate, formatTime } from './dates';

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
