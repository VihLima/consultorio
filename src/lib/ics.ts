/**
 * One appointment as an iCalendar (.ics) file, so the phone's own calendar
 * (Calendário on the iPhone) can keep it and ring a reminder before it.
 */

export interface CalendarEvent {
  /** Stable id: re-adding the same appointment updates the event instead of duplicating it. */
  uid: string;
  /** UTC ISO start. */
  startIso: string;
  durationMinutes: number;
  title: string;
  description?: string | null;
  /** Minutes before the start for the reminder; none when omitted. */
  alarmMinutes?: number;
}

/** "2026-11-12T10:30:00.000Z" → "20261112T103000Z". */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Text value escaping (RFC 5545 §3.3.11). */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 characters, continuing with a leading space. */
function fold(line: string): string {
  const chars = Array.from(line);
  if (chars.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 74) parts.push(chars.slice(i, i + 74).join(''));
  return parts.join('\r\n ');
}

export function buildIcs(event: CalendarEvent, nowIso: string = new Date().toISOString()): string {
  const end = new Date(new Date(event.startIso).getTime() + event.durationMinutes * 60_000).toISOString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Consultorio//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(nowIso)}`,
    `DTSTART:${utcStamp(event.startIso)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.alarmMinutes !== undefined) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(event.title)}`,
      `TRIGGER:-PT${event.alarmMinutes}M`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** iPhone/iPad, including iPadOS that reports itself as a Mac. */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Hands the event to the device. On the iPhone, opening the calendar data
 * directly shows the "Add to Calendar" sheet; elsewhere it downloads a .ics.
 * Must run inside the click handler (Safari blocks it otherwise).
 */
export function openIcs(ics: string, fileName: string): void {
  if (isAppleMobile(navigator.userAgent, navigator.maxTouchPoints ?? 0)) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    return;
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
