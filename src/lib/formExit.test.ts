import { describe, expect, it } from 'vitest';
import { nothingToKeep, unnamedBack } from './formExit';

describe('unnamedBack (Volver with an empty name)', () => {
  it('leaves an unnamed new form that has no clinical text', () => {
    expect(unnamedBack(false, '')).toBe('leave');
    expect(unnamedBack(false, '  \n ')).toBe('leave');
  });

  it('never drops clinical text silently: asks for the name or an explicit discard', () => {
    expect(unnamedBack(false, 'Dolor de cabeza')).toBe('confirm-discard');
  });

  it('requires the name back on an existing patient', () => {
    expect(unnamedBack(true, '')).toBe('name-required');
    expect(unnamedBack(true, 'texto')).toBe('name-required');
  });
});

describe('nothingToKeep (open existing patient from a just-created empty one)', () => {
  const empty = { history: '', amount: '', serverText: '', storedFiles: 0 };

  it('is true only without text, amount, server text and stored files', () => {
    expect(nothingToKeep(empty)).toBe(true);
    expect(nothingToKeep({ ...empty, history: ' ' })).toBe(true);
  });

  it('is false as soon as anything would be lost or is stored', () => {
    expect(nothingToKeep({ ...empty, history: 'texto' })).toBe(false);
    expect(nothingToKeep({ ...empty, amount: '0' })).toBe(false);
    expect(nothingToKeep({ ...empty, serverText: 'guardado' })).toBe(false);
    expect(nothingToKeep({ ...empty, storedFiles: 1 })).toBe(false);
  });

  it('is false when the stored files could not be checked', () => {
    expect(nothingToKeep({ ...empty, storedFiles: null })).toBe(false);
  });
});
