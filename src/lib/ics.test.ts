import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, isAppleMobile } from './ics';
import { zonedIso } from './dates';

describe('buildIcs', () => {
  const ics = buildIcs(
    {
      uid: 'a1@consultorio',
      startIso: zonedIso('2026-11-12', '07:30'),
      durationMinutes: 30,
      title: 'Consulta · Miguel Almada',
      description: 'Control, traer estudios',
      alarmMinutes: 60,
    },
    '2026-11-11T12:00:00.000Z',
  );

  it('places the event at the Asunción time, written in UTC', () => {
    expect(ics).toContain('DTSTART:20261112T103000Z');
    expect(ics).toContain('DTEND:20261112T110000Z');
    expect(ics).toContain('DTSTAMP:20261111T120000Z');
  });

  it('carries title, escaped description and a reminder', () => {
    expect(ics).toContain('SUMMARY:Consulta · Miguel Almada');
    expect(ics).toContain('DESCRIPTION:Control\\, traer estudios');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT60M');
  });

  it('uses CRLF line endings and wraps in a calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((line) => Array.from(line).length <= 75)).toBe(true);
  });

  it('folds long lines', () => {
    const long = buildIcs({ uid: 'x', startIso: '2026-11-12T10:00:00.000Z', durationMinutes: 30, title: 'A'.repeat(200) });
    expect(long).toContain('\r\n A');
    expect(long.split('\r\n').every((line) => Array.from(line).length <= 75)).toBe(true);
  });
});

describe('escapeText', () => {
  it('escapes backslashes, separators and newlines', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
});

describe('isAppleMobile', () => {
  it('detects iPhone and iPadOS, not desktop Mac or Android', () => {
    expect(isAppleMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isAppleMobile('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false);
  });
});
