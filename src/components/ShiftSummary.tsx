import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { hasDbMessage, listShiftIncomes, type ShiftIncome } from '../data/consultations';
import { addExpense, listExpenses, removeExpense, updateExpense } from '../data/expenses';
import { formatTime } from '../lib/dates';
import { formatPyg, parsePyg } from '../lib/money';
import { shiftTotals } from '../lib/totals';
import type { Expense } from '../lib/types';
import { useSubmitOnce } from '../lib/useSubmitOnce';

type LoadState = 'loading' | 'ready' | 'error';
type Tab = 'income' | 'expenses';

interface ShiftSummaryProps {
  shiftId: string;
  /** Closed shift: no expense form, no edit/remove. */
  readOnly?: boolean;
}

/** Totals, income list (read only) and expense list (+ form while the shift is open). */
export default function ShiftSummary({ shiftId, readOnly = false }: ShiftSummaryProps) {
  const { t } = useTranslation();
  const [incomes, setIncomes] = useState<ShiftIncome[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<Tab>('income');

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setLoadState('loading');
      try {
        const [nextIncomes, nextExpenses] = await Promise.all([
          listShiftIncomes(shiftId),
          listExpenses(shiftId),
        ]);
        if (!isCurrent()) return;
        setIncomes(nextIncomes);
        setExpenses(nextExpenses);
        setLoadState('ready');
      } catch {
        if (isCurrent()) setLoadState('error');
      }
    },
    [shiftId],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  if (loadState === 'loading') return <p className="muted">{t('common.loading')}</p>;
  if (loadState === 'error') {
    return (
      <div className="stack">
        <p className="field-error">{t('errors.loadFailed')}</p>
        <button type="button" className="btn" onClick={() => void load()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const totals = shiftTotals(
    incomes.map((income) => income.amount_pyg),
    expenses.map((expense) => expense.amount_pyg),
  );

  return (
    <div className="stack">
      <TotalCards income={totals.income} expense={totals.expense} balance={totals.balance} />

      {/* Phone: tabs. ≥900px: both panels side by side (the tab bar is hidden). */}
      <div className="money-tabs" role="tablist" aria-label={t('shift.summaryTitle')}>
        {(['income', 'expenses'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-controls={`panel-${name}`}
            aria-selected={tab === name}
            className={tab === name ? 'money-tab money-tab--active' : 'money-tab'}
            onClick={() => setTab(name)}
          >
            {t(name === 'income' ? 'finances.income' : 'finances.expenses')}
          </button>
        ))}
      </div>

      <div className="money-columns">
        <section
          id="panel-income"
          role="tabpanel"
          aria-labelledby="tab-income"
          className={tab === 'income' ? 'money-panel money-panel--active' : 'money-panel'}
        >
          <h2 className="money-panel__title">{t('finances.income')}</h2>
          {incomes.length === 0 ? (
            <p className="empty">{t('finances.incomeEmpty')}</p>
          ) : (
            <ul className="list">
              {incomes.map((income) => (
                <li key={income.consultation_id}>
                  <span className="list-link__main">
                    {income.patient_name}
                    <span className="list-link__sub muted">{formatTime(income.closed_at)}</span>
                  </span>
                  <span className="amount">{formatPyg(income.amount_pyg)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          id="panel-expenses"
          role="tabpanel"
          aria-labelledby="tab-expenses"
          className={tab === 'expenses' ? 'money-panel money-panel--active' : 'money-panel'}
        >
          <h2 className="money-panel__title">{t('finances.expenses')}</h2>
          <Expenses
            shiftId={shiftId}
            readOnly={readOnly}
            expenses={expenses}
            onChange={setExpenses}
          />
        </section>
      </div>
    </div>
  );
}

export function TotalCards({ income, expense, balance }: { income: number; expense: number; balance: number }) {
  const { t } = useTranslation();
  return (
    <dl className="totals">
      <div className="card totals__card">
        <dt>{t('finances.income')}</dt>
        <dd className="amount">{formatPyg(income)}</dd>
      </div>
      <div className="card totals__card">
        <dt>{t('finances.expenses')}</dt>
        <dd className="amount">{formatPyg(expense)}</dd>
      </div>
      <div className="card totals__card">
        <dt>{t('finances.balance')}</dt>
        <dd className={balance < 0 ? 'amount amount-negative' : 'amount'}>{formatPyg(balance)}</dd>
      </div>
    </dl>
  );
}

interface ExpensesProps {
  shiftId: string;
  readOnly: boolean;
  expenses: Expense[];
  onChange(expenses: Expense[]): void;
}

interface FieldErrors {
  description?: string;
  amount?: string;
}

function Expenses({ shiftId, readOnly, expenses, onChange }: ExpensesProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function errorKey(error: unknown) {
    return hasDbMessage(error, 'shift_closed') ? 'shift.readOnly' : 'errors.saveFailed';
  }

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setAmount('');
    setFieldErrors({});
  }

  const save = useSubmitOnce(async () => {
    setFormError(null);
    const value = parsePyg(amount);
    const errors: FieldErrors = {};
    if (description.trim() === '') errors.description = 'errors.required';
    if (amount.trim() === '') errors.amount = 'errors.required';
    else if (value === null) errors.amount = 'errors.invalidAmount';
    else if (value <= 0) errors.amount = 'finances.amountPositive';
    setFieldErrors(errors);
    if (errors.description || errors.amount || value === null) return;

    try {
      if (editingId) {
        const updated = await updateExpense(editingId, description, value);
        onChange(expenses.map((expense) => (expense.id === updated.id ? updated : expense)));
      } else {
        onChange([...expenses, await addExpense(shiftId, description, value)]);
      }
      resetForm();
    } catch (error) {
      // The typed values stay in the form.
      setFormError(errorKey(error));
    }
  });

  const remove = useSubmitOnce(async () => {
    if (!removingId) return;
    setFormError(null);
    try {
      await removeExpense(removingId);
      onChange(expenses.filter((expense) => expense.id !== removingId));
      if (editingId === removingId) resetForm();
      setRemovingId(null);
    } catch (error) {
      setFormError(errorKey(error));
    }
  });

  function startEditing(expense: Expense) {
    setRemovingId(null);
    setEditingId(expense.id);
    setDescription(expense.description);
    setAmount(formatPyg(expense.amount_pyg));
    setFieldErrors({});
    setFormError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  function handleAmountBlur() {
    const value = parsePyg(amount);
    if (value !== null) setAmount(formatPyg(value));
  }

  const busy = save.busy || remove.busy;

  return (
    <div className="stack">
      {expenses.length === 0 ? (
        <p className="empty">{t('finances.expensesEmpty')}</p>
      ) : (
        <ul className="list">
          {expenses.map((expense) => (
            <li key={expense.id} className="expense-row">
              <span className="list-link__main">{expense.description}</span>
              <span className="amount">{formatPyg(expense.amount_pyg)}</span>
              {!readOnly && removingId === expense.id && (
                <div className="expense-row__confirm" role="alertdialog" aria-labelledby={`remove-${expense.id}`}>
                  <p id={`remove-${expense.id}`}>{t('finances.removeExpenseQuestion')}</p>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => void remove.run()}
                    >
                      {t('common.remove')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => setRemovingId(null)}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {!readOnly && removingId !== expense.id && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-label={`${t('common.edit')}: ${expense.description}`}
                    onClick={() => startEditing(expense)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    aria-label={`${t('common.remove')}: ${expense.description}`}
                    onClick={() => setRemovingId(expense.id)}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form className="card" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="expense-description">{t('finances.expenseDescription')}</label>
            <input
              id="expense-description"
              value={description}
              aria-invalid={fieldErrors.description ? true : undefined}
              aria-describedby={fieldErrors.description ? 'expense-description-error' : undefined}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined }));
              }}
            />
            {fieldErrors.description && (
              <p id="expense-description-error" className="field-error">
                {t(fieldErrors.description)}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="expense-amount">{t('finances.expenseAmount')}</label>
            <input
              id="expense-amount"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              aria-invalid={fieldErrors.amount ? true : undefined}
              aria-describedby={fieldErrors.amount ? 'expense-amount-error' : undefined}
              onChange={(e) => {
                setAmount(e.target.value);
                if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              onBlur={handleAmountBlur}
            />
            {fieldErrors.amount && (
              <p id="expense-amount-error" className="field-error">
                {t(fieldErrors.amount)}
              </p>
            )}
          </div>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {save.busy
                ? t('common.saving')
                : t(editingId ? 'finances.saveExpense' : 'finances.addExpense')}
            </button>
            {editingId && (
              <button type="button" className="btn" disabled={busy} onClick={resetForm}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {formError && (
        <p className="alert alert-danger" role="alert">
          {t(formError)}
        </p>
      )}
    </div>
  );
}
