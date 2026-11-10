import { describe, expect, it } from 'vitest';
import { closedOutcome } from './closedOutcome';

const closed = { status: 'closed' as const, clinical_history: 'dolor', amount_pyg: 150000 };

describe('closedOutcome', () => {
  it('is not-closed when the consultation could not be read or is still open', () => {
    expect(closedOutcome(null, 'dolor', 150000)).toBe('not-closed');
    expect(closedOutcome({ ...closed, status: 'open' }, 'dolor', 150000)).toBe('not-closed');
  });

  it('is done when the server already has this text and amount (lost close response)', () => {
    expect(closedOutcome(closed, 'dolor', 150000)).toBe('done');
  });

  it('is lost when the text on screen differs from the closed consultation', () => {
    expect(closedOutcome(closed, 'dolor\nnueva línea', 150000)).toBe('lost');
  });

  it('is lost when the amount on screen differs from the closed amount', () => {
    expect(closedOutcome(closed, 'dolor', 200000)).toBe('lost');
  });

  it('compares only the text when no amount is being saved (Volver)', () => {
    expect(closedOutcome(closed, 'dolor', null)).toBe('done');
    expect(closedOutcome(closed, 'otra cosa', null)).toBe('lost');
  });
});
