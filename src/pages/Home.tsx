import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';
import { listActivePatients } from '../data/patients';
import { getOpenShift, openShift } from '../data/shifts';
import { formatDate, formatTime, isStaleShift } from '../lib/dates';
import type { Patient, Shift } from '../lib/types';

type LoadState = 'loading' | 'ready' | 'error';

export default function Home() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [shift, setShift] = useState<Shift | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  // The state update above lands after the next render; the ref blocks a
  // second tap that arrives before that (the database also rejects it).
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [needsShift, setNeedsShift] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setLoadState('loading');
    try {
      const open = await getOpenShift();
      if (!isCurrent()) return;
      setShift(open);
      setLoadState('ready');
    } catch {
      if (isCurrent()) setLoadState('error');
    }
  }, []);

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError('errors.generic');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const handleOpenShift = () =>
    run(async () => {
      try {
        setShift(await openShift());
        setNeedsShift(false);
      } catch (error) {
        // The shift may have changed on another device: show what the database has.
        void load();
        throw error;
      }
    });

  // Closing goes through the summary on /financas?fechar=1 (Finances.tsx).

  function handlePatient() {
    if (shift) navigate('/paciente/novo');
    else setNeedsShift(true);
  }

  const handleLogout = () =>
    run(async () => {
      await signOut();
      navigate('/', { replace: true });
    });

  const ready = loadState === 'ready';
  const stale = shift !== null && isStaleShift(shift.opened_at, new Date().toISOString());

  return (
    <Layout title={t('home.title')}>
      <div className="stack">
        <section className="card" aria-live="polite">
          {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
          {loadState === 'error' && (
            <div className="stack">
              <p className="field-error">{t('errors.loadFailed')}</p>
              <button type="button" className="btn" onClick={() => void load()}>
                {t('common.retry')}
              </button>
            </div>
          )}
          {ready && (
            <p>
              <strong>
                {shift
                  ? t('shift.openSince', { time: formatTime(shift.opened_at) })
                  : t('shift.none')}
              </strong>
            </p>
          )}
        </section>

        {stale && shift && (
          <p className="alert" role="status">
            {t('shift.staleWarning', { date: formatDate(shift.opened_at) })}
          </p>
        )}

        {needsShift && !shift && (
          <div className="alert stack" role="alert">
            <p>{t('shift.requiredToAttend')}</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !ready}
              onClick={handleOpenShift}
            >
              {t('home.openShift')}
            </button>
          </div>
        )}

        {actionError && (
          <p className="alert alert-danger" role="alert">
            {t(actionError)}
          </p>
        )}

        <nav className="home-grid">
          {shift ? (
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={busy || !ready}
              onClick={() => navigate('/financas?fechar=1')}
            >
              {t('home.closeShift')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={busy || !ready}
              onClick={handleOpenShift}
            >
              {t('home.openShift')}
            </button>
          )}
          <button type="button" className="btn btn-big" disabled={!ready} onClick={handlePatient}>
            {t('home.newPatient')}
          </button>
          <Link to="/pacientes" className="btn btn-big">
            {t('home.patients')}
          </Link>
          <Link to="/financas" className="btn btn-big">
            {t('home.finances')}
          </Link>
          <button type="button" className="btn btn-big" disabled={busy} onClick={handleLogout}>
            {t('home.logout')}
          </button>
        </nav>

        <InProgress />
      </div>
    </Layout>
  );
}

type ActivePatient = Patient & { consultation_id: string };

/** Patients with a consultation in progress (draft); tapping one resumes it. */
function InProgress() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<ActivePatient[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setLoadState('loading');
    try {
      const active = await listActivePatients();
      if (!isCurrent()) return;
      setPatients(active);
      setLoadState('ready');
    } catch {
      if (isCurrent()) setLoadState('error');
    }
  }, []);

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  return (
    <section className="stack" aria-labelledby="in-progress-title">
      <h2 id="in-progress-title">{t('home.inProgress')}</h2>
      {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
      {loadState === 'error' && (
        <div className="stack">
          <p className="field-error">{t('errors.loadFailed')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {loadState === 'ready' && patients.length === 0 && (
        <p className="empty">{t('home.inProgressEmpty')}</p>
      )}
      {loadState === 'ready' && patients.length > 0 && (
        <ul className="list">
          {patients.map((patient) => (
            <li key={patient.consultation_id} className="list-row">
              <Link to={`/paciente/${patient.id}`} className="list-link">
                <span className="list-link__main">{patient.full_name}</span>
                <span className="badge">{t('home.resume')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
