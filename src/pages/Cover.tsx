import { Navigate } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen';
import { useAuth } from '../auth/AuthProvider';
import { HOME_PATH } from '../auth/redirect';

/** "/" goes straight to the app when signed in, otherwise to the login form. */
export default function Cover() {
  const { session, loading } = useAuth();

  // Until the stored session is read, show nothing that would flash before a redirect.
  if (loading) return <LoadingScreen />;
  return <Navigate to={session ? HOME_PATH : '/login'} replace />;
}
