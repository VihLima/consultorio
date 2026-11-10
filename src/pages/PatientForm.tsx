import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import ConsultationHistory from '../components/ConsultationHistory';
import FileUploader from '../components/FileUploader';
import {
  closeConsultation,
  getConsultation,
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
import { getOpenShift, openShift } from '../data/shifts';
import { draftStore, type Draft } from '../lib/draftStore';
import { formatPyg, parsePyg } from '../lib/money';
import { normalizeCedula } from '../lib/patients';
import { closedOutcome } from '../lib/closedOutcome';
import { pickDraft } from '../lib/pickDraft';
import type { Consultation, Patient } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';

const NEW_DRAFT = 'new';

/** Same shape as the RPC/trigger error, so reportSaveError handles both alike. */
const NO_OPEN_SHIFT = { message: 'no_open_shift' };

interface FieldErrors {
  name?: string;
  amount?: string;
}

function hasContent(draft: Draft): boolean {
  return [draft.full_name, draft.birth_date, draft.cedula, draft.clinical_history, draft.amount].some(
    (value) => value !== undefined && value.trim() !== '',
  );
}

function isDuplicateCedula(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === DUPLICATE_CEDULA
  );
}

/** The consultation is no longer open (closed here with a lost response, or elsewhere). */
function isNotOpen(error: unknown): boolean {
  return hasDbMessage(error, 'consultation_closed') || hasDbMessage(error, 'consultation_not_open');
}

/**
 * Route element for /paciente/novo and /paciente/:id. The form is keyed on the
 * route so opening another patient starts from a clean state (and stops its
 * uploads). The one exception is the patient this form just created: the URL
 * moves from /paciente/novo to /paciente/:id and the form keeps running.
 */
export default function PatientFormRoute() {
  const { id } = useParams();
  const location = useLocation();
  const [adopted, setAdopted] = useState<{ id: string; key: string } | null>(null);
  const formKey = id ? (adopted?.id === id ? adopted.key : id) : `new:${location.key}`;
  const keyRef = useRef(formKey);
  keyRef.current = formKey;
  const handleCreated = useCallback((patientId: string) => {
    setAdopted({ id: patientId, key: keyRef.current });
  }, []);
  return <PatientForm key={formKey} onCreated={handleCreated} />;
}

function PatientForm({ onCreated }: { onCreated: (patientId: string) => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [shiftMissing, setShiftMissing] = useState(false);
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
  /** A `draft:new` found on /paciente/novo, waiting for keep / discard. */
  const [pendingNewDraft, setPendingNewDraft] = useState<Draft | null>(null);

  // Latest values for async flows that outlive a render (uploads, saves, page hide).
  const patientRef = useRef<Patient | null>(null);
  const consultationRef = useRef<Consultation | null>(null);
  const valuesRef = useRef({ fullName, birthDate, cedula, history, amount });
  valuesRef.current = { fullName, birthDate, cedula, history, amount };
  const inputRef = useRef<PatientInput>({ full_name: '', birth_date: null, cedula: null });
  inputRef.current = { full_name: fullName, birth_date: birthDate || null, cedula: cedula || null };
  /** This form was opened on /paciente/novo (its local draft lives under `draft:new` until a consultation exists). */
  const startedNew = useRef(!id);
  /** The consultation text the server has, as far as this form knows (the draft's `base`). */
  const serverText = useRef('');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** True once the user edited something (only then is a local draft written). */
  const touched = useRef(false);
  /** Set on a final save or a deliberate exit: no local draft may be written afterwards. */
  const finished = useRef(false);
  const creating = useRef<Promise<Consultation> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyPatient(next: Patient | null) {
    patientRef.current = next;
    setPatient(next);
  }

  function applyConsultation(next: Consultation | null) {
    consultationRef.current = next;
    setConsultation(next);
  }

  function cancelDraftTimer() {
    clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
  }

  /** Writes the local draft now (consultation draft, or `draft:new` before one exists). */
  const writeLocalDraft = useCallback(() => {
    cancelDraftTimer();
    if (finished.current) return;
    const values = valuesRef.current;
    const open = consultationRef.current;
    if (open) {
      draftStore.save(open.id, {
        clinical_history: values.history,
        amount: values.amount,
        base: serverText.current,
      });
    } else if (startedNew.current) {
      const draft: Draft = {
        clinical_history: values.history,
        amount: values.amount,
        full_name: values.fullName,
        birth_date: values.birthDate,
        cedula: values.cedula,
      };
      draftStore.save(NEW_DRAFT, draft);
    }
  }, []);

  /** After the server stored `text` for the open consultation: the local draft is based on it. */
  function afterServerSave(consultationId: string, text: string) {
    serverText.current = text;
    const values = valuesRef.current;
    if (values.amount.trim() === '' && values.history === text) {
      cancelDraftTimer();
      draftStore.clear(consultationId); // nothing the server does not have
    } else {
      writeLocalDraft();
    }
  }

  /** Final save done or deliberate exit: drop local drafts and stop writing them. */
  function finish(consultationId: string | null) {
    cancelDraftTimer();
    finished.current = true;
    if (consultationId) draftStore.clear(consultationId);
    if (startedNew.current) draftStore.clear(NEW_DRAFT);
  }

  // Load: on /paciente/novo check the shift and restore `draft:new`; otherwise
  // the patient, the open consultation and a newer local draft.
  useEffect(() => {
    // Patient just created by this form (URL replaced from /paciente/novo): already loaded.
    if (id && patientRef.current?.id === id) return;

    let current = true;
    setLoadState('loading');

    if (!id) {
      getOpenShift()
        .then((shift) => {
          if (!current) return;
          setShiftMissing(!shift);
          // A leftover draft is never pre-filled silently: the doctor decides
          // whether it belongs to this patient (keep) or not (discard).
          const local = draftStore.load(NEW_DRAFT);
          if (local && hasContent(local)) setPendingNewDraft(local);
          setLoadState('ready');
        })
        .catch(() => {
          if (current) setLoadState('error');
        });
      return () => {
        current = false;
      };
    }

    Promise.all([getPatient(id), getOpenConsultation(id)])
      .then(([loadedPatient, open]) => {
        if (!current) return;
        applyPatient(loadedPatient);
        applyConsultation(open);
        setFullName(loadedPatient.full_name);
        setBirthDate(loadedPatient.birth_date ?? '');
        setCedula(loadedPatient.cedula ?? '');
        if (open) {
          serverText.current = open.clinical_history;
          const picked = pickDraft(open.clinical_history, draftStore.load(open.id));
          setHistory(picked.clinical_history);
          setAmount(picked.amount);
          setDraftRestored(picked.restored);
        }
        setLoadState('ready');
      })
      .catch(() => {
        if (current) setLoadState('error');
      });
    return () => {
      current = false;
    };
  }, [id, reloadToken]);

  // Local draft 500 ms after the last change.
  useEffect(() => {
    if (!touched.current) return;
    cancelDraftTimer();
    draftTimer.current = setTimeout(writeLocalDraft, 500);
    return cancelDraftTimer;
  }, [history, amount, fullName, birthDate, cedula, writeLocalDraft]);

  // Final flush when the page is hidden or closed, and when the form unmounts
  // (e.g. the browser's back button) — the debounce must not lose the last edit.
  useEffect(() => {
    const flush = () => {
      if (touched.current) writeLocalDraft();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [writeLocalDraft]);

  // Textarea grows with its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [history, loadState]);

  /**
   * The open consultation, creating patient and consultation the first time
   * (first save, draft or attachment) — only with an open shift. Concurrent
   * callers share one creation.
   */
  const ensureConsultation = useCallback((): Promise<Consultation> => {
    if (consultationRef.current) return Promise.resolve(consultationRef.current);
    if (!creating.current) {
      creating.current = (async () => {
        if (!(await getOpenShift())) throw NO_OPEN_SHIFT;
        let current = patientRef.current;
        if (!current) {
          current = await createPatient(inputRef.current);
          applyPatient(current);
        }
        const opened = await startConsultation(current.id);
        applyConsultation(opened);
        serverText.current = opened.clinical_history;
        // Move the local draft from 'new' to the consultation's key.
        writeLocalDraft();
        draftStore.clear(NEW_DRAFT);
        onCreated(current.id);
        navigate(`/paciente/${current.id}`, { replace: true });
        return opened;
      })().finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }, [navigate, onCreated, writeLocalDraft]);

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

  /**
   * Handles a save refused because the consultation is no longer open.
   * If the server already holds what is on screen (`closedOutcome` 'done',
   * e.g. our own close whose response was lost), drafts are dropped and
   * `leave` runs. If it was closed with other content ('lost'), the form and
   * its local draft stay and the doctor is told the changes were NOT saved.
   * Returns false when the error is something else (report it as usual).
   */
  async function handleNotOpen(
    error: unknown,
    consultationId: string | null,
    savedHistory: string,
    savedAmount: number | null,
    leave: () => void,
  ): Promise<boolean> {
    if (!consultationId || !isNotOpen(error)) return false;
    const fresh = await getConsultation(consultationId).catch(() => null);
    const outcome = closedOutcome(fresh, savedHistory, savedAmount);
    if (outcome === 'done') {
      finish(consultationId);
      leave();
      return true;
    }
    if (outcome === 'lost') {
      writeLocalDraft();
      setFormError('patient.alreadyClosed');
      return true;
    }
    return false;
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

    let open: Consultation | null = consultationRef.current;
    try {
      const existed = patientRef.current !== null;
      open = await ensureConsultation();
      if (existed && patientRef.current) {
        applyPatient(await updatePatient(patientRef.current.id, inputRef.current));
      }
      await saveConsultationDraft(open.id, history);
      afterServerSave(open.id, history);
      await closeConsultation(open.id, value);
      finish(open.id);
      navigate('/inicio');
    } catch (error) {
      const leave = () => navigate('/inicio');
      if (await handleNotOpen(error, open?.id ?? null, history, value, leave)) return;
      await reportSaveError(error);
    }
  });

  /** Back: keeps the consultation as a server draft (patient stays Active). */
  const goBack = useSubmitOnce(async () => {
    setFormError(null);
    setSaved(false);
    const exitTo = showConsultation ? '/inicio' : '/pacientes';
    if (fullName.trim() === '') {
      if (!patientRef.current) {
        // Deliberate exit from an unnamed new form: nothing to keep.
        finish(null);
        navigate(exitTo);
        return;
      }
      validateName();
      return;
    }
    let open: Consultation | null = consultationRef.current;
    try {
      const existed = patientRef.current !== null;
      if (showConsultation) {
        open = await ensureConsultation();
        await saveConsultationDraft(open.id, history);
        afterServerSave(open.id, history);
      }
      if (existed && patientRef.current) {
        await updatePatient(patientRef.current.id, inputRef.current);
      }
      navigate(exitTo);
    } catch (error) {
      const leave = () => navigate(exitTo);
      if (await handleNotOpen(error, open?.id ?? null, history, null, leave)) return;
      await reportSaveError(error);
    }
  });

  /** "Open existing patient" (duplicate cédula): save what this form holds, then go. */
  const openDuplicate = useSubmitOnce(async () => {
    if (!duplicate) return;
    const target = `/paciente/${duplicate.id}`;
    setFormError(null);
    if (!patientRef.current) {
      // Nothing was created for this person: a deliberate exit, the draft goes away.
      finish(null);
      navigate(target);
      return;
    }
    const open = consultationRef.current;
    try {
      if (open) {
        await saveConsultationDraft(open.id, history);
        afterServerSave(open.id, history);
      }
      navigate(target);
    } catch (error) {
      const leave = () => navigate(target);
      if (await handleNotOpen(error, open?.id ?? null, history, null, leave)) return;
      setFormError('errors.saveFailed');
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
      serverText.current = opened.clinical_history;
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
      setShiftMissing(false);
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

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      touched.current = true;
      setter(value);
    };
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

  const busy =
    saveAndExit.busy ||
    goBack.busy ||
    savePatientOnly.busy ||
    openDuplicate.busy ||
    reactivate.busy;
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

  function keepNewDraft() {
    if (!pendingNewDraft) return;
    setFullName(pendingNewDraft.full_name ?? '');
    setBirthDate(pendingNewDraft.birth_date ?? '');
    setCedula(pendingNewDraft.cedula ?? '');
    setHistory(pendingNewDraft.clinical_history);
    setAmount(pendingNewDraft.amount);
    setPendingNewDraft(null);
    setDraftRestored(true);
  }

  function discardNewDraft() {
    draftStore.clear(NEW_DRAFT);
    setPendingNewDraft(null);
  }

  // No consultation can start without an open shift (spec §7).
  if (!id && shiftMissing) {
    return (
      <Layout title={t('patient.newTitle')} back="/inicio">
        <div className="stack">
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
          {formError && (
            <p className="alert alert-danger" role="alert">
              {t(formError)}
            </p>
          )}
        </div>
      </Layout>
    );
  }

  if (!id && pendingNewDraft) {
    const owner = [pendingNewDraft.full_name?.trim(), pendingNewDraft.cedula?.trim()]
      .filter(Boolean)
      .join(' · ');
    return (
      <Layout title={t('patient.newTitle')} back="/inicio">
        <div className="alert stack" role="alertdialog" aria-labelledby="new-draft-title">
          <p id="new-draft-title">{t('patient.newDraftFound')}</p>
          <p>
            <strong>{owner || t('patient.newDraftUnnamed')}</strong>
          </p>
          {pendingNewDraft.clinical_history.trim() !== '' && (
            <p className="history-card__preview">{pendingNewDraft.clinical_history}</p>
          )}
          <div className="home-grid">
            <button type="button" className="btn btn-primary" onClick={keepNewDraft}>
              {t('patient.keepDraft')}
            </button>
            <button type="button" className="btn" onClick={discardNewDraft}>
              {t('patient.discardDraft')}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={title} onBack={() => void goBack.run()} backDisabled={busy || uploading}>
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
                edit(setFullName)(e.target.value);
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
              onChange={(e) => edit(setBirthDate)(e.target.value)}
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
              onChange={(e) => edit(setCedula)(e.target.value)}
              onBlur={() => void checkCedula()}
            />
          </div>

          {duplicate && (
            <div className="alert stack" role="alert">
              <p>{t('patient.duplicate', { name: duplicate.full_name })}</p>
              <button
                type="button"
                className="btn"
                disabled={busy || uploading}
                onClick={() => void openDuplicate.run()}
              >
                {t('patient.openExisting')}
              </button>
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
                onChange={(e) => edit(setHistory)(e.target.value)}
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
                  edit(setAmount)(e.target.value);
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
              disabled={busy}
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
            disabled={busy || uploading}
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
