import { describe, expect, it } from 'vitest';
import { buildAgenda, byDay, monthGrid, shiftMonth, type Appointment, type AgendaConsultation } from './agenda';
import { zonedIso } from './dates';

const NOW = zonedIso('2026-11-11', '12:00');

function consultation(partial: Partial<AgendaConsultation>): AgendaConsultation {
  return {
    id: 'c1',
    patient_id: 'p1',
    patient_name: 'Ana',
    status: 'closed',
    started_at: zonedIso('2026-11-10', '09:00'),
    closed_at: zonedIso('2026-11-10', '09:40'),
    ...partial,
  };
}

function appointment(partial: Partial<Appointment>): Appointment {
  return {
    id: 'a1',
    patient_id: 'p2',
    patient_name: 'Beto',
    patient_phone: null,
    scheduled_at: zonedIso('2026-11-12', '10:00'),
    note: null,
    cancelled_at: null,
    ...partial,
  };
}

describe('zonedIso', () => {
  it('turns Asunción wall-clock time (UTC-3) into UTC', () => {
    expect(zonedIso('2026-11-11', '12:00')).toBe('2026-11-11T15:00:00.000Z');
    expect(zonedIso('2026-11-11', '23:30')).toBe('2026-11-12T02:30:00.000Z');
  });
});

describe('buildAgenda', () => {
  it('classifies finished, open, upcoming, missed and cancelled marks', () => {
    const entries = buildAgenda(
      [
        consultation({}),
        consultation({ id: 'c2', patient_id: 'p3', status: 'open', started_at: zonedIso('2026-11-11', '08:00'), closed_at: null }),
      ],
      [
        appointment({}),
        appointment({ id: 'a2', patient_id: 'p4', scheduled_at: zonedIso('2026-11-09', '10:00') }),
        appointment({ id: 'a3', scheduled_at: zonedIso('2026-11-13', '10:00'), cancelled_at: NOW }),
      ],
      NOW,
    );
    expect(entries.map((e) => [e.key, e.kind, e.day])).toEqual([
      ['a:a2', 'missed', '2026-11-09'],
      ['c:c1', 'done', '2026-11-10'],
      ['c:c2', 'inProgress', '2026-11-11'],
      ['a:a1', 'scheduled', '2026-11-12'],
      ['a:a3', 'cancelled', '2026-11-13'],
    ]);
  });

  it('drops a past appointment when the patient was seen that day', () => {
    const entries = buildAgenda(
      [consultation({})],
      [appointment({ patient_id: 'p1', scheduled_at: zonedIso('2026-11-10', '08:30') })],
      NOW,
    );
    expect(entries.map((e) => e.key)).toEqual(['c:c1']);
  });

  it('groups entries by day', () => {
    const entries = buildAgenda([consultation({})], [appointment({})], NOW);
    const days = byDay(entries);
    expect([...days.keys()]).toEqual(['2026-11-10', '2026-11-12']);
  });
});

describe('monthGrid', () => {
  it('covers the month in whole Monday-to-Sunday weeks', () => {
    const weeks = monthGrid('2026-11-11');
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(weeks[0][6]).toBe('2026-11-01');
    expect(weeks[weeks.length - 1][0]).toBe('2026-11-30');
    expect(weeks[weeks.length - 1][6]).toBe('2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('starts on the 1st when the month begins on a Monday', () => {
    const weeks = monthGrid('2026-06-15');
    expect(weeks[0][0]).toBe('2026-06-01');
    expect(weeks[weeks.length - 1][6]).toBe('2026-07-05');
  });
});

describe('shiftMonth', () => {
  it('moves across years', () => {
    expect(shiftMonth('2026-12-20', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-05', -1)).toBe('2025-12-01');
  });
});
