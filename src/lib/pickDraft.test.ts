import { describe, expect, it } from 'vitest';
import { pickDraft } from './pickDraft';

describe('pickDraft', () => {
  it('uses the server text when there is no local draft', () => {
    expect(pickDraft('server', null)).toEqual({
      clinical_history: 'server',
      amount: '',
      restored: false,
    });
  });

  it('restores local edits made on top of the current server text', () => {
    const local = { clinical_history: 'server + more', amount: '150.000', base: 'server' };
    expect(pickDraft('server', local)).toEqual({
      clinical_history: 'server + more',
      amount: '150.000',
      restored: true,
    });
  });

  it('keeps the server text when the server changed after the local draft was based on it', () => {
    // Older local H1 based on H0; the server already has H2 (saved later).
    const local = { clinical_history: 'H1', amount: '150.000', base: 'H0' };
    expect(pickDraft('H2', local)).toEqual({
      clinical_history: 'H2',
      amount: '150.000',
      restored: false,
    });
  });

  it('does not report a restore when local and server text are equal', () => {
    const local = { clinical_history: 'same', amount: '', base: 'same' };
    expect(pickDraft('same', local)).toEqual({
      clinical_history: 'same',
      amount: '',
      restored: false,
    });
  });

  it('never lets a draft without a base replace the server text', () => {
    const local = { clinical_history: 'legacy', amount: '5' };
    expect(pickDraft('server', local)).toEqual({
      clinical_history: 'server',
      amount: '5',
      restored: false,
    });
  });
});
