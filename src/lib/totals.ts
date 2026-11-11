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

export interface PatientBalance {
  charged: number;
  paid: number;
  /** What the patient still owes; never below 0 (an overpayment is not a debt). */
  pending: number;
}

/** A patient's account: charged in finished consultations, paid, and still pending. */
export function patientBalance(charges: number[], payments: number[]): PatientBalance {
  const charged = sum(charges);
  const paid = sum(payments);
  return { charged, paid, pending: Math.max(charged - paid, 0) };
}
