export interface ShiftTotals {
  income: number;
  expense: number;
  balance: number;
}

/** How many different values there are (e.g. patients seen across consultations). */
export function countDistinct(values: string[]): number {
  return new Set(values).size;
}

const sum =(values: number[]) => values.reduce((total, value) => total + value, 0);

/** Totals of a shift: income (closed consultations) − expenses = balance. */
export function shiftTotals(incomes: number[], expenses: number[]): ShiftTotals {
  const income = sum(incomes);
  const expense = sum(expenses);
  return { income, expense, balance: income - expense };
}
