import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import ConsultationHistory from '../components/ConsultationHistory';
import FileUploader from '../components/FileUploader';
import {
  closeConsultation,
  getOpenConsultation,
  hasDbMessage,
  reactivatePatient,
  saveConsultationDraft,
  startConsultation,
} from '../data/consultations';
import {
  DUPLICATE_CEDULA,
  createPatient,
  findPatientByCedula,
  getPatient,
  updatePatient,
  type PatientInput,
} from '../data/patients';
import { openShift } from '../data/shifts';
import { draftStore } from '../lib/draftStore';
import { formatPyg, parsePyg } from '../lib/money';
import { normalizeCedula } from '../lib/patients';
import type { Consultation, Patient } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';

const NEW_DRAFT = 'new';

interface FieldErrors {
  name?: string;
  amount?: string;
}

function isDuplicateCedula(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === DUPLICATE_CEDULA
  );
}

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<LoadState>(id ? 'loading' : 'ready');
  const [reloadToken, setReloadToken] = useState(0);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [cedula, setCedula] = useState('');
  const [history, setHistory] = useState('');
  const [amount, setAmount] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Patient | null>(null);
  const [needsShift, setNeedsShift] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Latest values for async flows that outlive a render (uploads, saves).
  const patientRef = useRef<Patient | null>(null);
  const consultationRef = useRef<Consultation | null>(null);
  const inputRef = useRef<PatientInput>({ full_name: '', birth_date: null, cedula: null });
  inputRef.current = { full_name: fullName, birth_date: birthDate || null, cedula: cedula || null };
  const draftRef = useRef({ clinical_history: history, amount });
  draftRef.current = { clinical_history: history, amount };
  const creating = useRef<Promise<Consultation> | null>(null);
  /** True once the user changed the history or the amount (only then is a local draft written). */
  const touched = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyPatient(next: Patient | null) {
    patientRef.current = next;
    setPatient(next);
  }

  function applyConsultation(next: Consultation | null) {
    consultationRef.current = next;
    setConsultation(next);
  }

  // Load the patient and the open consultation; on /paciente/novo restore a local draft.
  useEffect(() => {
    // Patient just created here (URL replaced from /paciente/novo): already loaded.
    if (id && patientRef.current?.id === id) return;

    setFieldErrors({});
    setFormError(null);
    setDuplicate(null);
    setNeedsShift(false);
    setSaved(false);
    touched.current = false;

    if (!id) {
      const local = draftStore.load(NEW_DRAFT);
      if (local) {
        setHistory(local.clinical_history);
        setAmount(local.amount);
        setDraftRestored(local.clinical_history !== '' || local.amount !== '');
      }
      setLoadState('ready');
      return;
    }
    let current = true;
    setLoadState('loading');
    setDraftRestored(false);
    Promise.all([getPatient(id), getOpenConsultation(id)])
      .then(([loadedPatient, open]) => {
        if (!current) return;
        applyPatient(loadedPatient);
        applyConsultation(open);
        setFullName(loadedPatient.full_name);
        setBirthDate(loadedPatient.birth_date ?? '');
        setCedula(loadedPatient.cedula ?? '');

        let nextHistory = open?.clinical_history ?? '';
        let nextAmount = '';
        const local = open ? draftStore.load(open.id) : null;
        if (local) {
          // The local draft is cleared after a successful final save, so one that
          // differs from the server holds edits the server never received.
          if (local.clinical_history !== nextHistory) {
            nextHistory = local.clinical_history;
            setDraftRestored(true);
          }
          nextAmount = local.amount;
        }
        setHistory(nextHistory);
        setAmount(nextAmount);
        setLoadState('ready');
      })
      .catch(() => {
        if (current) setLoadState('error');
      });
    return () => {
      current = false;
    };
  }, [id, reloadToken]);

  // Keep a local copy of the consultation text (debounced) so nothing is lost
  // offline or on reload.
  useEffect(() => {
    if (!touched.current) return;
    const key = consultation?.id ?? (id ? null : NEW_DRAFT);
    if (!key) return;
    const timer = setTimeout(() => {
      draftStore.save(key, { clinical_history: history, amount });
    }, 500);
    return () => clearTimeout(timer);
  }, [history, amount, consultation?.id, id]);

  // Textarea grows with its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [history, loadState]);

  /**
   * The open consultation, creating patient and consultation the first time
   * (first save, draft or attachment). Concurrent callers share one creation.
   */
  const ensureConsultation = useCallback((): Promise<Consultation> => {
    if (consultationRef.current) return Promise.resolve(consultationRef.current);
    if (!creating.current) {
      creating.current = (async () => {
        let current = patientRef.current;
        if (!current) {
          current = await createPatient(inputRef.current);
          applyPatient(current);
        }
        const opened = await startConsultation(current.id);
        applyConsultation(opened);
        // Move the local draft from 'new' to the consultation's key.
        draftStore.save(opened.id, draftRef.current);
        draftStore.clear(NEW_DRAFT);
        navigate(`/paciente/${current.id}`, { replace: true });
        return opened;
      })().finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }, [navigate]);

  /** For attachments: null (with the name error shown) while there is no name yet. */
  const ensureConsultationForFiles = useCallback(async (): Promise<Consultation | null> => {
    if (!consultationRef.current && inputRef.current.full_name.trim() === '') {
      setFieldErrors((prev) => ({ ...prev, name: 'patient.nameRequired' }));
      return null;
    }
    try {
      return await ensureConsultation();
    } catch (error) {
      await reportSaveError(error);
      throw error;
    }
    // reportSaveError only uses state setters and refs, so a stale copy is fine.
  }, [ensureConsultation]);

  async function reportSaveError(error: unknown) {
    if (hasDbMessage(error, 'no_open_shift')) {
      setNeedsShift(true);
      return;
    }
    if (isDuplicateCedula(error)) {
      const existing = await findPatientByCedula(inputRef.current.cedula ?? '').catch(() => null);
      if (existing) {
        setDuplicate(existing);
        return;
      }
    }
    setFormError('errors.saveFailed');
  }

  function validateName(): boolean {
    if (fullName.trim() !== '') return true;
    setFieldErrors((prev) => ({ ...prev, name: 'patient.nameRequired' }));
    return false;
  }

  const showConsultation = !id || consultation !== null;

  const saveAndExit = useSubmitOnce(async () => {
    setFormError(null);
    setNeedsShift(false);
    setSaved(false);
    const errors: FieldErrors = {};
    if (fullName.trim() === '') errors.name = 'patient.nameRequired';
    const value = parsePyg(amount);
    if (value === null) {
      errors.amount = amount.trim() === '' ? 'patient.amountRequired' : 'errors.invalidAmount';
    }
    setFieldErrors(errors);
    if (errors.name || errors.amount || value === null) return;

    try {
      const existed = patientRef.current !== null;
      const open = await ensureConsultation();
      if (existed && patientRef.current) {
        applyPatient(await updatePatient(patientRef.current.id, inputRef.current));
      }
      await saveConsultationDraft(open.id, history);
      await closeConsultation(open.id, value);
      draftStore.clear(open.id);
      draftStore.clear(NEW_DRAFT);
      navigate('/inicio');
    } catch (error) {
      await reportSaveError(error);
    }
  });

  /** Back: keeps the consultation as a server draft (patient stays Active). */
  const goBack = useSubmitOnce(async () => {
    setFormError(null);
    setSaved(false);
    const exitTo = showConsultation ? '/inicio' : '/pacientes';
    if (fullName.trim() === '') {
      // Nothing can be stored without a name; a new form keeps its local draft.
      if (!patientRef.current) {
        navigate(exitTo);
        return;
      }
      validateName();
      return;
    }
    try {
      const existed = patientRef.current !== null;
      if (showConsultation) {
        const open = await ensureConsultation();
        await saveConsultationDraft(open.id, history);
        // The amount only lives on the device; without one the local copy is redundant.
        if (amount.trim() === '') draftStore.clear(open.id);
      }
      if (existed && patientRef.current) {
        await updatePatient(patientRef.current.id, inputRef.current);
      }
      navigate(exitTo);
    } catch (error) {
      await reportSaveError(error);
    }
  });

  /** Saves only the fixed data (patient without an open consultation). */
  const savePatientOnly = useSubmitOnce(async () => {
    setFormError(null);
    setSaved(false);
    if (!validateName() || !patientRef.current) return;
    try {
      applyPatient(await updatePatient(patientRef.current.id, inputRef.current));
      setSaved(true);
    } catch (error) {
      await reportSaveError(error);
    }
  });

  /** Archived patient: new blank consultation (needs an open shift). */
  const reactivate = useSubmitOnce(async () => {
    setFormError(null);
    setNeedsShift(false);
    setSaved(false);
    if (!patientRef.current) return;
    try {
      const opened = await reactivatePatient(patientRef.current.id);
      if (!opened) {
        setNeedsShift(true);
        return;
      }
      touched.current = false;
      applyConsultation(opened);
      setHistory(opened.clinical_history);
      setAmount('');
    } catch {
      setFormError('errors.generic');
    }
  });

  const openShiftNow = useSubmitOnce(async () => {
    try {
      await openShift();
      setNeedsShift(false);
    } catch {
      setFormError('errors.generic');
    }
  });

  const cedulaCheck = useRef(0);
  async function checkCedula() {
    const check = ++cedulaCheck.current;
    setDuplicate(null);
    if (normalizeCedula(cedula) === null) return;
    try {
      const found = await findPatientByCedula(cedula);
      if (check !== cedulaCheck.current) return;
      if (found && found.id !== patientRef.current?.id) setDuplicate(found);
    } catch {
      // The database still rejects a duplicate on save.
    }
  }

  function handleAmountBlur() {
    const value = parsePyg(amount);
    if (value !== null) setAmount(formatPyg(value));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (showConsultation) void saveAndExit.run();
    else void savePatientOnly.run();
  }

  const busy = saveAndExit.busy || goBack.busy || savePatientOnly.busy;
  const title = id ? patient?.full_name || t('patient.title') : t('patient.newTitle');

  if (loadState !== 'ready') {
    return (
      <Layout title={t('patient.title')} back="/inicio">
        {loadState === 'loading' ? (
          <p className="muted" role="status">
            {t('common.loading')}
          </p>
        ) : (
          <div className="stack">
            <p className="field-error">{t('errors.loadFailed')}</p>
            <button type="button" className="btn" onClick={() => setReloadToken((n) => n + 1)}>
              {t('common.retry')}
            </button>
          </div>
        )}
      </Layout>
    );
  }

  return (
    <Layout title={title} onBack={() => void goBack.run()}>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        {draftRestored && (
          <p className="alert" role="status">
            {t('patient.draftRestored')}
          </p>
        )}

        <section className="card">
          <div className="field">
            <label htmlFor="full_name">{t('patient.fullName')}</label>
            <input
              id="full_name"
              autoComplete="off"
              value={fullName}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? 'full_name-error' : undefined}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
            {fieldErrors.name && (
              <p id="full_name-error" className="field-error">
                {t(fieldErrors.name)}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="birth_date">
              {t('patient.birthDate')} <span className="muted">{t('common.optional')}</span>
            </label>
            <input
              id="birth_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="cedula">
              {t('patient.cedula')} <span className="muted">{t('common.optional')}</span>
            </label>
            <input
              id="cedula"
              autoComplete="off"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              onBlur={() => void checkCedula()}
            />
          </div>

          {duplicate && (
            <div className="alert stack" role="alert">
              <p>{t('patient.duplicate', { name: duplicate.full_name })}</p>
              <Link to={`/paciente/${duplicate.id}`} className="btn">
                {t('patient.openExisting')}
              </Link>
            </div>
          )}
        </section>

        {showConsultation ? (
          <section className="card">
            <div className="field">
              <label htmlFor="clinical_history">{t('patient.clinicalHistory')}</label>
              <textarea
                id="clinical_history"
                ref={textareaRef}
                value={history}
                onChange={(e) => {
                  touched.current = true;
                  setHistory(e.target.value);
                }}
              />
            </div>

            <FileUploader
              consultation={consultation}
              ensureConsultation={ensureConsultationForFiles}
              onBusyChange={setUploading}
            />

            <div className="field">
              <label htmlFor="amount">{t('patient.amount')}</label>
              <input
                id="amount"
                inputMode="numeric"
                autoComplete="off"
                value={amount}
                aria-invalid={fieldErrors.amount ? true : undefined}
                aria-describedby={fieldErrors.amount ? 'amount-error' : undefined}
                onChange={(e) => {
                  touched.current = true;
                  setAmount(e.target.value);
                  if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                onBlur={handleAmountBlur}
              />
              {fieldErrors.amount && (
                <p id="amount-error" className="field-error">
                  {t(fieldErrors.amount)}
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="card stack">
            <p className="muted">{t('patient.noOpenConsultation')}</p>
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={busy || reactivate.busy}
              onClick={() => void reactivate.run()}
            >
              {t('patient.reactivate')}
            </button>
          </section>
        )}

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

        {formError && (
          <p className="alert alert-danger" role="alert">
            {t(formError)}
          </p>
        )}

        {saved && (
          <p className="alert" role="status">
            {t('patient.saved')}
          </p>
        )}

        <div className="home-grid">
          <button
            type="submit"
            className="btn btn-primary btn-big"
            disabled={busy || uploading}
          >
            {busy ? t('common.saving') : showConsultation ? t('patient.saveAndExit') : t('common.save')}
          </button>
          <button
            type="button"
            className="btn btn-big"
            disabled={busy}
            onClick={() => void goBack.run()}
          >
            {t('common.back')}
          </button>
        </div>
      </form>

      {patient && (
        <div className="history-section">
          <ConsultationHistory key={patient.id} patientId={patient.id} />
        </div>
      )}
    </Layout>
  );
}
