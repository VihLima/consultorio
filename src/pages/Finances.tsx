import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import ShiftSummary, { TotalCards } from '../components/ShiftSummary';
import { listShiftConsultations, listShiftSummaries, type ShiftSummaryRow } from '../data/consultations';
import { listShiftPayments } from '../data/payments';
import { listExpenses } from '../data/expenses';
import { listActivePatients } from '../data/patients';
import { closeShift, getOpenShift } from '../data/shifts';
import { formatDate, formatTime } from '../lib/dates';
import { closeShiftErrorKey } from '../lib/errors';
import { formatPyg } from '../lib/money';
import { countDistinct, shiftTotals, type ShiftTotals } from '../lib/totals';
import type { Shift } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * /financas — the open shift (or, with none open, the last closed one), and
 * the list of previous shifts. /financas?fechar=1 shows the closing summary.
 */
export default function Finances() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [closedShifts, setClosedShifts] = useState<ShiftSummaryRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // Kept here (not in CloseShift) so it survives the reload after a failed close.
  const [closeError, setCloseError] = useState<string | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setLoadState('loading');
    try {
      const [open, closed] = await Promise.all([getOpenShift(), listShiftSummaries()]);
      if (!isCurrent()) return;
      setOpenShift(open);
      setClosedShifts(closed);
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

  if (loadState === 'ready' && openShift && searchParams.get('fechar') === '1') {
    return (
      <CloseShift
        shift={openShift}
        error={closeError}
        onError={(key) => {
          setCloseError(key);
          // The shift may have been closed elsewhere: show what the database has.
          void load();
        }}
      />
    );
  }

  const shown = openShift ?? closedShifts[0] ?? null;

  return (
    <Layout title={t('finances.title')} back="/inicio">
      <div className="stack">
        <p className="muted">{t('design.financesHint')}</p>
        {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
        {loadState === 'error' && (
          <div className="stack">
            <p className="field-error">{t('errors.loadFailed')}</p>
            <button type="button" className="btn" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {closeError && (
          <p className="alert alert-danger" role="alert">
            {t(closeError)}
          </p>
        )}

        {loadState === 'ready' && !shown && <p className="empty">{t('finances.noShifts')}</p>}

        {loadState === 'ready' && shown && (
          <section className="stack" aria-labelledby="shown-shift">
            <h2 id="shown-shift">
              {openShift
                ? t('finances.openShift', {
                    date: formatDate(openShift.opened_at),
                    time: formatTime(openShift.opened_at),
                  })
                : t('finances.lastClosedShift', { date: formatDate(shown.opened_at) })}
            </h2>
            {!openShift && <p className="muted">{t('shift.readOnly')}</p>}
            <ShiftSummary key={shown.id} shiftId={shown.id} readOnly={!openShift} />
          </section>
        )}

        {loadState === 'ready' && (
          <section className="stack history-section" aria-labelledby="previous-shifts">
            <h2 id="previous-shifts">{t('finances.previousShifts')}</h2>
            {closedShifts.length === 0 ? (
              <p className="empty">{t('finances.previousShiftsEmpty')}</p>
            ) : (
              <ul className="list">
                {closedShifts.map((shift) => (
                  <li key={shift.id} className="list-row">
                    <Link to={`/turnos/${shift.id}`} className="list-link">
                      <span className="list-link__main">
                        <strong>{formatDate(shift.opened_at)}</strong>
                        <span className="shift-row__totals">
                          <span>
                            {t('finances.income')}: {formatPyg(shift.income)}
                          </span>
                          <span>
                            {t('finances.expenses')}: {formatPyg(shift.expense)}
                          </span>
                          <span className={shift.balance < 0 ? 'amount-negative' : undefined}>
                            {t('finances.balance')}: {formatPyg(shift.balance)}
                          </span>
                        </span>
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}

interface CloseData {
  patientsSeen: number;
  activePatients: number;
  totals: ShiftTotals;
}

/** Closing summary: patients seen, totals, warning about patients still in progress. */
interface CloseShiftProps {
  shift: Shift;
  error: string | null;
  /** Closing failed: `key` is the message to show. */
  onError(key: string): void;
}

function CloseShift({ shift, error, onError }: CloseShiftProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<CloseData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      try {
        const [consultations, incomes, expenses, active] = await Promise.all([
          listShiftConsultations(shift.id),
          listShiftPayments(shift.id),
          listExpenses(shift.id),
          listActivePatients(),
        ]);
        if (!isCurrent()) return;
        setData({
          patientsSeen: countDistinct(consultations.map((c) => c.patient_id)),
          activePatients: active.length,
          totals: shiftTotals(
            incomes.map((income) => income.amount_pyg),
            expenses.map((expense) => expense.amount_pyg),
          ),
        });
        setLoadState('ready');
      } catch {
        if (isCurrent()) setLoadState('error');
      }
    },
    [shift.id],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  const confirm = useSubmitOnce(async () => {
    try {
      await closeShift(shift.id);
      navigate('/inicio', { replace: true });
    } catch (error) {
      onError(closeShiftErrorKey(error));
    }
  });

  return (
    <Layout title={t('shift.closeTitle')} back="/inicio">
      <div className="stack">
        {loadState === 'loading' && <p className="muted">{t('common.loading')}</p>}
        {loadState === 'error' && (
          <div className="stack">
            <p className="field-error">{t('errors.loadFailed')}</p>
            <button type="button" className="btn" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        )}
        {loadState === 'ready' && data && (
          <section className="stack" aria-labelledby="close-summary-title">
            <h2 id="close-summary-title">{t('shift.summaryTitle')}</h2>
            <dl className="card summary-list">
              <div>
                <dt>{t('shift.openedAt')}</dt>
                <dd>
                  {formatDate(shift.opened_at)} {formatTime(shift.opened_at)}
                </dd>
              </div>
              <div>
                <dt>{t('shift.patientsSeen')}</dt>
                <dd>{data.patientsSeen}</dd>
              </div>
            </dl>
            <TotalCards {...data.totals} />
            {data.activePatients > 0 && (
              <p className="alert" role="status">
                {t('shift.activePatientsWarning', { count: data.activePatients })}
              </p>
            )}
            <p>
              <strong>{t('shift.closeQuestion')}</strong>
            </p>
            <div className="home-grid">
              <button
                type="button"
                className="btn btn-primary btn-big"
                disabled={confirm.busy}
                onClick={() => void confirm.run()}
              >
                {t('common.confirm')}
              </button>
              <button
                type="button"
                className="btn btn-big"
                disabled={confirm.busy}
                onClick={() => navigate('/inicio')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </section>
        )}
        {error && (
          <p className="alert alert-danger" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </Layout>
  );
}
