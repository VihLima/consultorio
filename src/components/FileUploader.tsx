import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getSignedUrl, listFiles, removeFile, uploadFile } from '../data/files';
import {
  ACCEPTED_FILES,
  findArrivedFile,
  isImage,
  isTimeoutError,
  uploadTimeoutMs,
  validateFile,
  withTimeout,
} from '../lib/files';
import type { Consultation, ConsultationFile } from '../lib/types';

interface FileUploaderProps {
  /** The open consultation, or null while it has not been created yet. */
  consultation: Consultation | null;
  /**
   * Returns the open consultation, creating patient and consultation on the
   * first attachment. Resolves to null when that is not possible yet (the
   * form shows why, e.g. the name is missing); rejects on save errors.
   */
  ensureConsultation: () => Promise<Consultation | null>;
  /** Reports whether files are waiting or uploading (the form waits for them). */
  onBusyChange?: (busy: boolean) => void;
}

/** A selected file that is not stored yet: pending → uploading → (stored) | error. */
interface QueueItem {
  key: number;
  file: File;
  state: 'pending' | 'uploading' | 'error';
  /** Translation key shown when state is 'error'. */
  errorKey?: string;
  /** False for files rejected by validation (retrying would fail the same way). */
  retryable?: boolean;
}

function mergeById(current: ConsultationFile[], incoming: ConsultationFile[]) {
  const known = new Set(current.map((f) => f.id));
  return [...current, ...incoming.filter((f) => !known.has(f.id))];
}

export default function FileUploader({
  consultation,
  ensureConsultation,
  onBusyChange,
}: FileUploaderProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<ConsultationFile[]>([]);
  /** The files shown, also updated right away when a file is added (the upload loop reads it). */
  const filesRef = useRef<ConsultationFile[]>(files);
  filesRef.current = files;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [listError, setListError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const nextKey = useRef(0);
  const processing = useRef(false);
  /** Selections (or retries) waiting to be uploaded; each one is uploaded to one target. */
  const pendingBatches = useRef<QueueItem[][]>([]);
  // The upload loop outlives renders: always call the latest callback.
  const ensureRef = useRef(ensureConsultation);
  ensureRef.current = ensureConsultation;
  const alive = useRef(true);

  const consultationId = consultation?.id ?? null;
  const consultationIdRef = useRef(consultationId);
  consultationIdRef.current = consultationId;

  // Stop the upload loop when the form goes away (e.g. another patient is opened).
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pendingBatches.current = [];
    };
  }, []);

  // Files already stored for this consultation.
  useEffect(() => {
    setListError(false);
    if (!consultationId) {
      setFiles([]);
      return;
    }
    let current = true;
    listFiles(consultationId)
      .then((stored) => {
        if (current) setFiles((prev) => mergeById(prev, stored));
      })
      .catch(() => {
        if (current) setListError(true);
      });
    return () => {
      current = false;
    };
  }, [consultationId]);

  const busy = queue.some((item) => item.state !== 'error');
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function updateItem(key: number, change: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  function failItems(items: QueueItem[], errorKey: string) {
    const keys = new Set(items.map((item) => item.key));
    setQueue((prev) =>
      prev.map((item) =>
        keys.has(item.key) ? { ...item, state: 'error', errorKey, retryable: true } : item,
      ),
    );
  }

  /**
   * A file is stored: drops its queue item and lists the file — unless the
   * form now shows a different consultation (it belongs to the other one).
   */
  function showStored(consultationId: string, key: number, stored: ConsultationFile) {
    if (!alive.current) return;
    setQueue((prev) => prev.filter((q) => q.key !== key));
    const shown = consultationIdRef.current;
    if (shown !== null && shown !== consultationId) return;
    filesRef.current = mergeById(filesRef.current, [stored]);
    setFiles((prev) => mergeById(prev, [stored]));
  }

  /**
   * After a timeout the request may have reached the server anyway: if the
   * file is in the consultation's list now, it is shown as stored (a retry
   * would duplicate it). Otherwise it is shown as failed, and if the request
   * still finishes later, the file then replaces the failed item.
   */
  async function handleTimeout(
    target: Consultation,
    item: QueueItem,
    upload: Promise<ConsultationFile>,
  ) {
    const shownIds = () => new Set(filesRef.current.map((f) => f.id));
    const arrived = await listFiles(target.id)
      .then((stored) => findArrivedFile(stored, shownIds(), item.file))
      .catch(() => null);
    if (!alive.current) return;
    if (arrived) {
      showStored(target.id, item.key, arrived);
      return;
    }
    failItems([item], 'errors.uploadFailed');
    upload.then(
      (stored) => {
        // The file is on the server: show it, unless a retry of it is already
        // under way (that upload will show its own copy).
        const retrying = queueRef.current.some((q) => q.key === item.key && q.state !== 'error');
        if (!retrying) showStored(target.id, item.key, stored);
      },
      () => {},
    );
  }

  /**
   * Uploads one selection. The target consultation is resolved once, when the
   * batch starts, and every file of the batch goes to it; the loop stops if
   * the component unmounts or the form now shows a different consultation.
   */
  async function processBatch(items: QueueItem[]) {
    let target: Consultation | null;
    try {
      target = await ensureRef.current();
    } catch {
      if (alive.current) failItems(items, 'errors.uploadFailed');
      return;
    }
    if (!alive.current) return;
    if (!target) {
      failItems(items, 'patient.nameRequired');
      return;
    }
    for (const [index, item] of items.entries()) {
      const shown = consultationIdRef.current;
      if (!alive.current) return;
      if (shown !== null && shown !== target.id) {
        failItems(items.slice(index), 'errors.uploadFailed');
        return;
      }
      updateItem(item.key, { state: 'uploading', errorKey: undefined });
      const upload = uploadFile(target, item.file);
      try {
        // A hung request must not keep the form busy forever: after the
        // timeout (scaled with the size) the wait ends — see handleTimeout.
        const stored = await withTimeout(upload, uploadTimeoutMs(item.file.size));
        if (!alive.current) return;
        showStored(target.id, item.key, stored);
      } catch (error) {
        if (!alive.current) return;
        if (isTimeoutError(error)) await handleTimeout(target, item, upload);
        else failItems([item], 'errors.uploadFailed');
      }
    }
  }

  async function drain() {
    if (processing.current) return;
    processing.current = true;
    try {
      while (alive.current && pendingBatches.current.length > 0) {
        const batch = pendingBatches.current.shift()!;
        await processBatch(batch);
      }
    } finally {
      processing.current = false;
    }
  }

  function enqueue(items: QueueItem[]) {
    if (items.length === 0) return;
    pendingBatches.current.push(items);
    void drain();
  }

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow selecting the same file again
    const items: QueueItem[] = selected.map((file) => {
      const check = validateFile(file);
      const key = nextKey.current++;
      if (check === 'ok') return { key, file, state: 'pending' };
      return {
        key,
        file,
        state: 'error',
        errorKey: check === 'type' ? 'errors.fileType' : 'errors.fileSize',
        retryable: false,
      };
    });
    setQueue((prev) => [...prev, ...items]);
    enqueue(items.filter((item) => item.state === 'pending'));
  }

  function retry(item: QueueItem) {
    updateItem(item.key, { state: 'pending', errorKey: undefined });
    enqueue([{ ...item, state: 'pending' }]);
  }

  function dismiss(key: number) {
    setQueue((prev) => prev.filter((item) => item.key !== key));
  }

  async function handleRemove(file: ConsultationFile) {
    if (removing) return;
    setRemoving(file.id);
    setRemoveError(false);
    try {
      await removeFile(file);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="field">
      <span className="field-label" id="files-label">
        {t('patient.files')}
      </span>

      {listError && <p className="field-error">{t('errors.loadFailed')}</p>}
      {removeError && <p className="field-error">{t('errors.generic')}</p>}

      {files.length === 0 && queue.length === 0 && !listError && (
        <p className="muted">{t('patient.filesEmpty')}</p>
      )}

      {(files.length > 0 || queue.length > 0) && (
        <ul className="list file-list" aria-labelledby="files-label">
          {files.map((file) => (
            <li key={file.id}>
              <FilePreview file={file} />
              <FileLink file={file} />
              <button
                type="button"
                className="btn btn-danger"
                disabled={removing !== null}
                aria-label={`${t('patient.removeFile')}: ${file.file_name}`}
                onClick={() => void handleRemove(file)}
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
          {queue.map((item) => (
            <li key={`q${item.key}`} aria-live="polite">
              <span className="file-thumb file-thumb--icon" aria-hidden="true">
                {item.state === 'error' ? '!' : <span className="spinner" />}
              </span>
              <span className="file-name">
                {item.file.name}
                <br />
                {item.state === 'pending' && (
                  <span className="muted">{t('patient.uploadWaiting')}</span>
                )}
                {item.state === 'uploading' && (
                  <span className="muted">{t('patient.uploadInProgress')}</span>
                )}
                {item.state === 'error' && item.errorKey && (
                  <span className="field-error">{t(item.errorKey)}</span>
                )}
              </span>
              {item.state === 'error' && (
                <span className="file-actions">
                  {item.retryable && (
                    <button type="button" className="btn" onClick={() => retry(item)}>
                      {t('common.retry')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${t('common.close')}: ${item.file.name}`}
                    onClick={() => dismiss(item.key)}
                  >
                    ×
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="btn file-picker">
        {t('patient.addFiles')}
        <input
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          className="visually-hidden"
          onChange={handleSelect}
        />
      </label>
    </div>
  );
}

/**
 * Thumbnail for images (signed URL created when shown; if the image fails to
 * load — e.g. the URL expired while the page stayed open — a fresh URL is
 * tried once, then the icon is shown), icon for PDF.
 */
export function FilePreview({ file }: { file: ConsultationFile }) {
  const image = isImage(file.mime_type);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!image) return;
    let current = true;
    getSignedUrl(file.storage_path)
      .then((signed) => {
        if (current) setUrl(signed);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [image, file.storage_path]);

  function handleError() {
    if (refreshed.current) {
      setFailed(true);
      return;
    }
    refreshed.current = true;
    getSignedUrl(file.storage_path).then(setUrl, () => setFailed(true));
  }

  if (image && url && !failed) {
    return (
      <img
        className="file-thumb"
        src={url}
        alt=""
        width={56}
        height={56}
        loading="lazy"
        onError={handleError}
      />
    );
  }
  return (
    <span className="file-thumb file-thumb--icon" aria-hidden="true">
      {image ? '🖼' : '📄'}
    </span>
  );
}

/**
 * File name that opens the file in a new tab. The signed URL is created on
 * the tap (signed URLs expire, the page may have been open for hours); the
 * tab is opened first, inside the tap, so the browser does not block it as
 * a pop-up, and pointed at the file once the URL is ready.
 */
export function FileLink({ file }: { file: ConsultationFile }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  async function open() {
    setFailed(false);
    setOpening(true);
    const tab = window.open('', '_blank');
    try {
      const url = await getSignedUrl(file.storage_path);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      tab?.close();
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <span className="file-name">
      <button
        type="button"
        className="link-button"
        title={t('patient.openFile')}
        disabled={opening}
        onClick={() => void open()}
      >
        {file.file_name}
      </button>
      {failed && (
        <>
          <br />
          <span className="field-error">{t('errors.loadFailed')}</span>
        </>
      )}
    </span>
  );
}
