import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import Icon from '../components/Icon';
import {
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  listAgendaConsultations,
  listAppointments,
} from '../data/appointments';
import { createPatient, searchPatients, type PatientWithStatus } from '../data/patients';
import {
  SERVICES,
  buildAgenda,
  byDay,
  monthGrid,
  shiftMonth,
  upcomingAppointments,
  type AgendaEntry,
  type AgendaKind,
  type Appointment,
  type AppointmentService,
} from '../lib/agenda';
import { addDays, formatTime, localDayKey, zonedIso } from '../lib/dates';
import { buildIcs, openIcs } from '../lib/ics';
import { whatsappUrl } from '../lib/phone';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';

const KINDS: AgendaKind[] = ['scheduled', 'inProgress', 'done', 'missed', 'cancelled'];
/** Marks shown inside a day cell before "+N". */
const CELL_LIMIT = 3;
/** How far ahead the "upcoming" list looks. */
const UPCOMING_DAYS = 90;
/** Reminder on the phone's calendar, minutes before the appointment. */
const PHONE_ALARM_MINUTES = 60;
/** Length of the event on the phone's calendar, by service. */
const SERVICE_MINUTES: Record<AppointmentService, number> = { consulta: 30, ecografia: 30, cirugia: 120, otro: 30 };

/** First letter uppercase only ("noviembre de 2026" → "Noviembre de 2026"). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function todayKey(): string {
  return localDayKey(new Date().toISOString());
}

export default function Agenda() {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => `${todayKey().slice(0, 7)}-01`);
  const [selected, setSelected] = useState(todayKey);
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [formOpen, setFormOpen] = useState(false);
  const [justSaved, setJustSaved] = useState<Appointment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const today = todayKey();

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      const from = zonedIso(weeks[0][0], '00:00');
      const to = zonedIso(addDays(weeks[weeks.length - 1][6], 1), '00:00');
      const nowIso = new Date().toISOString();
      const until = zonedIso(addDays(todayKey(), UPCOMING_DAYS), '00:00');
      try {
        const [consultations, appointments, next] = await Promise.all([
          listAgendaConsultations(from, to),
          listAppointments(from, to),
          listAppointments(nowIso, until),
        ]);
        if (!isCurrent()) return;
        setEntries(buildAgenda(consultations, appointments, nowIso));
        setUpcoming(upcomingAppointments(next, nowIso));
        setLoadState('ready');
      } catch {
        if (isCurrent()) setLoadState('error');
      }
    },
    [weeks],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  const days = useMemo(() => byDay(entries), [entries]);
  const dayEntries = days.get(selected) ?? [];

  const monthTitle = capitalize(new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}T12:00:00Z`),
  ));
  const weekdayNames = weeks[0].map((day) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)),
  );
  const selectedTitle = capitalize(new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${selected}T12:00:00Z`)));

  /** "aaaa-mm-dd" → "Hoy" or "jue. 12/11". */
  function dayLabel(day: string): string {
    if (day === today) return t('agenda.today');
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    return `${weekday} ${day.slice(8)}/${day.slice(5, 7)}`;
  }

  /** Sends a scheduled appointment to the phone's calendar, with a reminder. */
  function addToPhone(a: Pick<Appointment, 'id' | 'scheduled_at' | 'service' | 'note' | 'patient_name' | 'patient_phone'>) {
    const details = [a.note, a.patient_phone].filter(Boolean).join(' · ');
    const ics = buildIcs({
      uid: `${a.id}@consultorio`,
      startIso: a.scheduled_at,
      durationMinutes: SERVICE_MINUTES[a.service],
      title: `${t(`agenda.services.${a.service}`)} · ${a.patient_name}`,
      description: details || null,
      alarmMinutes: PHONE_ALARM_MINUTES,
    });
    openIcs(ics, `${localDayKey(a.scheduled_at)}-${formatTime(a.scheduled_at).replace(':', '')}.ics`);
  }

  function addEntryToPhone(entry: AgendaEntry) {
    addToPhone({
      id: entry.appointment_id!,
      scheduled_at: entry.at,
      service: entry.service ?? 'consulta',
      note: entry.note,
      patient_name: entry.patient_name,
      patient_phone: entry.patient_phone,
    });
  }

  function goMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(today.startsWith(next.slice(0, 7)) ? today : next);
  }

  function goToday() {
    setMonth(`${today.slice(0, 7)}-01`);
    setSelected(today);
  }

  function pickDay(day: string) {
    setSelected(day);
    if (!day.startsWith(month.slice(0, 7))) setMonth(`${day.slice(0, 7)}-01`);
  }

  const [acting, setActing] = useState(false);

  /** Cancels or removes an appointment, then reloads; one action at a time. */
  async function act(action: () => Promise<void>) {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      await action();
      await load();
    } catch {
      setActionError('errors.saveFailed');
    } finally {
      setActing(false);
    }
  }

  return (
    <Layout title={t('agenda.title')}>
      <div className="agenda-layout">
        <section className="card agenda-calendar" aria-labelledby="agenda-month">
          <div className="agenda-toolbar">
            <button type="button" className="btn btn-icon" onClick={() => goMonth(-1)} aria-label={t('agenda.previousMonth')}>
              <Icon name="back" size={18} />
            </button>
            <h2 id="agenda-month" className="agenda-month">{monthTitle}</h2>
            <button type="button" className="btn btn-icon" onClick={() => goMonth(1)} aria-label={t('agenda.nextMonth')}>
              <Icon name="arrow" size={18} />
            </button>
            <button type="button" className="btn btn-small agenda-today-btn" onClick={goToday}>
              {t('agenda.today')}
            </button>
          </div>

          <ul className="agenda-legend" aria-label={t('agenda.legend')}>
            {KINDS.map((kind) => (
              <li key={kind}><span className={`agenda-dot kind-${kind}`} aria-hidden="true" />{t(`agenda.kinds.${kind}`)}</li>
            ))}
          </ul>

          {loadState === 'error' && (
            <div className="alert alert-danger section-heading" role="alert">
              <p>{t('errors.loadFailed')}</p>
              <button type="button" className="btn" onClick={() => void load()}>{t('common.retry')}</button>
            </div>
          )}

          <div className="agenda-grid" role="grid" aria-busy={loadState === 'loading'} aria-labelledby="agenda-month">
            <div className="agenda-row agenda-weekdays" role="row">
              {weekdayNames.map((name) => (
                <span key={name} role="columnheader">{name}</span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="agenda-row" role="row">
                {week.map((day) => {
                  const list = days.get(day) ?? [];
                  const classes = ['agenda-day'];
                  if (!day.startsWith(month.slice(0, 7))) classes.push('is-outside');
                  if (day === today) classes.push('is-today');
                  if (day === selected) classes.push('is-selected');
                  if (day < today) classes.push('is-past');
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      className={classes.join(' ')}
                      aria-selected={day === selected}
                      aria-current={day === today ? 'date' : undefined}
                      aria-label={`${day.slice(8)} · ${t('agenda.count', { count: list.length })}`}
                      onClick={() => pickDay(day)}
                    >
                      <span className="agenda-day__number">{Number(day.slice(8))}</span>
                      {day === today && <span className="agenda-day__today">{t('agenda.today')}</span>}
                      <span className="agenda-day__marks">
                        {list.slice(0, CELL_LIMIT).map((entry) => (
                          <span key={entry.key} className={`agenda-chip kind-${entry.kind}`}>
                            <span className="agenda-chip__time">{formatTime(entry.at)}</span>
                            <span className="agenda-chip__name">{entry.patient_name}</span>
                          </span>
                        ))}
                        {list.length > CELL_LIMIT && <span className="agenda-more">+{list.length - CELL_LIMIT}</span>}
                      </span>
                      <span className="agenda-day__dots" aria-hidden="true">
                        {list.slice(0, 4).map((entry) => (
                          <span key={entry.key} className={`agenda-dot kind-${entry.kind}`} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="card agenda-day-panel stack" aria-labelledby="agenda-day-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{selected === today ? t('agenda.today') : t('agenda.selectedDay')}</span>
              <h2 id="agenda-day-title" className="agenda-day-title">{selectedTitle}</h2>
            </div>
            {!formOpen && (
              <button type="button" className="btn btn-primary" onClick={() => { setJustSaved(null); setFormOpen(true); }}>
                <Icon name="plus" size={18} />
                {t('agenda.new')}
              </button>
            )}
          </div>

          {formOpen && (
            <AppointmentForm
              day={selected}
              onCancel={() => setFormOpen(false)}
              onSaved={async (saved) => {
                setFormOpen(false);
                setJustSaved(saved);
                pickDay(localDayKey(saved.scheduled_at));
                await load();
              }}
            />
          )}

          {justSaved && (
            <div className="alert agenda-saved stack" role="status">
              <p>{t('agenda.addToPhoneHint')}</p>
              <div className="row-actions">
                <button type="button" className="btn btn-primary btn-small" onClick={() => addToPhone(justSaved)}>
                  <Icon name="calendar" size={16} />
                  {t('agenda.addToPhone')}
                </button>
                <button type="button" className="btn btn-small" onClick={() => setJustSaved(null)}>{t('common.close')}</button>
              </div>
            </div>
          )}

          {actionError && <p className="alert alert-danger" role="alert">{t(actionError)}</p>}

          {loadState === 'loading' ? (
            <p className="loading-line" role="status"><span className="spinner" />{t('common.loading')}</p>
          ) : dayEntries.length === 0 ? (
            <p className="empty">{t('agenda.dayEmpty')}</p>
          ) : (
            <ul className="agenda-list">
              {dayEntries.map((entry) => {
                const whatsapp = entry.patient_phone ? whatsappUrl(entry.patient_phone) : null;
                return (
                  <li key={entry.key} className={`agenda-item kind-${entry.kind}`}>
                    <span className="agenda-item__time">{formatTime(entry.at)}</span>
                    <div className="agenda-item__body">
                      <Link to={`/paciente/${entry.patient_id}`} className="agenda-item__name">{entry.patient_name}</Link>
                      <span className="agenda-item__tags">
                        {entry.service && <span className="agenda-service">{t(`agenda.services.${entry.service}`)}</span>}
                        <span className={`agenda-badge kind-${entry.kind}`}>{t(`agenda.kinds.${entry.kind}`)}</span>
                      </span>
                      {entry.note && <p className="agenda-item__note">{entry.note}</p>}
                      {entry.appointment_id && (
                        <div className="row-actions">
                          {whatsapp && entry.kind === 'scheduled' && (
                            <a className="btn btn-small btn-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
                              <Icon name="chat" size={16} />
                              WhatsApp
                            </a>
                          )}
                          {entry.kind === 'scheduled' && (
                            <button type="button" className="btn btn-small" onClick={() => addEntryToPhone(entry)}>
                              <Icon name="calendar" size={16} />
                              {t('agenda.addToPhone')}
                            </button>
                          )}
                          {entry.kind === 'scheduled' && (
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={acting}
                              onClick={() => void act(() => cancelAppointment(entry.appointment_id!))}
                            >
                              {t('agenda.cancel')}
                            </button>
                          )}
                          {(entry.kind === 'cancelled' || entry.kind === 'missed') && (
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              disabled={acting}
                              onClick={() => void act(() => deleteAppointment(entry.appointment_id!))}
                            >
                              {t('common.remove')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card agenda-upcoming stack" aria-labelledby="agenda-upcoming-title">
          <div>
            <h2 id="agenda-upcoming-title" className="agenda-day-title">{t('agenda.upcoming')}</h2>
            <p className="muted agenda-upcoming__hint">{t('agenda.upcomingHint')}</p>
          </div>
          {loadState === 'loading' ? (
            <p className="loading-line" role="status"><span className="spinner" />{t('common.loading')}</p>
          ) : upcoming.length === 0 ? (
            <p className="empty">{t('agenda.upcomingEmpty')}</p>
          ) : (
            <ol className="agenda-upcoming__list">
              {upcoming.map((a) => {
                const day = localDayKey(a.scheduled_at);
                return (
                  <li key={a.id}>
                    <button type="button" className="agenda-upcoming__row" onClick={() => pickDay(day)}>
                      <span className="agenda-upcoming__when">
                        <span className="agenda-upcoming__day">{dayLabel(day)}</span>
                        <span className="agenda-upcoming__time">{formatTime(a.scheduled_at)}</span>
                      </span>
                      <span className="agenda-upcoming__who">
                        <strong>{a.patient_name}</strong>
                        <span className="muted">
                          {t(`agenda.services.${a.service}`)}
                          {a.note ? ` · ${a.note}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Layout>
  );
}

interface AppointmentFormProps {
  day: string;
  onCancel: () => void;
  onSaved: (appointment: Appointment) => void | Promise<void>;
}

/** New appointment: an existing patient (search) or a new one by name, a date, a time and a note. */
function AppointmentForm({ day, onCancel, onSaved }: AppointmentFormProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientWithStatus[]>([]);
  const [patient, setPatient] = useState<{ id: string | null; name: string } | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('09:00');
  const [service, setService] = useState<AppointmentService>('consulta');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (patient || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      searchPatients(query)
        .then((found) => {
          if (current) setResults(found.slice(0, 5));
        })
        .catch(() => {
          if (current) setResults([]);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, patient]);

  const save = useSubmitOnce(async () => {
    setError(null);
    if (!patient) {
      setError('agenda.patientRequired');
      return;
    }
    if (!date || !time) {
      setError('agenda.dateRequired');
      return;
    }
    try {
      let patientId = patient.id;
      if (!patientId) {
        const created = await createPatient({
          full_name: patient.name,
          birth_date: null,
          cedula: null,
          notes: null,
          phone: newPhone || null,
        });
        patientId = created.id;
      }
      const saved = await createAppointment(patientId, zonedIso(date, time), service, note);
      await onSaved(saved);
    } catch {
      setError('errors.saveFailed');
    }
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save.run();
  }

  return (
    <form className="payment-form stack agenda-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="appt-patient">{t('agenda.patient')}</label>
        {patient ? (
          <div className="agenda-picked">
            <strong>{patient.name}</strong>
            {!patient.id && <span className="badge">{t('agenda.newPatient')}</span>}
            <button type="button" className="btn btn-small" onClick={() => setPatient(null)}>{t('agenda.change')}</button>
          </div>
        ) : (
          <>
            <input
              id="appt-patient"
              autoComplete="off"
              placeholder={t('agenda.patientPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length >= 2 && (
              <ul className="agenda-suggestions">
                {results.map((found) => (
                  <li key={found.id}>
                    <button type="button" onClick={() => setPatient({ id: found.id, name: found.full_name })}>
                      {found.full_name}
                      {found.cedula && <span className="muted"> · {found.cedula}</span>}
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="agenda-suggestions__new" onClick={() => setPatient({ id: null, name: query.trim() })}>
                    <Icon name="plus" size={16} />
                    {t('agenda.createPatient', { name: query.trim() })}
                  </button>
                </li>
              </ul>
            )}
          </>
        )}
      </div>

      {patient && !patient.id && (
        <div className="field">
          <label htmlFor="appt-phone">
            {t('patient.phone')} <span className="muted">{t('common.optional')}</span>
          </label>
          <input id="appt-phone" type="tel" inputMode="tel" placeholder="0981 123 456" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        </div>
      )}

      <div className="payment-form__row">
        <div className="field">
          <label htmlFor="appt-date">{t('agenda.date')}</label>
          <input id="appt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="appt-time">{t('agenda.time')}</label>
          <input id="appt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <fieldset className="field agenda-services">
        <legend>{t('agenda.service')}</legend>
        <div className="agenda-services__options">
          {SERVICES.map((option) => (
            <label key={option} className={`agenda-service-option ${service === option ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="appt-service"
                value={option}
                checked={service === option}
                onChange={() => setService(option)}
              />
              {t(`agenda.services.${option}`)}
            </label>
          ))}
        </div>
        {service === 'otro' && <p className="muted agenda-services__hint">{t('agenda.otherNoteHint')}</p>}
      </fieldset>

      <div className="field">
        <label htmlFor="appt-note">
          {t('agenda.note')} <span className="muted">{t('common.optional')}</span>
        </label>
        <input id="appt-note" autoComplete="off" placeholder={t('agenda.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && <p className="alert alert-danger" role="alert">{t(error)}</p>}

      <div className="row-actions">
        <button type="submit" className="btn btn-primary" disabled={save.busy}>
          {save.busy ? t('common.saving') : t('agenda.save')}
        </button>
        <button type="button" className="btn" disabled={save.busy} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}
