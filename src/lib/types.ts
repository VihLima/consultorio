export interface Shift {
  id: string;
  opened_at: string;
  closed_at: string | null;
}

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string | null;
  cedula: string | null;
}

export interface Consultation {
  id: string;
  patient_id: string;
  shift_id: string | null;
  clinical_history: string;
  amount_pyg: number | null;
  status: 'open' | 'closed';
  started_at: string;
  closed_at: string | null;
}

export interface ConsultationFile {
  id: string;
  consultation_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface Expense {
  id: string;
  shift_id: string;
  description: string;
  amount_pyg: number;
  created_at: string;
}
