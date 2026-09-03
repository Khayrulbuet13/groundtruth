import { bankDeckSchema, deckSchema } from './deck.schema.js';

/**
 * Validate a user-upload deck (no question ids).
 */
export function validateDeck(data) {
  const result = deckSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map(formatIssue) };
  }
  const tagErrors = validateQuestionTags(result.data.questions);
  if (tagErrors.length) return { ok: false, errors: tagErrors };
  return { ok: true, data: result.data };
}

/**
 * Validate a curated bank deck (requires q_ ids).
 */
export function validateBankDeck(data, { knownTags } = {}) {
  const result = bankDeckSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map(formatIssue) };
  }
  const dupes = findDuplicateIds(result.data.questions);
  if (dupes.length) return { ok: false, errors: dupes };
  const tagErrors = validateQuestionTags(result.data.questions, knownTags);
  if (tagErrors.length) return { ok: false, errors: tagErrors };
  return { ok: true, data: result.data };
}

/**
 * Assert global uniqueness of bank question ids across decks.
 * @param {Array<{ questions: Array<{ id: string }> }>} decks
 */
export function findGlobalDuplicateIds(decks) {
  const seen = new Map();
  const errors = [];
  for (const deck of decks) {
    for (const q of deck.questions || []) {
      if (!q.id) continue;
      if (seen.has(q.id)) {
        errors.push(`duplicate id \`${q.id}\` (also in ${seen.get(q.id)})`);
      } else {
        seen.set(q.id, deck.deck_name || 'unknown deck');
      }
    }
  }
  return errors;
}

/**
 * Flatten nested tags.yaml into a Set of valid tag ids.
 * @param {Array<{ id: string, subtopics?: Array<{ id: string }> }>} taxonomy
 */
export function flattenTagIds(taxonomy) {
  const ids = new Set();
  for (const t of taxonomy) {
    ids.add(t.id);
    for (const s of t.subtopics || []) ids.add(s.id);
  }
  return ids;
}

function validateQuestionTags(questions, knownTags) {
  const errors = [];
  questions.forEach((q, i) => {
    for (const tag of q.tags) {
      if (knownTags && !knownTags.has(tag)) {
        errors.push(`question ${i + 1}: unknown tag \`${tag}\``);
      }
    }
  });
  return errors;
}

function formatIssue(issue) {
  const path = issue.path;
  if (path[0] === 'questions' && typeof path[1] === 'number') {
    const qNum = path[1] + 1;
    const field = path.slice(2).join('.') || 'question';
    return `question ${qNum}: \`${field}\` — ${issue.message}`;
  }
  const field = path.join('.') || 'deck';
  return `\`${field}\` — ${issue.message}`;
}

function findDuplicateIds(questions) {
  const seen = new Map();
  const errors = [];
  questions.forEach((q, i) => {
    if (seen.has(q.id)) {
      errors.push(
        `question ${i + 1}: duplicate id \`${q.id}\` (also used in question ${seen.get(q.id) + 1})`
      );
    } else {
      seen.set(q.id, i);
    }
  });
  return errors;
}
