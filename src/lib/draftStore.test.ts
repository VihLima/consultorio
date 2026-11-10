// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { draftStore } from './draftStore';

beforeEach(() => localStorage.clear());

describe('draftStore', () => {
  it('saves, loads and clears a draft', () => {
    draftStore.save('k', { clinical_history: 'dolor', amount: '150.000' });
    expect(draftStore.load('k')).toEqual({ clinical_history: 'dolor', amount: '150.000' });
    draftStore.clear('k');
    expect(draftStore.load('k')).toBeNull();
  });

  it('stores under draft:{key}', () => {
    draftStore.save('new', { clinical_history: 'a', amount: '' });
    expect(localStorage.getItem('draft:new')).not.toBeNull();
  });

  it('returns null for missing or corrupted entries', () => {
    expect(draftStore.load('missing')).toBeNull();
    localStorage.setItem('draft:bad', '{not json');
    expect(draftStore.load('bad')).toBeNull();
    localStorage.setItem('draft:shape', '{"clinical_history":1}');
    expect(draftStore.load('shape')).toBeNull();
    localStorage.setItem('draft:base', '{"clinical_history":"a","amount":"","base":1}');
    expect(draftStore.load('base')).toBeNull();
  });

  it('keeps the server base text of a consultation draft', () => {
    draftStore.save('c1', { clinical_history: 'new text', amount: '', base: 'old text' });
    expect(draftStore.load('c1')).toEqual({
      clinical_history: 'new text',
      amount: '',
      base: 'old text',
    });
  });

  it('keeps the fixed data of a new-patient draft', () => {
    const draft = {
      clinical_history: 'dolor',
      amount: '150.000',
      full_name: 'Ana',
      birth_date: '1990-05-12',
      cedula: '1.234.567',
    };
    draftStore.save('new', draft);
    expect(draftStore.load('new')).toEqual(draft);
  });
});
