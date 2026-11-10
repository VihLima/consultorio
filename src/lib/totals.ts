export interface ShiftTotals {
  income: number;
  expense: number;
  balance: number;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Totals of a shift: income (closed consultations) − expenses = balance. */
export function shiftTotals(incomes: number[], expenses: number[]): ShiftTotals {
  const income = sum(incomes);
  const expense = sum(expenses);
  return { income, expense, balance: income - expense };
}
