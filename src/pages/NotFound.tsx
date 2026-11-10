import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';

/** Any unknown address: a message instead of a blank page. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Layout back="/">
      <p className="empty">{t('errors.notFound')}</p>
    </Layout>
  );
}
