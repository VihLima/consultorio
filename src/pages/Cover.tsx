import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Cover() {
  const { t } = useTranslation();

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
