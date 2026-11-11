import { describe, expect, it } from 'vitest';
import { countDistinct, shiftTotals } from './totals';

describe('countDistinct', () => {
  it('counts each patient once, however many consultations they had', () => {
    expect(countDistinct(['p1', 'p1', 'p2'])).toBe(2);
    expect(countDistinct(['p1'])).toBe(1);
    expect(countDistinct([])).toBe(0);
  });
});

describe('shiftTotals', () => {
  it('sums incomes and expenses and computes the balance', () => {
    expect(shiftTotals([150000, 200000], [50000])).toEqual({
      income: 350000,
      expense: 50000,
      balance: 300000,
    });
  });

  it('is all zeros for an empty shift', () => {
    expect(shiftTotals([], [])).toEqual({ income: 0, expense: 0, balance: 0 });
  });

  it('gives a negative balance when expenses exceed incomes', () => {
    expect(shiftTotals([0], [80000])).toEqual({ income: 0, expense: 80000, balance: -80000 });
  });
});
