import { useTranslation } from 'react-i18next';

/** "Activo" (open consultation) or "Archivado". */
export default function StatusBadge({ status }: { status: 'active' | 'archived' }) {
  const { t } = useTranslation();
  return (
    <span className={status === 'active' ? 'badge' : 'badge badge-muted'}>
      {t(`patient.status.${status}`)}
    </span>
  );
}
