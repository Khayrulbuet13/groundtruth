import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { flushSyncQueue, pullRemoteRuns, latestSyncCursor } from './sync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const me = await api.me();
      setUser(me?.authenticated ? me : null);
      if (me?.authenticated) {
        const since = await latestSyncCursor();
        await pullRemoteRuns(since);
        await flushSyncQueue();
      }
    } catch (e) {
      setUser(null);
      setError(e.message || 'Auth check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    flushSyncQueue().finally(refresh);
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const login = async (provider) => {
    try {
      setError(null);
      const { url } = await api.authStart(provider);
      window.location.href = url;
    } catch (e) {
      setError(e.message || 'Could not start login');
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* clear locally anyway */
    }
    setUser(null);
  };

  const loginDev = async () => {
    try {
      setError(null);
      await api.devLogin();
      await refresh();
    } catch (e) {
      setError(e.message || 'Dev login failed');
    }
  };

  const value = useMemo(
    () => ({ user, loading, error, login, loginDev, logout, refresh }),
    [user, loading, error, login, loginDev, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
