import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import Icon from '../components/Icon';
import { listActivePatients } from '../data/patients';
import { listShiftConsultations } from '../data/consultations';
import { listShiftPayments, type ShiftPayment } from '../data/payments';
import { listExpenses } from '../data/expenses';
import { getOpenShift, openShift } from '../data/shifts';
import { formatDate, formatTime, isStaleShift } from '../lib/dates';
import { formatPyg } from '../lib/money';
import { shiftTotals } from '../lib/totals';
import type { Expense, Patient, Shift } from '../lib/types';

type LoadState = 'loading' | 'ready' | 'error';
type ActivePatient = Patient & { consultation_id: string };

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [shift, setShift] = useState<Shift | null>(null);
  const [patients, setPatients] = useState<ActivePatient[]>([]);
  const [incomes, setIncomes] = useState<ShiftPayment[]>([]);
  const [finished, setFinished] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState(false);
  const [needsShift, setNeedsShift] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setLoadState('loading');
    try {
      const [open, active] = await Promise.all([getOpenShift(), listActivePatients()]);
      const [closed, income, expense] = open ? await Promise.all([listShiftConsultations(open.id), listShiftPayments(open.id), listExpenses(open.id)]) : [[], [], []];
      if (!isCurrent()) return;
      setShift(open); setPatients(active); setFinished(closed.length); setIncomes(income); setExpenses(expense);
      setLoadState('ready');
    } catch { if (isCurrent()) setLoadState('error'); }
  }, []);

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => { current = false; };
  }, [load]);

  async function handleOpenShift() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError(false);
    try { await openShift(); setNeedsShift(false); await load(); }
    catch { setActionError(true); await load(); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function handlePatient() {
    if (shift) navigate('/paciente/novo');
    else setNeedsShift(true);
  }
  const ready = loadState === 'ready';
  const totals = shiftTotals(incomes.map(item => item.amount_pyg), expenses.map(item => item.amount_pyg));
  const scale = Math.max(totals.income, totals.expense, 1);
  const stale = shift !== null && isStaleShift(shift.opened_at, new Date().toISOString());
  const value = (amount: number, money = false) => ready ? money ? formatPyg(amount) : String(amount).padStart(2, '0') : '—';

  return <Layout>
    <div className="dashboard-heading"><div><span className="eyebrow">{t('design.dailyOverview')}</span><h1>{t('design.overview')}</h1><p className="muted">{t('design.overviewSubtitle')}</p></div><button className="btn btn-primary" disabled={!ready || busy} onClick={handlePatient}><Icon name="plus" />{t('design.newConsultation')}</button></div>
    <div className="dashboard-stack">
      {loadState === 'loading' && <p className="loading-line" role="status"><span className="spinner" />{t('common.loading')}</p>}
      {loadState === 'error' && <div className="alert alert-danger section-heading" role="alert"><p>{t('errors.loadFailed')}</p><button className="btn" onClick={() => void load()}>{t('common.retry')}</button></div>}
      {actionError && <p className="alert alert-danger" role="alert">{t('errors.generic')}</p>}
      {stale && shift && <p className="alert" role="status">{t('shift.staleWarning', { date: formatDate(shift.opened_at) })}</p>}
      {needsShift && !shift && <div className="alert section-heading" role="alert"><p>{t('shift.requiredToAttend')}</p><button className="btn btn-primary" disabled={busy || !ready} onClick={() => void handleOpenShift()}>{t('home.openShift')}</button></div>}

      <section className="shift-banner" aria-label={t('shift.current')}>
        <div className="shift-banner__icon"><Icon name="pulse" size={26} /></div>
        <div className="shift-banner__copy"><span className="eyebrow">{t('design.yourShift')}</span><h2>{!ready ? '—' : shift ? t('design.shiftOpen') : t('design.shiftClosed')}</h2><p>{!ready ? t(loadState === 'error' ? 'errors.loadFailed' : 'common.loading') : shift ? `${formatDate(shift.opened_at)} · ${t('shift.openSince', { time: formatTime(shift.opened_at) })}` : t('design.shiftHint')}</p></div>
        {ready && <span className={`shift-status ${shift ? 'is-open' : ''}`}><span />{shift ? t('design.inOperation') : t('design.notStarted')}</span>}
        <button className="btn btn-shift" disabled={busy || !ready} onClick={shift ? () => navigate('/financas?fechar=1') : () => void handleOpenShift()}>{shift ? t('home.closeShift') : t('home.openShift')}<Icon name="arrow" size={17} /></button>
      </section>

      <section className="metrics-grid" aria-label={t('shift.summaryTitle')} aria-busy={!ready}>
        <article className="metric"><div className="metric-label"><span>{t('home.inProgress')}</span><Icon name="patients" /></div><strong>{value(patients.length)}</strong><span className="metric-foot"><span className="status-dot" />{t('design.openDrafts')}</span></article>
        <article className="metric"><div className="metric-label"><span>{t('design.finished')}</span><Icon name="check" /></div><strong>{value(finished)}</strong><span className="metric-foot">{t('design.inCurrentShift')}</span></article>
        <article className="metric"><div className="metric-label"><span>{t('finances.income')}</span><Icon name="chart" /></div><strong className="metric-money">{value(totals.income, true)}</strong><span className="metric-foot">{t('design.finishedIncome')}</span></article>
        <article className="metric metric-balance"><div className="metric-label"><span>{t('finances.balance')}</span><Icon name="wallet" /></div><strong className={`metric-money ${totals.balance < 0 ? 'amount-negative' : ''}`}>{value(totals.balance, true)}</strong><span className="metric-foot">{t('design.netBalance')}</span></article>
      </section>

      <div className="dashboard-columns">
        <section className="panel" aria-labelledby="in-progress-title">
          <div className="panel-heading"><div><h2 id="in-progress-title">{t('home.inProgress')} <span className="count-badge">{ready ? patients.length : '—'}</span></h2><p>{t('design.resumeHint')}</p></div><Link className="text-link" to="/pacientes">{t('design.seePatients')}<Icon name="arrow" size={16} /></Link></div>
          <div className="table-caption"><span>{t('patient.title')}</span><span>{t('design.action')}</span></div>
          {!ready ? <p className="empty">{t(loadState === 'error' ? 'errors.loadFailed' : 'common.loading')}</p> : patients.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="check" size={30} /></span><h3>{t('design.allClear')}</h3><p>{t('home.inProgressEmpty')}</p><button className="btn" onClick={handlePatient}>{t('design.newConsultation')}<Icon name="plus" size={16} /></button></div> : <ul className="patient-queue">{patients.map(patient => <li key={patient.consultation_id}><Link to={`/paciente/${patient.id}`}><span className="avatar">{patient.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</span><span className="patient-queue__name"><strong>{patient.full_name}</strong><span>{patient.cedula ? `${t('patient.cedula')}: ${patient.cedula}` : t('design.pendingRecord')}</span></span><span className="resume-label">{t('home.resume')}<Icon name="arrow" size={17} /></span></Link></li>)}</ul>}
          <div className="panel-footer"><Icon name="file" size={15} /><span>{t('design.draftsNote')}</span></div>
        </section>

        <section className="panel finance-panel" aria-labelledby="financial-title">
          <div className="panel-heading"><div><h2 id="financial-title">{t('design.financialOverview')}</h2><p>{t('design.inCurrentShift')}</p></div><Icon name="wallet" /></div>
          <div className="finance-chart">
            <div className="bar-label"><span><i className="legend-dot income-dot" />{t('finances.income')}</span><strong>{value(totals.income, true)}</strong></div><div className="bar-track" aria-hidden="true"><div className="bar-income" style={{ width: ready ? `${totals.income / scale * 100}%` : '0%' }} /></div>
            <div className="bar-label"><span><i className="legend-dot expense-dot" />{t('finances.expenses')}</span><strong>{value(totals.expense, true)}</strong></div><div className="bar-track" aria-hidden="true"><div className="bar-expense" style={{ width: ready ? `${totals.expense / scale * 100}%` : '0%' }} /></div>
            <div className="balance-line"><span>{t('finances.balance')}</span><strong className={totals.balance < 0 ? 'amount-negative' : ''}>{value(totals.balance, true)}</strong></div>
            <p className="chart-note">{t(ready && !shift ? 'design.noShiftData' : 'design.financeNote')}</p>
          </div><Link className="panel-link" to="/financas">{t('design.manageFinances')}<Icon name="arrow" size={17} /></Link>
        </section>
      </div>

      <section className="panel recent-panel" aria-labelledby="recent-title">
        <div className="panel-heading"><div><h2 id="recent-title">{t('design.recentActivity')}</h2><p>{t('design.recentHint')}</p></div><button className="btn btn-small" disabled={loadState === 'loading' || busy} onClick={() => void load()}><Icon name="refresh" size={16} />{t('design.refresh')}</button></div>
        {ready && incomes.length > 0 ? <ul className="recent-list">{incomes.slice(-5).reverse().map(income => <li key={income.id}><span className="activity-icon"><Icon name="check" size={18} /></span><span className="activity-time">{formatTime(income.paid_at)}</span><Link to={`/paciente/${income.patient_id}`}><strong>{income.patient_name}</strong><span>{t('payments.received')} · {t(`payments.methods.${income.method}`)}</span></Link><span className="amount">{formatPyg(income.amount_pyg)}</span></li>)}</ul> : <p className="empty recent-empty"><Icon name="clock" />{t(!ready ? loadState === 'error' ? 'errors.loadFailed' : 'common.loading' : 'design.noActivity')}</p>}
      </section>
    </div>
  </Layout>;
}
