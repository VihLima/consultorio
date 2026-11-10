import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FILE_BYTES,
  buildStoragePath,
  findArrivedFile,
  isImage,
  isTimeoutError,
  uploadTimeoutMs,
  validateFile,
  withTimeout,
} from './files';

const STORED = {
  id: 'f1',
  consultation_id: 'c1',
  storage_path: 'u/p/c1/x-foto.jpg',
  file_name: 'foto.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 2048,
};

describe('findArrivedFile', () => {
  it('finds a stored row with the same name and size that is not shown yet', () => {
    expect(findArrivedFile([STORED], new Set(), { name: 'foto.jpg', size: 2048 })).toEqual(STORED);
  });

  it('ignores rows already shown, and other names or sizes', () => {
    expect(findArrivedFile([STORED], new Set(['f1']), { name: 'foto.jpg', size: 2048 })).toBeNull();
    expect(findArrivedFile([STORED], new Set(), { name: 'otra.jpg', size: 2048 })).toBeNull();
    expect(findArrivedFile([STORED], new Set(), { name: 'foto.jpg', size: 2049 })).toBeNull();
  });

  it('picks the first row not shown when the same file was stored twice', () => {
    const second = { ...STORED, id: 'f2' };
    expect(findArrivedFile([STORED, second], new Set(['f1']), { name: 'foto.jpg', size: 2048 })).toBe(
      second,
    );
  });
});

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

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows uploads 60 s plus 30 s per MB', () => {
    expect(uploadTimeoutMs(0)).toBe(60000);
    expect(uploadTimeoutMs(524288)).toBe(75000);
    expect(uploadTimeoutMs(1048576)).toBe(90000);
    expect(uploadTimeoutMs(MAX_FILE_BYTES)).toBe(360000);
  });

  it('tells its own timeout apart from other errors', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 10).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    expect(isTimeoutError(await pending)).toBe(true);
    expect(isTimeoutError(new Error('boom'))).toBe(false);
    expect(isTimeoutError({ message: 'timeout' })).toBe(false);
  });

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('passes the original rejection through', async () => {
    const failure = new Error('boom');
    await expect(withTimeout(Promise.reject(failure), 1000)).rejects.toBe(failure);
  });

  it('rejects with a timeout error when the promise hangs', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 60000);
    const result = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(60000);
    await result;
  });
});
