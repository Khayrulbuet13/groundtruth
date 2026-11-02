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
  const lastRefresh = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    lastRefresh.current = Date.now();
    let me;
    try {
      me = await api.me();
    } catch {
      // Offline, no backend, 5xx or 429: we can't tell, so keep whatever we knew (null on a
      // cold start, so the app still works offline-first). Only an explicit
      // `authenticated: false` or a 401 (handled by setUnauthorizedHandler) signs the user out.
      // Only explicit user actions (login / loginDev / logout) surface errors.
      setLoading(false);
      return;
    }
    setLoading(false);
    if (id !== requestId.current) return;
    const authed = me?.authenticated ? me : null;
    setUser(authed);
    setError(null);
    if (authed) syncAfterAuth();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      requestId.current += 1; // invalidate any in-flight /me
      setUser(null);
      setLoading(false);
    });
    refresh();

    // Re-check on tab focus, but not on every alt-tab: each refresh is /me + a sync pull.
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 60_000) {
        refresh();
      }
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
