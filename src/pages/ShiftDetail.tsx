import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import ShiftSummary from '../components/ShiftSummary';
import { getShift } from '../data/shifts';
import { formatDate, formatTime } from '../lib/dates';
import { isNotFoundError } from '../lib/errors';
import type { Shift } from '../lib/types';

type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

/** /turnos/:id — a previous shift, read only. */
export default function ShiftDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      try {
        const next = await getShift(id);
        if (!isCurrent()) return;
        setShift(next);
        setLoadState('ready');
      } catch (error) {
        if (isCurrent()) setLoadState(isNotFoundError(error) ? 'not-found' : 'error');
      }
    },
    [id],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  const title =
    shift !== null ? t('shift.detailTitle', { date: formatDate(shift.opened_at) }) : t('finances.title');

  return (
    <Layout title={title} back="/financas">
      <div className="stack">
        {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
        {loadState === 'not-found' && <p className="empty">{t('errors.notFound')}</p>}
        {loadState === 'error' && (
          <div className="stack">
            <p className="field-error">{t('errors.loadFailed')}</p>
            <button type="button" className="btn" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        )}
        {loadState === 'ready' && shift && (
          <>
            <dl className="card summary-list">
              <div>
                <dt>{t('shift.openedAt')}</dt>
                <dd>
                  {formatDate(shift.opened_at)} {formatTime(shift.opened_at)}
                </dd>
              </div>
              {shift.closed_at && (
                <div>
                  <dt>{t('shift.closedAt')}</dt>
                  <dd>
                    {formatDate(shift.closed_at)} {formatTime(shift.closed_at)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="muted">{t('shift.readOnly')}</p>
            <ShiftSummary shiftId={shift.id} readOnly />
          </>
        )}
      </div>
    </Layout>
  );
}
