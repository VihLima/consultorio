import { addDays, localDayKey, weekdayIndex } from './dates';

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  scheduled_at: string;
  note: string | null;
  cancelled_at: string | null;
}

export interface AgendaConsultation {
  id: string;
  patient_id: string;
  patient_name: string;
  status: 'open' | 'closed';
  started_at: string;
  closed_at: string | null;
}

/**
 * What a mark in the agenda means:
 * - done: consultation finished
 * - inProgress: consultation started and still open (pending)
 * - scheduled: appointment still to come
 * - missed: appointment whose time has passed with no consultation that day
 * - cancelled: appointment cancelled
 */
export type AgendaKind = 'done' | 'inProgress' | 'scheduled' | 'missed' | 'cancelled';

export interface AgendaEntry {
  /** Unique across both sources ('c:' consultation, 'a:' appointment). */
  key: string;
  kind: AgendaKind;
  at: string;
  day: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  note: string | null;
  appointment_id: string | null;
}

/**
 * Consultations and appointments as agenda entries, sorted by time. A past
 * appointment is dropped when the patient had a consultation that same day
 * (the consultation is the mark that matters); otherwise it is "missed".
 */
export function buildAgenda(
  consultations: AgendaConsultation[],
  appointments: Appointment[],
  nowIso: string,
): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  const seen = new Set<string>();

  for (const c of consultations) {
    const at = c.status === 'closed' && c.closed_at ? c.closed_at : c.started_at;
    const day = localDayKey(at);
    seen.add(`${c.patient_id}|${day}`);
    seen.add(`${c.patient_id}|${localDayKey(c.started_at)}`);
    entries.push({
      key: `c:${c.id}`,
      kind: c.status === 'closed' ? 'done' : 'inProgress',
      at,
      day,
      patient_id: c.patient_id,
      patient_name: c.patient_name,
      patient_phone: null,
      note: null,
      appointment_id: null,
    });
  }

  for (const a of appointments) {
    const day = localDayKey(a.scheduled_at);
    let kind: AgendaKind;
    if (a.cancelled_at) kind = 'cancelled';
    else if (a.scheduled_at >= nowIso) kind = 'scheduled';
    else if (seen.has(`${a.patient_id}|${day}`)) continue;
    else kind = 'missed';
    entries.push({
      key: `a:${a.id}`,
      kind,
      at: a.scheduled_at,
      day,
      patient_id: a.patient_id,
      patient_name: a.patient_name,
      patient_phone: a.patient_phone,
      note: a.note,
      appointment_id: a.id,
    });
  }

  return entries.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

/** Entries grouped by their Asunción day ("aaaa-mm-dd"). */
export function byDay(entries: AgendaEntry[]): Map<string, AgendaEntry[]> {
  const map = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.day);
    if (list) list.push(entry);
    else map.set(entry.day, [entry]);
  }
  return map;
}

/**
 * The weeks (Monday to Sunday) that cover the month of `ymd`: whole weeks,
 * so days of the neighbouring months fill the first and last rows.
 */
export function monthGrid(ymd: string): string[][] {
  const first = `${ymd.slice(0, 7)}-01`;
  const nextFirst = shiftMonth(first, 1);
  let day = addDays(first, -weekdayIndex(first));
  const weeks: string[][] = [];
  while (day < nextFirst) {
    const week: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** First day of the month `delta` months away from the month of `ymd`. */
export function shiftMonth(ymd: string, delta: number): string {
  const [year, month] = ymd.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
