import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listClosedConsultations, type ClosedConsultation } from '../data/consultations';
import { listFiles } from '../data/files';
import { formatDate } from '../lib/dates';
import { formatPyg } from '../lib/money';
import type { ConsultationFile } from '../lib/types';
import { FileLink, FilePreview } from './FileUploader';

type LoadState = 'loading' | 'ready' | 'error';

/** First two lines of the clinical history, for the collapsed card. */
function preview(text: string): string {
  return text.split('\n').slice(0, 2).join('\n');
}

/** A patient's finished consultations, newest first. Read-only. */
export default function ConsultationHistory({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const [consultations, setConsultations] = useState<ClosedConsultation[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      try {
        const closed = await listClosedConsultations(patientId);
        if (!isCurrent()) return;
        setConsultations(closed);
        setLoadState('ready');
      } catch {
        if (isCurrent()) setLoadState('error');
      }
    },
    [patientId],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  return (
    <section className="stack" aria-labelledby="history-title">
      <h2 id="history-title">{t('patient.history')}</h2>
      {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
      {loadState === 'error' && (
        <div className="stack">
          <p className="field-error">{t('errors.loadFailed')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {loadState === 'ready' && consultations.length === 0 && (
        <p className="empty">{t('patient.historyEmpty')}</p>
      )}
      {loadState === 'ready' &&
        consultations.map((consultation) => {
          const open = expanded === consultation.id;
          const bodyId = `history-${consultation.id}`;
          return (
            <article key={consultation.id} className="card history-card">
              <button
                type="button"
                className="history-card__toggle"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setExpanded(open ? null : consultation.id)}
              >
                <span className="history-card__head">
                  <strong>
                    {t('patient.consultationOf', {
                      date: formatDate(consultation.closed_at ?? consultation.started_at),
                    })}
                  </strong>
                  <span>{formatPyg(consultation.amount_pyg ?? 0)}</span>
                </span>
                {!open && consultation.clinical_history !== '' && (
                  <span className="history-card__preview">
                    {preview(consultation.clinical_history)}
                  </span>
                )}
                <span className="history-card__meta muted">
                  {t('patient.fileCount', { count: consultation.file_count })}
                  {' · '}
                  {open ? t('patient.showLess') : t('patient.showMore')}
                </span>
              </button>
              {open && (
                <div id={bodyId} className="stack history-card__body">
                  <p className="muted">{t('patient.readOnly')}</p>
                  {consultation.clinical_history !== '' && (
                    <p className="history-card__text">{consultation.clinical_history}</p>
                  )}
                  {consultation.file_count > 0 && <HistoryFiles consultationId={consultation.id} />}
                </div>
              )}
            </article>
          );
        })}
    </section>
  );
}

/** Files of a finished consultation; each opens in a new tab (signed URL created on tap). */
function HistoryFiles({ consultationId }: { consultationId: string }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<ConsultationFile[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    listFiles(consultationId)
      .then((stored) => {
        if (current) setFiles(stored);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [consultationId]);

  if (failed) return <p className="field-error">{t('errors.loadFailed')}</p>;
  if (!files) return <p className="muted">{t('common.loading')}</p>;
  if (files.length === 0) return <p className="muted">{t('patient.filesEmpty')}</p>;
  return (
    <ul className="list file-list" aria-label={t('patient.files')}>
      {files.map((file) => (
        <li key={file.id}>
          <FilePreview file={file} />
          <FileLink file={file} />
        </li>
      ))}
    </ul>
  );
}
