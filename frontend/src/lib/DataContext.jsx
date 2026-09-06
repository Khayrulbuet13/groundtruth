import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listDecks, listQuestionsSeen, rememberQuestions } from './db';
import { matchesDifficulty, normalizeDifficulty } from './quiz';

const DataContext = createContext(null);

/** Bank and deck questions both end up with a numeric `answer` and a title-cased difficulty. */
const normalize = (q) => ({
  ...q,
  answer: q.answer ?? q.answer_idx,
  difficulty: normalizeDifficulty(q.difficulty),
});

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
            if (!matchesDifficulty(q.difficulty, difficulty)) continue;
            add(q);
          }
        }
      }

      for (const deck of customDecks) {
        for (const q of deck.questions || []) {
          if (!q.tags?.some((t) => tagIds.includes(t))) continue;
          if (!matchesDifficulty(q.difficulty, difficulty)) continue;
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

  /** Distinct tags of one imported deck, with how many of its questions carry each. */
  const deckTagCounts = useCallback((deck) => {
    const counts = new Map();
    for (const q of deck.questions || []) {
      for (const t of q.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts].map(([id, count]) => ({ id, count }));
  }, []);

  /**
   * Topic groups for the picker: the curated bank first, then one group per imported deck.
   *
   * Decks used to be invisible here. Since a quiz is drawn by tag and the picker only ever
   * listed bank tags, a deck tagged with anything outside the bank's vocabulary (say
   * "chemistry") had no checkbox, so it could never be drawn — the import silently went
   * nowhere.
   */
  const topics = useMemo(() => {
    const bank = (index?.tags || [])
      .filter((t) => !t.parent)
      .map((p) => ({
        id: p.id,
        name: p.name,
        count: p.count,
        subtopics: index.tags
          .filter((t) => t.parent === p.id)
          .map((s) => ({ id: s.id, name: s.name, count: s.count })),
      }));

    const decks = customDecks.map((d) => ({
      id: `deck:${d.id}`,
      name: d.name,
      count: (d.questions || []).length,
      fromDeck: true,
      subtopics: deckTagCounts(d).map((t) => ({
        id: t.id,
        name: index?.tags?.find((x) => x.id === t.id)?.name || t.id,
        count: t.count,
      })),
    }));

    return [...bank, ...decks];
  }, [index, customDecks, deckTagCounts]);

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
      deckTagCounts,
      reloadDecks,
    }),
    [loading, error, index, topics, tagName, drawFromTags, questionLookupSync, customDecks, deckTagCounts, reloadDecks]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
