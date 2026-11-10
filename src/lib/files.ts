/** 10 MB, the same limit as the `patient-files` bucket and `consultation_files.size_bytes`. */
export const MAX_FILE_BYTES = 10485760;

/** A single upload that takes longer than this is reported as failed. */
export const UPLOAD_TIMEOUT_MS = 60000;

/**
 * Settles like `promise`, or rejects with Error('timeout') after `ms`.
 * The underlying work is not cancelled; only the wait ends.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
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
