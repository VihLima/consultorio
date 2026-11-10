import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, buildStoragePath, isImage, validateFile } from './files';

describe('validateFile', () => {
  it('accepts images and PDF up to 10 MB', () => {
    expect(validateFile({ type: 'image/jpeg', size: 1000 })).toBe('ok');
    expect(validateFile({ type: 'image/heic', size: 1000 })).toBe('ok');
    expect(validateFile({ type: 'application/pdf', size: 10485760 })).toBe('ok');
    expect(MAX_FILE_BYTES).toBe(10485760);
  });

  it('rejects files over 10 MB', () => {
    expect(validateFile({ type: 'application/pdf', size: 10485761 })).toBe('size');
  });

  it('rejects other types', () => {
    expect(validateFile({ type: 'application/zip', size: 10 })).toBe('type');
    expect(validateFile({ type: '', size: 10 })).toBe('type');
  });
});

describe('buildStoragePath', () => {
  it('builds {user}/{patient}/{consultation}/{uuid}-{safe name}', () => {
    expect(buildStoragePath('u', 'p', 'c', 'Foto 1.jpg', 'x')).toBe('u/p/c/x-Foto_1.jpg');
  });

  it('replaces everything outside [A-Za-z0-9._-] with _', () => {
    expect(buildStoragePath('u', 'p', 'c', 'Análisis/año (2).pdf', 'x')).toBe(
      'u/p/c/x-An_lisis_a_o__2_.pdf',
    );
  });
});

describe('isImage', () => {
  it('is true only for image mime types', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('application/pdf')).toBe(false);
  });
});
