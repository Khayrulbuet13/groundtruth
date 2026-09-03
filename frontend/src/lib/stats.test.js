import { describe, expect, it } from 'vitest';
import {
  accuracyTrend,
  buildStats,
  computeStreaks,
  coverageByTag,
  dueForReview,
  flattenAttempts,
  mistakeList,
  timingByTag,
} from './stats.js';

describe('stat engine', () => {
  const runs = [
    {
      id: '1',
      completed_at: '2026-01-01T12:00:00Z',
      attempts: [
        { question_id: 'q1', tags: ['conv'], is_correct: true, picked_idx: 0 },
        { question_id: 'q2', tags: ['conv'], is_correct: false, picked_idx: 1 },
      ],
    },
    {
      id: '2',
      completed_at: '2026-01-02T12:00:00Z',
      attempts: [
        { question_id: 'q3', tags: ['pool'], is_correct: true, picked_idx: 2 },
      ],
    },
  ];

  it('flattens attempts from runs', () => {
    expect(flattenAttempts(runs)).toHaveLength(3);
  });

  it('builds aggregate stats', () => {
    const stats = buildStats(runs);
    expect(stats.total_runs).toBe(2);
    expect(stats.accuracy).toBe(67);
    expect(stats.per_tag.conv.asked).toBe(2);
  });

  it('computes streaks', () => {
    const streaks = computeStreaks(runs);
    expect(streaks.longest).toBeGreaterThanOrEqual(1);
  });
});

describe('accuracyTrend', () => {
  it('returns one entry per day with a null gap on days with no attempts', () => {
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const trendRuns = [
      {
        id: 'r1',
        completed_at: `${twoDaysAgo}T10:00:00Z`,
        attempts: [
          { question_id: 'q1', tags: ['a'], is_correct: true },
          { question_id: 'q2', tags: ['a'], is_correct: false },
        ],
      },
      {
        id: 'r2',
        completed_at: `${today}T10:00:00Z`,
        attempts: [{ question_id: 'q3', tags: ['a'], is_correct: true }],
      },
    ];

    const trend = accuracyTrend(trendRuns, { days: 5 });
    expect(trend).toHaveLength(5);

    const todayEntry = trend[trend.length - 1];
    expect(todayEntry.date).toBe(today);
    expect(todayEntry.accuracy).toBe(100);
    expect(todayEntry.attempts).toBe(1);

    const twoDaysAgoEntry = trend[trend.length - 3];
    expect(twoDaysAgoEntry.accuracy).toBe(50);
    expect(twoDaysAgoEntry.attempts).toBe(2);

    const yesterdayEntry = trend[trend.length - 2];
    expect(yesterdayEntry.accuracy).toBeNull();
    expect(yesterdayEntry.attempts).toBe(0);
  });
});

describe('coverageByTag', () => {
  it('computes seen/total/pct per tag, guarding zero-total', () => {
    const coverageRuns = [
      {
        id: 'r1',
        completed_at: '2026-01-01T10:00:00Z',
        attempts: [
          { question_id: 'q1', tags: ['conv'], is_correct: true },
          { question_id: 'q1', tags: ['conv'], is_correct: false },
          { question_id: 'q2', tags: ['pool'], is_correct: true },
        ],
      },
    ];
    const indexTags = [
      { id: 'conv', name: 'Convolution', count: 4 },
      { id: 'pool', name: 'Pooling', count: 0 },
      { id: 'norm', name: 'Normalization', count: 10 },
    ];

    const coverage = coverageByTag(coverageRuns, indexTags);
    expect(coverage.conv).toEqual({ seen: 1, total: 4, pct: 25 });
    expect(coverage.pool).toEqual({ seen: 1, total: 0, pct: 0 });
    expect(coverage.norm).toEqual({ seen: 0, total: 10, pct: 0 });
  });
});

describe('dueForReview', () => {
  const dayMs = 86400000;

  it('respects limit and only returns items whose due_at has passed, most overdue first', () => {
    const reviewRuns = [
      {
        id: 'r1',
        completed_at: '2026-01-01T00:00:00Z',
        attempts: [
          { question_id: 'q1', tags: ['a'], is_correct: true },
          { question_id: 'q2', tags: ['a'], is_correct: false },
          { question_id: 'q3', tags: ['a'], is_correct: true },
        ],
      },
    ];

    const due = dueForReview(reviewRuns, { limit: 2 });
    expect(due).toHaveLength(2);
    // A miss has stability 1 (due next day); a hit has 1.6 — so the miss is the most overdue.
    expect(due[0].question_id).toBe('q2');
    expect(due[0].due_at).toBe(new Date(Date.parse('2026-01-01T00:00:00Z') + dayMs).toISOString());
    expect(due[0].due_at <= due[1].due_at).toBe(true);
  });

  it('does not list questions answered too recently', () => {
    const justNow = new Date(Date.now() - 60_000).toISOString();
    const runs = [
      {
        id: 'r1',
        completed_at: justNow,
        attempts: [{ question_id: 'q1', tags: ['a'], is_correct: false }],
      },
    ];
    expect(dueForReview(runs)).toHaveLength(0);
  });
});

describe('mistakeList', () => {
  const lookup = (id) => ({ stem: `stem ${id}`, options: ['a', 'b'], answer: 0 });

  it('drops a question once its latest attempt is correct, regardless of run order', () => {
    const runs = [
      {
        id: 'later',
        completed_at: '2026-01-02T00:00:00Z',
        attempts: [
          { question_id: 'q1', tags: ['t'], is_correct: true, picked_idx: 0 },
          { question_id: 'q2', tags: ['t'], is_correct: false, picked_idx: 1 },
        ],
      },
      {
        id: 'earlier',
        completed_at: '2026-01-01T00:00:00Z',
        attempts: [
          { question_id: 'q1', tags: ['t'], is_correct: false, picked_idx: 1 },
          { question_id: 'q2', tags: ['t'], is_correct: false, picked_idx: 1 },
        ],
      },
    ];
    const mistakes = mistakeList(runs, lookup);
    expect(mistakes.map((m) => m.question_id)).toEqual(['q2']);
    expect(mistakes[0].count).toBe(2);
  });
});

describe('timingByTag', () => {
  it('excludes zero-duration attempts from the median, null when all are zero', () => {
    const timingRuns = [
      {
        id: 'r1',
        completed_at: '2026-01-01T00:00:00Z',
        attempts: [
          { question_id: 'q1', tags: ['conv'], is_correct: true, time_spent_ms: 4000 },
          { question_id: 'q2', tags: ['conv'], is_correct: true, time_spent_ms: 6000 },
          { question_id: 'q3', tags: ['conv'], is_correct: false, time_spent_ms: 0 },
          { question_id: 'q4', tags: ['pool'], is_correct: true, time_spent_ms: 0 },
        ],
      },
    ];

    const timing = timingByTag(timingRuns);
    expect(timing.conv.medianMs).toBe(5000);
    expect(timing.conv.sampleSize).toBe(2);
    expect(timing.pool.medianMs).toBeNull();
    expect(timing.pool.sampleSize).toBe(0);
  });
});
