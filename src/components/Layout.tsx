import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

interface LayoutProps {
  /** Page heading, already translated. */
  title?: string;
  /** Route the back button goes to; no back button when omitted. */
  back?: string;
  children?: ReactNode;
}

export default function Layout({ title, back, children }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <>
      <header className="app-header">
        <div className="container app-header__inner">
          {back && (
            <Link to={back} className="btn app-header__back">
              <span aria-hidden="true">←</span>
              <span className="app-header__back-label">{t('common.back')}</span>
            </Link>
          )}
          <img
            className="app-header__logo"
            src="/logo.webp"
            alt={t('common.logoAlt')}
            width={1600}
            height={800}
          />
          <span className="app-header__spacer" />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="container app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
    </>
  );
}
