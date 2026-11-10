import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getSignedUrl, listFiles, removeFile, uploadFile } from '../data/files';
import { ACCEPTED_FILES, isImage, validateFile } from '../lib/files';
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
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QueueItem[]>([]);
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

  // Signed URLs (thumbnails and links) for files that do not have one yet.
  useEffect(() => {
    const missing = files.filter((f) => !(f.id in urls));
    if (missing.length === 0) return;
    let current = true;
    void Promise.all(
      missing.map((f) =>
        getSignedUrl(f.storage_path)
          .then((url) => [f.id, url] as const)
          .catch(() => [f.id, ''] as const),
      ),
    ).then((entries) => {
      if (current) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      current = false;
    };
  }, [files, urls]);

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
      try {
        const stored = await uploadFile(target, item.file);
        if (!alive.current) return;
        setFiles((prev) => mergeById(prev, [stored]));
        setQueue((prev) => prev.filter((q) => q.key !== item.key));
      } catch {
        if (alive.current) failItems([item], 'errors.uploadFailed');
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
              <FilePreview file={file} url={urls[file.id]} />
              <FileLink file={file} url={urls[file.id]} label={t('patient.openFile')} />
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

/** Thumbnail for images, icon for PDF. */
export function FilePreview({ file, url }: { file: ConsultationFile; url?: string }) {
  if (isImage(file.mime_type) && url) {
    return <img className="file-thumb" src={url} alt="" width={56} height={56} loading="lazy" />;
  }
  return (
    <span className="file-thumb file-thumb--icon" aria-hidden="true">
      {isImage(file.mime_type) ? '🖼' : '📄'}
    </span>
  );
}

/** File name opening the signed URL in a new tab (plain text until the URL is ready). */
export function FileLink({
  file,
  url,
  label,
}: {
  file: ConsultationFile;
  url?: string;
  label: string;
}) {
  if (!url) return <span className="file-name">{file.file_name}</span>;
  return (
    <a
      className="file-name"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
    >
      {file.file_name}
    </a>
  );
}
