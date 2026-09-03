import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listDecks, listQuestionsSeen, rememberQuestions } from './db';

const DataContext = createContext(null);

/** Bank and deck questions both end up with a numeric `answer`. */
const normalize = (q) => ({ ...q, answer: q.answer ?? q.answer_idx });

export function DataProvider({ children }) {
  const [index, setIndex] = useState(null);
  const [customDecks, setCustomDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-flight/settled chunk fetches keyed `${tagId}:${chunk}` — one request per chunk, ever.
  const chunkRef = useRef(new Map());
  // Every bank question we have seen this session or cached in IndexedDB, by id and legacy id.
  const questionsRef = useRef(new Map());

  const rememberLocally = useCallback((questions) => {
    for (const q of questions) {
      questionsRef.current.set(q.id, q);
      if (q.legacy_id) questionsRef.current.set(q.legacy_id, q);
    }
  }, []);

  const reloadDecks = useCallback(async () => {
    const decks = await listDecks();
    setCustomDecks(decks);
    return decks;
  }, []);

  useEffect(() => {
    fetch('/data/index.json')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load catalog');
        return r.json();
      })
      .then(setIndex)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    reloadDecks().catch(() => setCustomDecks([]));
    // Seed the lookup with cached questions so Progress can resolve old attempts on a cold load.
    listQuestionsSeen()
      .then((cached) => {
        for (const q of cached) {
          if (!questionsRef.current.has(q.id)) rememberLocally([q]);
        }
      })
      .catch(() => {});
  }, [reloadDecks, rememberLocally]);

  const loadTagChunk = useCallback(
    (tagId, chunkIdx) => {
      const key = `${tagId}:${chunkIdx}`;
      if (!chunkRef.current.has(key)) {
        const p = fetch(`/data/t/${tagId}/${chunkIdx}.json`)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${tagId}/${chunkIdx}`);
            return res.json();
          })
          .then(async (data) => {
            const questions = data.questions.map(normalize);
            rememberLocally(questions);
            await rememberQuestions(questions);
            return questions;
          })
          .catch((e) => {
            chunkRef.current.delete(key); // let a later draw retry
            throw e;
          });
        chunkRef.current.set(key, p);
      }
      return chunkRef.current.get(key);
    },
    [rememberLocally]
  );

  const drawFromTags = useCallback(
    async (tagIds, difficulty) => {
      if (!index) return [];
      const seen = new Map();
      const add = (q) => {
        if (!seen.has(q.id)) seen.set(q.id, q);
      };

      for (const tagId of tagIds) {
        const meta = index.tags.find((t) => t.id === tagId);
        if (!meta) continue;
        for (let c = 0; c < (meta.chunks || 1); c++) {
          const qs = await loadTagChunk(tagId, c);
          for (const q of qs) {
            if (difficulty !== 'Mixed' && q.difficulty !== difficulty) continue;
            add(q);
          }
        }
      }

      for (const deck of customDecks) {
        for (const q of deck.questions || []) {
          if (!q.tags?.some((t) => tagIds.includes(t))) continue;
          if (difficulty !== 'Mixed' && q.difficulty !== difficulty) continue;
          add(normalize(q));
        }
      }

      return [...seen.values()];
    },
    [index, customDecks, loadTagChunk]
  );

  const questionLookupSync = useCallback(
    (id) => {
      const fromBank = questionsRef.current.get(id);
      if (fromBank) return fromBank;
      for (const deck of customDecks) {
        const q = deck.questions?.find((x) => x.id === id);
        if (q) return normalize(q);
      }
      return null;
    },
    [customDecks]
  );

  const topics = useMemo(() => {
    if (!index?.tags) return [];
    const parents = index.tags.filter((t) => !t.parent);
    return parents.map((p) => ({
      id: p.id,
      name: p.name,
      count: p.count,
      subtopics: index.tags
        .filter((t) => t.parent === p.id)
        .map((s) => ({ id: s.id, name: s.name, count: s.count })),
    }));
  }, [index]);

  const tagName = useCallback(
    (id) => index?.tags?.find((t) => t.id === id)?.name || id,
    [index]
  );

  const value = useMemo(
    () => ({
      loading,
      error,
      index,
      topics,
      tagName,
      drawFromTags,
      questionLookupSync,
      customDecks,
      reloadDecks,
    }),
    [loading, error, index, topics, tagName, drawFromTags, questionLookupSync, customDecks, reloadDecks]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
