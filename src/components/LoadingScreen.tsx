import { useTranslation } from 'react-i18next';

/** Shown while the stored session is read on startup (before any redirect). */
export default function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <main className="container app-main">
      <p className="muted" role="status">
        {t('common.loading')}
      </p>
    </main>
  );
}
