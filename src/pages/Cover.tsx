import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useAuth } from '../auth/AuthProvider';
import { HOME_PATH } from '../auth/redirect';

export default function Cover() {
  const { t } = useTranslation();
  const { session } = useAuth();

  if (session) return <Navigate to={HOME_PATH} replace />;

  return (
    <div className="cover container">
      <div className="cover__top">
        <LanguageSwitcher />
      </div>
      <main className="cover__main">
        <img
          className="cover__logo"
          src="/logo.webp"
          alt={t('common.logoAlt')}
          width={1600}
          height={800}
        />
        <h1 className="cover__title">{t('cover.title')}</h1>
        <Link to="/login" className="btn btn-primary btn-big cover__login">
          {t('cover.login')}
        </Link>
      </main>
    </div>
  );
}
