import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import LanguageSwitcher from './LanguageSwitcher';
import { TZ } from '../lib/dates';
import Icon, { type IconName } from './Icon';

interface LayoutProps {
  title?: string;
  back?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  children?: ReactNode;
}

export default function Layout({ title, back, onBack, backDisabled, children }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date());
  const navigation: { to: string; icon: IconName; label: string; active: boolean }[] = [
    { to: '/inicio', icon: 'overview', label: t('design.overview'), active: pathname === '/inicio' },
    { to: '/agenda', icon: 'calendar', label: t('agenda.title'), active: pathname === '/agenda' },
    { to: '/pacientes', icon: 'patients', label: t('home.patients'), active: pathname.startsWith('/pacient') },
    { to: '/financas', icon: 'wallet', label: t('home.finances'), active: pathname === '/financas' || pathname.startsWith('/turnos') },
  ];
  async function logout() {
    setLeaving(true);
    setLogoutError(false);
    try { await signOut(); navigate('/', { replace: true }); }
    catch { setLogoutError(true); setLeaving(false); }
  }
  return <div className={session ? 'app-shell' : 'public-shell'}>
    <a className="skip-link" href="#main-content">{t('design.skip')}</a>
    {session && <aside className="sidebar">
      <div className="sidebar-brand"><img src="/logo.webp" alt={t('common.logoAlt')} width="1600" height="800" /></div>
      <div className="sidebar-caption">{t('design.workspace')}</div>
      <nav className="sidebar-nav" aria-label={t('design.navigation')}>
        {navigation.map(item => onBack ? <button key={item.to} className={`nav-item ${item.active ? 'active' : ''}`} type="button" disabled={backDisabled || item.to !== '/inicio'} onClick={onBack} title={t('design.saveFirst')}><Icon name={item.icon} /><span>{item.label}</span></button> : <NavLink key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined} className={`nav-item ${item.active ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.active && <span className="nav-dot" />}</NavLink>)}
      </nav>
      <div className="sidebar-account"><span className="avatar avatar-brand">{(session.user.email?.[0] || 'I').toUpperCase()}</span><div><strong>{t('design.team')}</strong><span title={session.user.email}>{session.user.email}</span></div></div>
      <button className="nav-item logout" disabled={leaving || !!onBack} onClick={() => void logout()}><Icon name="logout" />{t('home.logout')}</button>
      {logoutError && <p className="field-error" role="alert">{t('errors.generic')}</p>}
    </aside>}
    <div className="app-body">
      <header className="app-header"><div className="app-header__inner">
        {session ? <div className="breadcrumb">{t('design.workspace')}<span>/</span><strong>{pathname === '/inicio' ? t('design.overview') : title}</strong></div> : <Link to="/" className="public-brand"><img src="/logo.webp" alt={t('common.logoAlt')} width="1600" height="800" /></Link>}
        <span className="app-header__spacer" />
        <span className="header-date"><Icon name="calendar" size={17} />{date}</span>
        <LanguageSwitcher />
      </div></header>
      <main id="main-content" className="container app-main">
        {(onBack || back) && <div className="page-back">{onBack ? <button type="button" className="back-link" disabled={backDisabled} onClick={onBack}><Icon name="back" size={17} />{t('common.back')}</button> : <Link className="back-link" to={back!}><Icon name="back" size={17} />{t('common.back')}</Link>}</div>}
        {title && <div className="page-heading"><div><span className="eyebrow">{t('design.workspace')}</span><h1 className="page-title">{title}</h1></div>{pathname === '/pacientes' && <Link to="/paciente/novo" className="btn btn-primary"><Icon name="plus" />{t('patient.newTitle')}</Link>}</div>}
        {children}
      </main>
      <footer className="app-footer"><span>{t('common.appName')}</span><span>{t('design.footer')}</span></footer>
    </div>
  </div>;
}
