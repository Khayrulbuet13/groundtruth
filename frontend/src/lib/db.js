/** IndexedDB layer: runs, decks, sync queue, question cache. */
import { openDB } from 'idb';

const DB_NAME = 'quiz-local';
const DB_VERSION = 3;

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const runs = db.createObjectStore('runs', { keyPath: 'id' });
          runs.createIndex('completed_at', 'completed_at');
          runs.createIndex('synced', 'synced');
          db.createObjectStore('decks', { keyPath: 'id' });
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains('review_states')) {
            db.deleteObjectStore('review_states');
          }
          if (!db.objectStoreNames.contains('questions_seen')) {
            db.createObjectStore('questions_seen', { keyPath: 'id' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('bookmarks')) {
            const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'question_id' });
            bookmarks.createIndex('created_at', 'created_at');
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRun(run) {
  const db = await getDb();
  await db.put('runs', run);
}

export async function listRuns() {
  const db = await getDb();
  return db.getAll('runs');
}

export async function enqueueSync(item) {
  const db = await getDb();
  await db.put('sync_queue', { ...item, queued_at: Date.now() });
}

export async function listSyncQueue() {
  const db = await getDb();
  return db.getAll('sync_queue');
}

export async function removeSyncQueue(id) {
  const db = await getDb();
  await db.delete('sync_queue', id);
}

export async function saveDeck(deck) {
  const db = await getDb();
  await db.put('decks', deck);
}

export async function listDecks() {
  const db = await getDb();
  return db.getAll('decks');
}

export async function deleteDeck(id) {
  const db = await getDb();
  await db.delete('decks', id);
}

/** Cache bank questions so stats can show stems for past attempts without refetching chunks. */
export async function rememberQuestions(questions) {
  const db = await getDb();
  const tx = db.transaction('questions_seen', 'readwrite');
  const puts = questions.map((q) =>
    tx.store.put({
      id: q.id,
      legacy_id: q.legacy_id,
      stem: q.stem,
      options: q.options,
      answer: q.answer ?? q.answer_idx,
      tags: q.tags,
      explanation: q.explanation,
      source: q.source,
    })
  );
  await Promise.all([...puts, tx.done]);
}

export async function listQuestionsSeen() {
  const db = await getDb();
  return db.getAll('questions_seen');
}

export async function mergeRunsFromServer(runs) {
  const db = await getDb();
  const tx = db.transaction('runs', 'readwrite');
  for (const run of runs) {
    const existing = await tx.store.get(run.id);
    if (!existing || new Date(run.completed_at) > new Date(existing.completed_at)) {
      await tx.store.put({ ...run, synced: true });
    }
  }
  await tx.done;
}

/** UUID v4. Falls back for insecure contexts (plain-http LAN testing) where randomUUID is missing. */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function addBookmark(question) {
  const db = await getDb();
  await db.put('bookmarks', {
    question_id: question.id,
    stem: question.stem,
    tags: question.tags || [],
    created_at: new Date().toISOString(),
  });
}

export async function removeBookmark(questionId) {
  const db = await getDb();
  await db.delete('bookmarks', questionId);
}

export async function listBookmarks() {
  const db = await getDb();
  return db.getAll('bookmarks');
}

export async function isBookmarked(questionId) {
  const db = await getDb();
  const row = await db.get('bookmarks', questionId);
  return !!row;
}

/** Assign local ids to imported deck questions. */
export function assignDeckQuestionIds(deckId, questions) {
  return questions.map((q, i) => ({
    ...q,
    id: `${deckId}:${i}`,
    difficulty: q.difficulty
      ? q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1).toLowerCase()
      : 'Easy',
  }));
}
