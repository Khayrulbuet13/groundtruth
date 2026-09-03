import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, getStoredTheme, resolveTheme } from './theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(getStoredTheme);
  const [resolved, setResolved] = useState(() => resolveTheme(preference));

  useEffect(() => {
    applyTheme(preference);
    setResolved(resolveTheme(preference));
    try {
      localStorage.setItem('quiz-theme', preference);
    } catch {
      /* private mode or blocked storage — theme still applies for this session */
    }
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      isDark: resolved === 'dark',
      setPreference,
      toggleTheme: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
