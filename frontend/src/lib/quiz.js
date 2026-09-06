export const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'];
export const COUNT_PRESETS = [10, 25, 50, 'Custom'];
export const WEAK_THRESHOLD = 0.6;

/**
 * The bank build script title-cases difficulty ("easy" -> "Easy") but an uploaded deck keeps
 * the lowercase value the schema requires, so a plain `===` silently dropped every imported
 * question as soon as a difficulty other than Mixed was picked. Compare case-insensitively.
 */
export function matchesDifficulty(questionDifficulty, wanted) {
  if (!wanted || wanted === 'Mixed') return true;
  return String(questionDifficulty).toLowerCase() === String(wanted).toLowerCase();
}

/** Title-case a difficulty for display and for storage alongside bank questions. */
export function normalizeDifficulty(d) {
  if (!d) return d;
  const s = String(d);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Deterministic LCG shuffle — same seed gives the same order, so a session can be replayed. */
export function shuffle(arr, seed = 1) {
  const a = arr.slice();
  let r = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    const j = r % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pool(questions, tagIds, difficulty) {
  const tagSet = new Set(tagIds);
  const seen = new Map();
  for (const q of questions) {
    const tags = q.tags || [];
    if (!tags.some((t) => tagSet.has(t))) continue;
    if (!matchesDifficulty(q.difficulty, difficulty)) continue;
    if (!seen.has(q.id)) seen.set(q.id, q);
  }
  return [...seen.values()];
}

/**
 * Draw a quiz. Option order is shuffled per question and `answer` is remapped.
 */
export function buildQuiz(questions, { tagIds, difficulty, count, seed = Date.now() }) {
  const drawn = shuffle(pool(questions, tagIds, difficulty), seed % 99991).slice(
    0,
    Math.max(1, count)
  );
  return drawn.map((q, n) => {
    const answerIdx = q.answer ?? q.answer_idx;
    const order = shuffle([0, 1, 2, 3], (seed + n * 7919) % 99991);
    return {
      ...q,
      options: order.map((k) => q.options[k]),
      answer: order.indexOf(answerIdx),
    };
  });
}

/** answers: [{ tags, correct, picked }] */
export function scoreByTag(answers) {
  const out = {};
  for (const a of answers) {
    const tags = a.tags || [];
    for (const tag of tags) {
      if (!out[tag]) out[tag] = { asked: 0, correct: 0 };
      out[tag].asked += 1;
      if (a.correct) out[tag].correct += 1;
    }
  }
  return out;
}

export function weakTags(answers, threshold = WEAK_THRESHOLD) {
  const per = scoreByTag(answers);
  return Object.keys(per).filter((k) => per[k].correct / per[k].asked < threshold);
}

export function accuracy(answers) {
  if (!answers.length) return 0;
  return Math.round((answers.filter((a) => a.correct).length / answers.length) * 100);
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
