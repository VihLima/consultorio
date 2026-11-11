import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { hasDbMessage, listClosedConsultations } from '../data/consultations';
import { addPayment, listPatientPayments, removePayment } from '../data/payments';
import { getOpenShift } from '../data/shifts';
import { formatDate, formatTime } from '../lib/dates';
import { formatPyg, parsePyg } from '../lib/money';
import { patientBalance } from '../lib/totals';
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';
import Icon from './Icon';

type LoadState = 'loading' | 'ready' | 'error';

interface Data {
  charges: number[];
  payments: Payment[];
  openShiftId: string | null;
}

/**
 * The patient's account: total charged (finished consultations), total paid,
 * pending balance, the payment history and a form to receive part or all of
 * what is pending (in the open shift). `refreshKey` reloads it from outside.
 */
export default function PatientPayments({ patientId, refreshKey = 0 }: { patientId: string; refreshKey?: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      try {
        const [consultations, payments, shift] = await Promise.all([
          listClosedConsultations(patientId),
          listPatientPayments(patientId),
          getOpenShift(),
        ]);
        if (!isCurrent()) return;
        setData({
          charges: consultations.map((c) => c.amount_pyg ?? 0),
          payments,
          openShiftId: shift?.id ?? null,
        });
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
  }, [load, refreshKey]);

  const balance = data
    ? patientBalance(data.charges, data.payments.map((p) => p.amount_pyg))
    : null;

  function openForm() {
    setError(null);
    setAmount(balance && balance.pending > 0 ? formatPyg(balance.pending) : '');
    setMethod('cash');
    setFormOpen(true);
  }

  const save = useSubmitOnce(async () => {
    setError(null);
    const value = parsePyg(amount);
    if (value === null || value <= 0) {
      setError('finances.amountPositive');
      return;
    }
    if (balance && value > balance.pending) {
      setError('payments.moreThanPending');
      return;
    }
    try {
      await addPayment(patientId, value, method);
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(hasDbMessage(e, 'no_open_shift') || hasDbMessage(e, 'shift_closed') ? 'payments.needsShift' : 'errors.saveFailed');
    }
  });

  const remove = useSubmitOnce(async () => {
    if (!removingId) return;
    setError(null);
    try {
      await removePayment(removingId);
      setRemovingId(null);
      await load();
    } catch (e) {
      setRemovingId(null);
      setError(hasDbMessage(e, 'shift_closed') ? 'payments.removeClosed' : 'errors.saveFailed');
    }
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save.run();
  }

  return (
    <section className="card payments-card stack" aria-labelledby="payments-title">
      <div className="form-section-title">
        <span><Icon name="wallet" /></span>
        <div>
          <h2 id="payments-title">{t('payments.title')}</h2>
          <p>{t('payments.hint')}</p>
        </div>
      </div>

      {loadState === 'loading' && <p className="muted" role="status">{t('common.loading')}</p>}
      {loadState === 'error' && (
        <div className="stack">
          <p className="field-error">{t('errors.loadFailed')}</p>
          <button type="button" className="btn" onClick={() => void load()}>{t('common.retry')}</button>
        </div>
      )}

      {loadState === 'ready' && data && balance && (
        <>
          <dl className="balance-grid">
            <div><dt>{t('payments.charged')}</dt><dd className="amount">{formatPyg(balance.charged)}</dd></div>
            <div><dt>{t('payments.paid')}</dt><dd className="amount">{formatPyg(balance.paid)}</dd></div>
            <div className={balance.pending > 0 ? 'balance-pending is-due' : 'balance-pending'}>
              <dt>{t('payments.pending')}</dt>
              <dd className="amount">{formatPyg(balance.pending)}</dd>
            </div>
          </dl>

          {balance.pending > 0 && !formOpen && (
            <button type="button" className="btn btn-primary" onClick={openForm}>
              <Icon name="plus" size={18} />
              {t('payments.add')}
            </button>
          )}

          {formOpen && (
            <form className="payment-form stack" onSubmit={handleSubmit} noValidate>
              {!data.openShiftId && <p className="alert">{t('payments.needsShift')}</p>}
              <div className="payment-form__row">
                <div className="field">
                  <label htmlFor="payment-amount">{t('payments.amount')}</label>
                  <input
                    id="payment-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => {
                      const value = parsePyg(amount);
                      if (value !== null) setAmount(formatPyg(value));
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="payment-method">{t('payments.method')}</label>
                  <select id="payment-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{t(`payments.methods.${m}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row-actions">
                <button type="submit" className="btn btn-primary" disabled={save.busy || !data.openShiftId}>
                  {save.busy ? t('common.saving') : t('payments.save')}
                </button>
                <button type="button" className="btn" disabled={save.busy} onClick={() => setFormOpen(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}

          {error && <p className="alert alert-danger" role="alert">{t(error)}</p>}

          <h3 className="payments-history-title">{t('payments.history')}</h3>
          {data.payments.length === 0 ? (
            <p className="empty">{t('payments.empty')}</p>
          ) : (
            <ul className="list payment-list">
              {data.payments.map((payment) => (
                <li key={payment.id} className="expense-row">
                  <span className="list-link__main">
                    {formatDate(payment.paid_at)} · {formatTime(payment.paid_at)}
                    <span className="list-link__sub muted">
                      {t(`payments.methods.${payment.method}`)} ·{' '}
                      {t(payment.consultation_id ? 'payments.atConsultation' : 'payments.later')}
                    </span>
                  </span>
                  <span className="amount">{formatPyg(payment.amount_pyg)}</span>
                  {payment.shift_id === data.openShiftId && removingId !== payment.id && (
                    <div className="row-actions">
                      <button type="button" className="btn btn-small" disabled={remove.busy} onClick={() => setRemovingId(payment.id)}>
                        {t('common.remove')}
                      </button>
                    </div>
                  )}
                  {removingId === payment.id && (
                    <div className="expense-row__confirm" role="alertdialog" aria-labelledby={`remove-payment-${payment.id}`}>
                      <p id={`remove-payment-${payment.id}`}>{t('payments.removeQuestion')}</p>
                      <div className="row-actions">
                        <button type="button" className="btn btn-danger" disabled={remove.busy} onClick={() => void remove.run()}>
                          {t('common.remove')}
                        </button>
                        <button type="button" className="btn" disabled={remove.busy} onClick={() => setRemovingId(null)}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
