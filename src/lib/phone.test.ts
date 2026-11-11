import { describe, expect, it } from 'vitest';
import { whatsappNumber, whatsappUrl } from './phone';

describe('whatsappNumber', () => {
  it('adds the Paraguay code to national numbers', () => {
    expect(whatsappNumber('0981 123 456')).toBe('595981123456');
    expect(whatsappNumber('(0981) 123-456')).toBe('595981123456');
    expect(whatsappNumber('981123456')).toBe('595981123456');
  });

  it('keeps international numbers', () => {
    expect(whatsappNumber('+595 981 123 456')).toBe('595981123456');
    expect(whatsappNumber('+55 11 91234-5678')).toBe('5511912345678');
    expect(whatsappNumber('0055 11 91234-5678')).toBe('5511912345678');
    expect(whatsappNumber('595981123456')).toBe('595981123456');
  });

  it('rejects text that is not a usable number', () => {
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber('   ')).toBeNull();
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('sem telefone')).toBeNull();
  });
});

describe('whatsappUrl', () => {
  it('builds a wa.me link', () => {
    expect(whatsappUrl('0981 123 456')).toBe('https://wa.me/595981123456');
    expect(whatsappUrl('123')).toBeNull();
  });
});
