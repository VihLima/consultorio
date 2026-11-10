import { supabase } from '../lib/supabase';
import { buildStoragePath } from '../lib/files';
import type { Consultation, ConsultationFile } from '../lib/types';

const BUCKET = 'patient-files';
const FILE_COLUMNS = 'id, consultation_id, storage_path, file_name, mime_type, size_bytes';
/** Signed URLs are valid for 10 minutes. */
const SIGNED_URL_SECONDS = 600;

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('not_signed_in');
  return userId;
}

/**
 * Uploads the file to Storage and records it in `consultation_files`.
 * supabase-js does not report byte progress, so `onProgress` gets 0 when the
 * upload starts and 1 when the file is stored and recorded.
 */
export async function uploadFile(
  consultation: Consultation,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ConsultationFile> {
  const userId = await currentUserId();
  const path = buildStoragePath(
    userId,
    consultation.patient_id,
    consultation.id,
    file.name,
    crypto.randomUUID(),
  );
  onProgress?.(0);

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from('consultation_files')
    .insert({
      consultation_id: consultation.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select(FILE_COLUMNS)
    .single();
  if (error) {
    // Without its row the object would be unreachable: remove it (best effort).
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  onProgress?.(1);
  return data as ConsultationFile;
}

export async function listFiles(consultationId: string): Promise<ConsultationFile[]> {
  const { data, error } = await supabase
    .from('consultation_files')
    .select(FILE_COLUMNS)
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConsultationFile[];
}

/**
 * Removes the row first (the database refuses it for a closed consultation),
 * then the stored object. A failed object removal only leaves an unreachable
 * private object behind, so it is not reported.
 */
export async function removeFile(file: ConsultationFile): Promise<void> {
  const { error } = await supabase.from('consultation_files').delete().eq('id', file.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([file.storage_path]);
}

export async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
