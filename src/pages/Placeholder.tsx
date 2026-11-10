import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';

/** Stand-in for a protected page that a later task will build. */
export default function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <Layout title={t(titleKey)} back="/inicio">
      <p className="empty">{t('common.comingSoon')}</p>
    </Layout>
  );
}
