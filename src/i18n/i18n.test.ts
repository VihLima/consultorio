import { describe, expect, it } from 'vitest';
import es from './es.json';
import ptBR from './pt-BR.json';

function flatKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? flatKeys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('es and pt-BR have exactly the same keys', () => {
    expect(flatKeys(ptBR).sort()).toEqual(flatKeys(es).sort());
  });

  it('uses the clinic title with the surname Iachel', () => {
    expect(es.cover.title).toBe('Consultorio Dra. Iachel');
    expect(ptBR.cover.title).toBe('Consultório Dra. Iachel');
  });
});
