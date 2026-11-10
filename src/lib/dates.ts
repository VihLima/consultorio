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
function localDayKey(iso: string): string {
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
