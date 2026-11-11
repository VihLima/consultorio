export const TZ = 'America/Asuncion';

const dateFormat = new Intl.DateTimeFormat('es-PY', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('es-PY', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(format: Intl.DateTimeFormat, iso: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of format.formatToParts(new Date(iso))) result[part.type] = part.value;
  return result;
}

/** ISO timestamp → "dd/mm/aaaa" in America/Asuncion. */
export function formatDate(iso: string): string {
  const p = parts(dateFormat, iso);
  return `${p.day}/${p.month}/${p.year}`;
}

/** ISO timestamp → sortable "aaaa-mm-dd" of its day in America/Asuncion. */
export function localDayKey(iso: string): string {
  const p = parts(dateFormat, iso);
  return `${p.year}-${p.month}-${p.day}`;
}

/** True when a shift opened at `openedAtIso` started on an earlier Asunción day than `nowIso`. */
export function isStaleShift(openedAtIso: string, nowIso: string): boolean {
  return localDayKey(openedAtIso) < localDayKey(nowIso);
}

/** ISO timestamp → "HH:MM" (24 h) in America/Asuncion. */
export function formatTime(iso: string): string {
  const p = parts(timeFormat, iso);
  return `${p.hour}:${p.minute}`;
}

/**
 * Date-only "aaaa-mm-dd" (e.g. `patients.birth_date`) → "dd/mm/aaaa".
 * No Date object: parsing it as UTC midnight would show the previous day in Asunción.
 */
export function formatDateOnly(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}

const stampFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * A wall-clock date and time in Asunción ("aaaa-mm-dd", "HH:MM") → ISO
 * timestamp (UTC). Uses the zone's offset at that moment, whatever it is.
 */
export function zonedIso(ymd: string, hm: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = parts(stampFormat, new Date(guess).toISOString());
  const seen = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return new Date(guess - (seen - guess)).toISOString();
}

/** "aaaa-mm-dd" moved by `days` (calendar arithmetic, no time zone involved). */
export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Day of the week of "aaaa-mm-dd": 0 = Monday … 6 = Sunday. */
export function weekdayIndex(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}
