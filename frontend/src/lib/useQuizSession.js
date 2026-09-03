import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'cvprep.session.v1';

/**
 * Session persistence. Writes on every answer / navigation so a closed tab
 * can be resumed. Swap the read/write bodies for a server call if sessions
 * need to follow the user across devices — the shape is the contract.
 *
 * Stored shape:
 * { quiz, index, answers, flags, timed, elapsed, difficulty, subtopicIds, savedAt }
 */
export function useQuizSession() {
  const [saved, setSaved] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s?.quiz?.length && s.index < s.quiz.length) setSaved(s);
      else localStorage.removeItem(KEY);
    } catch {
      /* corrupt payload — ignore */
    }
  }, []);

  const save = useCallback((session) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
    } catch {
      /* quota or private mode — persistence is best-effort */
    }
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
    setSaved(null);
  }, []);

  return { saved, save, clear, setSaved };
}
