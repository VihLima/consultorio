import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import LoadingScreen from '../components/LoadingScreen';
import { useAuth } from '../auth/AuthProvider';
import { loginDestination } from '../auth/redirect';

export default function Login() {
  const { t } = useTranslation();
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = loginDestination(location.state);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    navigate(destination, { replace: true });
  }

  // Until the stored session is read, show nothing that would flash before a redirect.
  if (loading) return <LoadingScreen />;
  // Already signed in (e.g. /login opened by hand): skip the form.
  if (session && !submitting) return <Navigate to={destination} replace />;

  return (
    <Layout title={t('login.title')} back="/">
      <div className="stack">
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-email">{t('login.email')}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t('login.password')}</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-big" disabled={submitting}>
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
        {error && (
          <p className="alert alert-danger" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </Layout>
  );
}
