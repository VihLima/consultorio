import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen';
import { useAuth } from './AuthProvider';

/**
 * Renders its children (or the nested routes) only with an active session.
 * Otherwise redirects to /login, keeping the requested route (path + query)
 * in `location.state.from` so Login can send the user back there.
 */
export default function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!session) {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children ?? <Outlet />}</>;
}
