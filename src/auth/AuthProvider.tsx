import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signInErrorKey } from './authErrors';

interface AuthContextValue {
  session: Session | null;
  /** True until the stored session has been read on startup. */
  loading: boolean;
  /** Resolves with a translation key in `error` when sign-in fails. */
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => {
        // Unreadable stored session: treat as signed out.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? signInErrorKey(error) : null };
    } catch (error) {
      return { error: signInErrorKey(error) };
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    // Offline: the server call failed, but the device must still be signed out.
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
