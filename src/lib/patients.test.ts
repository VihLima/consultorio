import { describe, expect, it } from 'vitest';
import migration from '../../supabase/migrations/0001_init.sql?raw';
import {
  SEARCH_FOLD_FROM,
  SEARCH_FOLD_TO,
  escapeLike,
  normalizeCedula,
  normalizeSearch,
  patientStatus,
} from './patients';

describe('normalizeCedula', () => {
  it('keeps only letters and digits, uppercased', () => {
    expect(normalizeCedula('1.234.567')).toBe('1234567');
    expect(normalizeCedula(' 1 234 567 ')).toBe('1234567');
    expect(normalizeCedula('1-234.567a')).toBe('1234567A');
    expect(normalizeCedula('ab-12')).toBe(normalizeCedula('AB12'));
  });

  it('returns null when nothing is left', () => {
    expect(normalizeCedula('')).toBeNull();
    expect(normalizeCedula(' . ')).toBeNull();
  });
});

describe('normalizeSearch', () => {
  it('trims, lowercases and removes accents', () => {
    expect(normalizeSearch('  José Ñandú ')).toBe('jose nandu');
    expect(normalizeSearch('MARÍA')).toBe('maria');
    expect(normalizeSearch('João Conceição')).toBe('joao conceicao');
    expect(normalizeSearch('   ')).toBe('');
  });

  it('treats decomposed accents like precomposed ones', () => {
    expect(normalizeSearch('María')).toBe('maria');
  });
});

/** The SQL text of the generated column `patients.<column>`. */
function generatedColumn(column: string): string {
  const pattern = String.raw`\s+text generated always as \(([\s\S]*?)\) stored`;
  const match = new RegExp(column + pattern).exec(migration);
  if (!match) throw new Error(`${column} not found in the migration`);
  return match[1];
}

describe('patients.full_name_search (migration) agrees with normalizeSearch', () => {
  /** [, FROM, TO] of lower(translate(full_name, FROM, TO)) in the migration. */
  function foldArgs(): RegExpExecArray {
    const args = /^\s*lower\(translate\(full_name, '([^']*)', '([^']*)'\)\)\s*$/.exec(
      generatedColumn('full_name_search'),
    );
    if (!args) throw new Error('full_name_search is not lower(translate(full_name, …))');
    return args;
  }

  it('is lower(translate(full_name, FROM, TO)) with the same character lists', () => {
    const args = foldArgs();
    expect(args[1]).toBe(SEARCH_FOLD_FROM);
    expect(args[2]).toBe(SEARCH_FOLD_TO);
    expect([...SEARCH_FOLD_FROM]).toHaveLength([...SEARCH_FOLD_TO].length);
    for (const char of 'ÁÉÍÓÚÜÑáéíóúüñ') expect(SEARCH_FOLD_FROM).toContain(char);
  });

  // What Postgres computes for the column: translate maps the i-th character
  // of FROM to the i-th of TO, then lower().
  function sqlFold(text: string): string {
    const args = foldArgs();
    const from = [...args[1]];
    const to = [...args[2]];
    return [...text]
      .map((char) => {
        const i = from.indexOf(char);
        return i === -1 ? char : to[i];
      })
      .join('')
      .toLowerCase();
  }

  it('gives the same text for every folded character', () => {
    for (const char of SEARCH_FOLD_FROM) expect(normalizeSearch(char)).toBe(sqlFold(char));
  });

  it('lets "maria" find "María" and "MARÍA" (search text is a substring of the column)', () => {
    for (const name of ['María González', 'MARÍA PÉREZ', 'José Ñandú', 'Müller', 'João Conceição']) {
      expect(sqlFold(name)).toBe(normalizeSearch(name));
    }
    expect(sqlFold('María González')).toContain(normalizeSearch('maria'));
    expect(sqlFold('Ana María')).toContain(normalizeSearch('MARIA'));
  });
});

describe('patients.cedula_norm (migration) agrees with normalizeCedula', () => {
  it('uppercases the normalized cédula', () => {
    const sql = generatedColumn('cedula_norm');
    expect(sql).toMatch(/^\s*upper\(/);
    expect(sql).toContain("'[^0-9A-Za-z]'");
  });
});

describe('patientStatus', () => {
  it('is active with an open consultation, archived otherwise', () => {
    expect(patientStatus(true)).toBe('active');
    expect(patientStatus(false)).toBe('archived');
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    // input 50%_a\b → output 50\%\_a\\b
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(escapeLike('Ana, María')).toBe('Ana, María');
  });
});
