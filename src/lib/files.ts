import type { ConsultationFile } from './types';

/** 10 MB, the same limit as the `patient-files` bucket and `consultation_files.size_bytes`. */
export const MAX_FILE_BYTES = 10485760;

/**
 * How long a single upload may take before it is reported as failed: 60 s
 * plus 30 s per MB, so a 10 MB file on a slow connection gets 6 minutes.
 */
export function uploadTimeoutMs(bytes: number): number {
  return 60000 + Math.ceil((30000 * bytes) / 1048576);
}

const TIMEOUT = 'timeout';

/** True for the rejection of `withTimeout` (the wait ended, the work may still finish). */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === TIMEOUT;
}

/**
 * Settles like `promise`, or rejects with Error('timeout') after `ms`.
 * The underlying work is not cancelled; only the wait ends.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * After an upload timed out: the stored row for that file, if it arrived
 * anyway — same name and size, and not one of the files already shown.
 */
export function findArrivedFile(
  stored: ConsultationFile[],
  shownIds: Set<string>,
  file: { name: string; size: number },
): ConsultationFile | null {
  return (
    stored.find(
      (row) =>
        !shownIds.has(row.id) && row.file_name === file.name && Number(row.size_bytes) === file.size,
    ) ?? null
  );
}

/** What the file picker accepts: images (camera on phones) and PDF. */
export const ACCEPTED_FILES = 'image/*,application/pdf';

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function validateFile(file: { type: string; size: number }): 'ok' | 'type' | 'size' {
  if (!isImage(file.type) && file.type !== 'application/pdf') return 'type';
  if (file.size > MAX_FILE_BYTES) return 'size';
  return 'ok';
}

/** Storage key `{user_id}/{patient_id}/{consultation_id}/{uuid}-{safe file name}`. */
export function buildStoragePath(
  userId: string,
  patientId: string,
  consultationId: string,
  fileName: string,
  uuid: string,
): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${userId}/${patientId}/${consultationId}/${uuid}-${safeName}`;
}
