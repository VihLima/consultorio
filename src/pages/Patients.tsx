import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { reactivatePatient } from '../data/consultations';
import { listArchivedPatients, searchPatients, type PatientWithStatus } from '../data/patients';
import { openShift } from '../data/shifts';
import { formatDateOnly } from '../lib/dates';
import { normalizeSearch } from '../lib/patients';
import type { Patient } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';

/** Secondary line of a patient row: cédula and birth date, when known. */
function PatientDetails({ patient }: { patient: Patient }) {
  const { t } = useTranslation();
  if (!patient.cedula && !patient.birth_date) return null;
  return (
    <span className="muted list-link__sub">
      {patient.cedula && `${t('patient.cedula')}: ${patient.cedula}`}
      {patient.cedula && patient.birth_date && ' · '}
      {patient.birth_date && `${t('patient.birthDate')}: ${formatDateOnly(patient.birth_date)}`}
    </span>
  );
}

export default function Patients() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientWithStatus[]>([]);
  const [archived, setArchived] = useState<Patient[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const [needsShift, setNeedsShift] = useState(false);
  const [actionError, setActionError] = useState(false);

  // Debounce typing by 300 ms.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = normalizeSearch(query) !== '';

  useEffect(() => {
    let current = true;
    setLoadState('loading');
    const request = searching
      ? searchPatients(query).then((found) => {
          if (current) setResults(found);
        })
      : listArchivedPatients().then((list) => {
          if (current) setArchived(list);
        });
    request
      .then(() => {
        if (current) setLoadState('ready');
      })
      .catch(() => {
        if (current) setLoadState('error');
      });
    return () => {
      current = false;
    };
  }, [query, searching, reloadToken]);

  const reactivate = useCallback(
    async (patient: Patient) => {
      if (reactivating) return;
      setReactivating(patient.id);
      setActionError(false);
      setNeedsShift(false);
      try {
        const opened = await reactivatePatient(patient.id);
        if (!opened) {
          setNeedsShift(true);
          return;
        }
        navigate(`/paciente/${patient.id}`);
      } catch {
        setActionError(true);
      } finally {
        setReactivating(null);
      }
    },
    [navigate, reactivating],
  );

  const openShiftNow = useSubmitOnce(async () => {
    try {
      await openShift();
      setNeedsShift(false);
    } catch {
      setActionError(true);
    }
  });

  return (
    <Layout title={t('patients.title')} back="/inicio">
      <div className="stack">
        <div className="field">
          <label htmlFor="patient-search">{t('patients.searchLabel')}</label>
          <input
            id="patient-search"
            type="search"
            autoComplete="off"
            placeholder={t('patients.searchPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {needsShift && (
          <div className="alert stack" role="alert">
            <p>{t('shift.requiredToAttend')}</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={openShiftNow.busy}
              onClick={() => void openShiftNow.run()}
            >
              {t('home.openShift')}
            </button>
          </div>
        )}

        {actionError && (
          <p className="alert alert-danger" role="alert">
            {t('errors.generic')}
          </p>
        )}

        <section className="stack" aria-labelledby="patients-list-title" aria-live="polite">
          <h2 id="patients-list-title">
            {searching ? t('patients.results') : t('patients.archivedTitle')}
          </h2>

          {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
          {loadState === 'error' && (
            <div className="stack">
              <p className="field-error">{t('errors.loadFailed')}</p>
              <button type="button" className="btn" onClick={() => setReloadToken((n) => n + 1)}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {loadState === 'ready' && searching && results.length === 0 && (
            <p className="empty">{t('patients.noResults')}</p>
          )}
          {loadState === 'ready' && searching && results.length > 0 && (
            <ul className="list">
              {results.map((patient) => (
                <li key={patient.id} className="list-row">
                  <Link to={`/paciente/${patient.id}`} className="list-link">
                    <span className="list-link__main">
                      {patient.full_name}
                      <PatientDetails patient={patient} />
                    </span>
                    <StatusBadge status={patient.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {loadState === 'ready' && !searching && archived.length === 0 && (
            <p className="empty">{t('patients.archivedEmpty')}</p>
          )}
          {loadState === 'ready' && !searching && archived.length > 0 && (
            <ul className="list">
              {archived.map((patient) => (
                <li key={patient.id} className="list-row">
                  <Link to={`/paciente/${patient.id}`} className="list-link">
                    <span className="list-link__main">
                      {patient.full_name}
                      <PatientDetails patient={patient} />
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="btn list-row__action"
                    disabled={reactivating !== null}
                    aria-label={`${t('patients.reactivate')}: ${patient.full_name}`}
                    onClick={() => void reactivate(patient)}
                  >
                    {t('patients.reactivate')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
