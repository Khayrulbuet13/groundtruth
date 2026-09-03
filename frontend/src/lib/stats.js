/**
 * Client-side stat engine — computed from IndexedDB run log, no server.
 */
import { WEAK_THRESHOLD } from './quiz';

export function flattenAttempts(runs) {
  const attempts = [];
  for (const run of runs) {
    if (!run.completed_at || !run.attempts) continue;
    for (const a of run.attempts) {
      attempts.push({
        ...a,
        run_id: run.id,
        completed_at: run.completed_at,
      });
    }
  }
  return attempts;
}

export function accuracyFromAttempts(attempts) {
  if (!attempts.length) return 0;
  return Math.round((attempts.filter((a) => a.is_correct).length / attempts.length) * 100);
}

export function scoreByTagFromAttempts(attempts) {
  const out = {};
  for (const a of attempts) {
    const tags = a.tags || (a.subtopic ? [a.subtopic] : []);
    for (const tag of tags) {
      if (!out[tag]) out[tag] = { asked: 0, correct: 0 };
      out[tag].asked += 1;
      if (a.is_correct) out[tag].correct += 1;
    }
  }
  return out;
}

export function weakTagsFromAttempts(attempts, threshold = WEAK_THRESHOLD) {
  const per = scoreByTagFromAttempts(attempts);
  return Object.keys(per).filter((k) => per[k].correct / per[k].asked < threshold);
}

export function computeStreaks(runs) {
  const days = [
    ...new Set(
      runs
        .filter((r) => r.completed_at)
        .map((r) => r.completed_at.slice(0, 10))
    ),
  ].sort();
  if (!days.length) return { current: 0, longest: 0 };

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = (cur - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastDay = days[days.length - 1];
  let activeStreak = 0;
  if (lastDay === today || lastDay === yesterday) {
    activeStreak = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const prev = new Date(days[i]);
      const cur = new Date(days[i + 1]);
      if ((cur - prev) / 86400000 === 1) activeStreak += 1;
      else break;
    }
  }

  return { current: activeStreak, longest: Math.max(longest, activeStreak) };
}

/** Chronological attempt list (oldest first) so review logic sees history in order. */
function attemptsInOrder(runs) {
  return flattenAttempts(runs.filter((r) => r.completed_at)).sort((a, b) =>
    a.completed_at.localeCompare(b.completed_at)
  );
}

/** Questions the user has missed and not since answered correctly, most-missed first. */
export function mistakeList(runs, questionLookup, tagName = (id) => id) {
  const seen = new Map();
  for (const a of attemptsInOrder(runs)) {
    const key = a.question_id;
    if (a.is_correct) {
      seen.delete(key);
      continue;
    }
    const q = questionLookup(a.question_id);
    if (!q) continue;
    const primaryTag = (a.tags || [])[0] || a.subtopic;
    if (!seen.has(key)) {
      seen.set(key, {
        question_id: a.question_id,
        tags: a.tags || [],
        tag_name: tagName(primaryTag),
        stem: q.stem,
        picked_text: q.options?.[a.picked_idx] ?? '—',
        correct_text: q.options?.[q.answer ?? q.answer_idx] ?? '—',
        count: 0,
      });
    }
    seen.get(key).count += 1;
  }
  return [...seen.values()].sort((a, b) => b.count - a.count);
}

export function deriveReviewStates(runs) {
  const states = {};
  for (const a of attemptsInOrder(runs)) {
    const qid = a.question_id;
    const prev = states[qid];
    const quality = a.is_correct ? 4 : 1;
    const reps = (prev?.reps ?? 0) + 1;
    const lapses = (prev?.lapses ?? 0) + (quality < 3 ? 1 : 0);
    const stability = Math.max(1, (prev?.stability ?? 1) * (quality >= 3 ? 1.6 : 0.7));
    const difficulty = Math.min(
      10,
      Math.max(1, (prev?.difficulty ?? 5) + (quality >= 3 ? -0.2 : 0.5))
    );
    states[qid] = {
      question_id: qid,
      stability,
      difficulty,
      due_at: new Date(new Date(a.completed_at).getTime() + stability * 86400000).toISOString(),
      reps,
      lapses,
    };
  }
  return states;
}

export function buildStats(runs, questionLookup = () => null, tagName = (id) => id) {
  const completed = runs.filter((r) => r.completed_at);
  const attempts = flattenAttempts(completed);
  const perTag = scoreByTagFromAttempts(attempts);
  const streaks = computeStreaks(completed);
  const lastSync = completed
    .filter((r) => r.synced_at)
    .sort((a, b) => b.synced_at.localeCompare(a.synced_at))[0]?.synced_at;

  return {
    total_runs: completed.length,
    total_attempts: attempts.length,
    accuracy: accuracyFromAttempts(attempts),
    per_tag: perTag,
    weak_tags: weakTagsFromAttempts(attempts),
    streaks,
    review_states: deriveReviewStates(completed),
    last_sync_at: lastSync,
    mistakes: mistakeList(completed, questionLookup, tagName),
    history: completed
      .slice()
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
      .map((r) => ({
        id: r.id,
        score: r.score,
        total: r.total,
        completed_at: r.completed_at,
        difficulty: r.config?.difficulty,
      })),
  };
}

function median(sortedNums) {
  const n = sortedNums.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedNums[mid - 1] + sortedNums[mid]) / 2 : sortedNums[mid];
}

/** Per-day accuracy for the last `days` calendar days (UTC), null accuracy on empty days. */
export function accuracyTrend(runs, { days = 30 } = {}) {
  const attempts = flattenAttempts(runs.filter((r) => r.completed_at));
  const byDay = {};
  for (const a of attempts) {
    const day = a.completed_at.slice(0, 10);
    (byDay[day] ||= []).push(a);
  }

  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const dayAttempts = byDay[date] || [];
    out.push({
      date,
      accuracy: dayAttempts.length ? accuracyFromAttempts(dayAttempts) : null,
      attempts: dayAttempts.length,
    });
  }
  return out;
}

/** Distinct-question coverage per tag, against `indexTags` from index.json's `.tags`. */
export function coverageByTag(runs, indexTags) {
  const attempts = flattenAttempts(runs.filter((r) => r.completed_at));
  const seenByTag = {};
  for (const a of attempts) {
    const tags = a.tags || (a.subtopic ? [a.subtopic] : []);
    for (const tag of tags) {
      (seenByTag[tag] ||= new Set()).add(a.question_id);
    }
  }

  const out = {};
  for (const t of indexTags || []) {
    const seen = seenByTag[t.id]?.size || 0;
    const total = t.count || 0;
    out[t.id] = { seen, total, pct: total > 0 ? Math.round((seen / total) * 100) : 0 };
  }
  return out;
}

/** Review states whose due_at has passed, most overdue first. */
export function dueForReview(runs, { limit = 20 } = {}) {
  const states = deriveReviewStates(runs);
  const now = new Date(Date.now()).toISOString();
  return Object.values(states)
    .filter((s) => s.due_at <= now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, limit)
    .map((s) => ({ question_id: s.question_id, due_at: s.due_at, reps: s.reps, lapses: s.lapses }));
}

/** Median answer time per tag, excluding unrecorded (0ms) attempts. */
export function timingByTag(runs) {
  const attempts = flattenAttempts(runs.filter((r) => r.completed_at));
  const byTag = {};
  for (const a of attempts) {
    const tags = a.tags || (a.subtopic ? [a.subtopic] : []);
    for (const tag of tags) {
      byTag[tag] ||= [];
      if (a.time_spent_ms) byTag[tag].push(a.time_spent_ms);
    }
  }

  const out = {};
  for (const tag of Object.keys(byTag)) {
    const times = byTag[tag].slice().sort((a, b) => a - b);
    out[tag] = { medianMs: times.length ? median(times) : null, sampleSize: times.length };
  }
  return out;
}

/** Attempt counts per day for the last `days` days, unpadded (heatmap fills its own grid). */
export function activityByDay(runs, { days = 90 } = {}) {
  const attempts = flattenAttempts(runs.filter((r) => r.completed_at));
  const cutoff = Date.now() - days * 86400000;
  const out = {};
  for (const a of attempts) {
    if (new Date(a.completed_at).getTime() < cutoff) continue;
    const day = a.completed_at.slice(0, 10);
    out[day] = (out[day] || 0) + 1;
  }
  return out;
}
