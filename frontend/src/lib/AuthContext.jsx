import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { flushSyncQueue, pullRemoteRuns, latestSyncCursor } from './sync';

const AuthContext = createContext(null);

// Background sync after sign-in. Failures here (offline, IndexedDB unavailable in a
// private window, …) must never be mistaken for "not signed in".
async function syncAfterAuth() {
  try {
    const since = await latestSyncCursor();
    await pullRemoteRuns(since);
    await flushSyncQueue();
  } catch {
    /* retried on the next refresh */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Monotonic id so a slow, older /me response can't overwrite a newer one.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    let me = null;
    try {
      me = await api.me();
    } catch {
      // A failed /me check means "not signed in" — treat it silently so the app
      // works offline-first with no backend configured. Only explicit user actions
      // (login / loginDev / logout) should surface errors.
    }
    if (id !== requestId.current) return;
    const authed = me?.authenticated ? me : null;
    setUser(authed);
    setError(null);
    setLoading(false);
    if (authed) syncAfterAuth();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      requestId.current += 1; // invalidate any in-flight /me
      setUser(null);
    });
    refresh();

    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const login = useCallback(async (provider) => {
    try {
      setError(null);
      const { url } = await api.authStart(provider);
      window.location.assign(url);
    } catch (e) {
      setError(e.message || 'Could not start login');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* clear locally anyway */
    }
    requestId.current += 1;
    setUser(null);
  }, []);

  const loginDev = useCallback(async () => {
    try {
      setError(null);
      await api.devLogin();
      await refresh();
    } catch (e) {
      setError(e.message || 'Dev login failed');
    }
  }, [refresh]);

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
