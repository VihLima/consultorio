import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

interface LayoutProps {
  /** Page heading, already translated. */
  title?: string;
  /** Route the back button goes to; no back button when omitted. */
  back?: string;
  /** Back button that runs an action (e.g. save a draft) instead of a plain link. */
  onBack?: () => void;
  children?: ReactNode;
}

export default function Layout({ title, back, onBack, children }: LayoutProps) {
  const { t } = useTranslation();
  const backContent = (
    <>
      <span aria-hidden="true">←</span>
      <span className="app-header__back-label">{t('common.back')}</span>
    </>
  );

  return (
    <>
      <header className="app-header">
        <div className="container app-header__inner">
          {onBack ? (
            <button type="button" className="btn app-header__back" onClick={onBack}>
              {backContent}
            </button>
          ) : (
            back && (
              <Link to={back} className="btn app-header__back">
                {backContent}
              </Link>
            )
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
