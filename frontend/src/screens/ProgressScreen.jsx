import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { ROUTES } from '../lib/routes';
import { getAllRunsLocal } from '../lib/sync';
import { listBookmarks, removeBookmark } from '../lib/db';
import {
  accuracyTrend,
  coverageByTag,
  dueForReview,
  timingByTag,
  activityByDay,
} from '../lib/stats';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../components/ui/collapsible';
import { Skeleton } from '../components/ui/skeleton';
import { Eyebrow, GhostButton, PrimaryButton } from '../components/controls';
import { BreakdownRow } from '../components/BreakdownRow';
import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';

/** Collapsed-by-default section shell shared by every "below the fold" block. `defaultOpen` lets
 * the sections with the most signal (Mastery) start expanded instead of every section being grey. */
function Section({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 rounded-card border border-line bg-surface-raised"
    >
      <CollapsibleTrigger className="flex min-h-[44px] w-full cursor-pointer items-center justify-between px-4 py-3 text-left">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-ink-dim">
          {title}
          {count != null ? ` · ${count}` : ''}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-dim transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-line-soft px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Same row shape as BreakdownRow but for coverage %, which isn't a correctness signal. */
function CoverageRow({ name, seen, total, pct }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line-soft p-3 last:border-none sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 text-sm text-ink">{name}</div>
      <div className="flex items-center gap-3 sm:w-[220px] sm:shrink-0">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-[42px] shrink-0 text-right font-mono text-[12.5px] text-ink-mid">
          {seen}/{total}
        </span>
        <span className="w-[46px] shrink-0 text-right font-mono text-[11.5px] text-ink-mid">{pct}%</span>
      </div>
    </div>
  );
}

/** Inline sparkline; null-accuracy days are filtered out rather than drawn as zero. */
function Sparkline({ data }) {
  const points = data
    .map((d, i) => (d.accuracy == null ? null : [i, d.accuracy]))
    .filter(Boolean);
  if (points.length < 2) return null;

  const w = 300;
  const h = 40;
  const maxX = data.length - 1 || 1;
  const toXY = ([i, v]) => `${(i / maxX) * w},${h - (v / 100) * h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full text-accent">
      <polyline
        points={points.map(toXY).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProgressScreen({ stats }) {
  const navigate = useNavigate();
  const { tagName, index, questionLookupSync } = useData();
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => {
    getAllRunsLocal().then(setRuns).catch(() => setRuns([]));
    listBookmarks().then(setBookmarks).catch(() => setBookmarks([]));
  }, []);

  const handleRemoveBookmark = async (questionId) => {
    await removeBookmark(questionId);
    setBookmarks((prev) => prev.filter((b) => b.question_id !== questionId));
  };

  const trend = useMemo(() => accuracyTrend(runs, { days: 30 }), [runs]);
  const hasTrend = useMemo(() => trend.filter((d) => d.accuracy != null).length >= 2, [trend]);
  const coverage = useMemo(() => coverageByTag(runs, index?.tags || []), [runs, index]);
  const due = useMemo(() => dueForReview(runs, { limit: 10 }), [runs]);
  const timing = useMemo(() => timingByTag(runs), [runs]);
  const activity = useMemo(() => activityByDay(runs, { days: 91 }), [runs]);

  const dueResolved = useMemo(
    () => due.map((d) => ({ ...d, question: questionLookupSync(d.question_id) })),
    [due, questionLookupSync]
  );
  const dueTagIds = useMemo(() => {
    const s = new Set();
    for (const d of dueResolved) for (const t of d.question?.tags || []) s.add(t);
    return [...s];
  }, [dueResolved]);

  const activityCells = useMemo(() => {
    const cells = [];
    const today = new Date();
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      cells.push({ date, count: activity[date] || 0 });
    }
    return cells;
  }, [activity]);
  const activityMax = Math.max(1, ...activityCells.map((c) => c.count));

  const coverageRows = useMemo(
    () =>
      Object.entries(coverage)
        .filter(([, v]) => v.total > 0)
        .map(([id, v]) => ({ id, name: tagName(id), ...v }))
        .sort((a, b) => a.pct - b.pct),
    [coverage, tagName]
  );

  const timingRows = useMemo(
    () =>
      Object.entries(timing)
        .filter(([, v]) => v.sampleSize > 0)
        .map(([id, v]) => ({ id, name: tagName(id), ...v }))
        .sort((a, b) => b.medianMs - a.medianMs),
    [timing, tagName]
  );

  const drillTags = useMemo(() => {
    const perTag = stats?.per_tag || {};
    return Object.keys(perTag)
      .map((id) => {
        const { asked, correct } = perTag[id];
        return { id, pct: asked ? Math.round((correct / asked) * 100) : 0, asked, correct };
      })
      .filter((t) => t.asked > 0)
      .sort((a, b) => a.correct / a.asked - b.correct / b.asked)
      .slice(0, 3);
  }, [stats]);

  const masteryGroups = useMemo(() => {
    const perTag = stats?.per_tag || {};
    const groups = {};
    for (const id of Object.keys(perTag)) {
      const def = index?.tags?.find((t) => t.id === id);
      const groupId = def?.parent || id;
      (groups[groupId] ||= []).push(id);
    }
    return Object.entries(groups)
      .map(([groupId, ids]) => {
        const rows = ids
          .map((id) => ({ id, name: tagName(id), ...perTag[id] }))
          .sort((a, b) => a.correct / a.asked - b.correct / b.asked);
        const totalAsked = rows.reduce((s, r) => s + r.asked, 0);
        const totalCorrect = rows.reduce((s, r) => s + r.correct, 0);
        return {
          groupId,
          groupName: tagName(groupId),
          rows,
          avgPct: totalAsked ? totalCorrect / totalAsked : 0,
          standalone: rows.length === 1 && rows[0].id === groupId,
        };
      })
      .sort((a, b) => a.avgPct - b.avgPct);
  }, [stats, index, tagName]);

  const mistakeTagIds = useMemo(() => {
    const s = new Set();
    for (const m of (stats?.mistakes || []).slice(0, 10)) for (const t of m.tags || []) s.add(t);
    return [...s];
  }, [stats]);

  if (!stats) {
    return (
      <div className={cn(SHELL, 'pb-16 pt-8')}>
        <Skeleton className="mb-6 h-6 w-40" />
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="mb-4 h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (stats.total_runs === 0) {
    return (
      <div className={cn(SHELL, 'py-12 text-center')}>
        <div className="mb-5 text-sm text-ink-dim">
          No quizzes yet — finish one to see your stats here.
        </div>
        <PrimaryButton onClick={() => navigate(ROUTES.home)}>
          Start a quiz
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className={cn(SHELL, 'pb-16 pt-8')}>
      <Eyebrow className="mb-4">Your progress</Eyebrow>

      {!user && (
        <div className="mb-6 rounded-card border border-line-soft bg-surface-sunken px-4 py-3 text-[13px] text-ink-mid">
          Signed out — your stats live on this device only. Sign in to sync them across devices.
        </div>
      )}

      {drillTags.length > 0 && (
        <div className="mb-6 rounded-card border border-line bg-surface-raised p-4">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.13em] text-ink-dim">
            Drill this next
          </div>
          <div className="mb-4 space-y-1.5">
            {drillTags.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm text-ink">
                <span className="min-w-0 truncate">{tagName(t.id)}</span>
                <span className="shrink-0 font-mono text-ink-mid">{t.pct}%</span>
              </div>
            ))}
          </div>
          <PrimaryButton
            onClick={() => navigate(`${ROUTES.quiz}?tags=${drillTags.map((t) => t.id).join(',')}`)}
          >
            Drill these
          </PrimaryButton>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <div className="font-mono text-2xl font-bold text-ink-bright">{stats.accuracy}%</div>
          <div className="mt-1 text-sm text-ink-dim">overall accuracy</div>
        </div>
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <div className="font-mono text-2xl font-bold text-ink-bright">{stats.streaks.current}</div>
          <div className="mt-1 text-sm text-ink-dim">day streak (best {stats.streaks.longest})</div>
        </div>
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <div className="font-mono text-2xl font-bold text-ink-bright">{stats.total_runs}</div>
          <div className="mt-1 text-sm text-ink-dim">completed quizzes</div>
        </div>
      </div>

      {hasTrend && (
        <div className="mb-8 rounded-card border border-line bg-surface-raised p-4">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-ink-dim">
            Accuracy · last 30 days
          </div>
          <Sparkline data={trend} />
        </div>
      )}

      {masteryGroups.length > 0 && (
        <Section title="Mastery by tag" defaultOpen count={masteryGroups.reduce((s, g) => s + g.rows.length, 0)}>
          <div className="space-y-4">
            {masteryGroups.map((g) => (
              <div key={g.groupId}>
                {!g.standalone && (
                  <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                    {g.groupName}
                  </div>
                )}
                <div className="rounded-card border border-line-soft bg-surface-sunken">
                  {g.rows.map((r) => (
                    <BreakdownRow key={r.id} {...r} name={g.standalone ? g.groupName : r.name} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Due for review" count={due.length}>
        {due.length === 0 ? (
          <div className="text-sm text-ink-dim">Nothing due right now.</div>
        ) : (
          <>
            <PrimaryButton
              className="mb-4"
              disabled={dueTagIds.length === 0}
              onClick={() => navigate(`${ROUTES.quiz}?tags=${dueTagIds.join(',')}`)}
            >
              Review due questions
            </PrimaryButton>
            <div className="space-y-2">
              {dueResolved.map((d) => (
                <div key={d.question_id} className="rounded-card border border-line-soft p-3">
                  <div className="text-sm text-ink">
                    {d.question?.stem || `Question ${d.question_id.slice(0, 8)}…`}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-dim">
                    {(d.question?.tags || []).map((t) => (
                      <span key={t}>{tagName(t)}</span>
                    ))}
                    <span className="font-mono">
                      {d.reps} reps · {d.lapses} lapses
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Mistakes" count={stats.mistakes?.length || 0}>
        {!stats.mistakes?.length ? (
          <div className="text-sm text-ink-dim">No mistakes recorded yet.</div>
        ) : (
          <>
            <PrimaryButton
              className="mb-4"
              disabled={mistakeTagIds.length === 0}
              onClick={() => navigate(`${ROUTES.quiz}?tags=${mistakeTagIds.join(',')}`)}
            >
              Drill my mistakes
            </PrimaryButton>
            <div className="space-y-2">
              {stats.mistakes.slice(0, 10).map((m) => (
                <div key={m.question_id} className="rounded-card border border-line-soft p-3">
                  <div className="text-sm text-ink">{m.stem}</div>
                  <div className="mt-1.5 text-xs text-ink-dim">{m.tag_name}</div>
                  <div className="mt-1 text-xs text-wrong">You picked: {m.picked_text}</div>
                  <div className="text-xs text-correct">Correct: {m.correct_text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Saved for review" count={bookmarks.length}>
        {bookmarks.length === 0 ? (
          <div className="text-sm text-ink-dim">
            Nothing saved yet — use the save button during a quiz to bookmark questions you want to
            revisit.
          </div>
        ) : (
          <div className="space-y-2">
            {bookmarks.map((b) => (
              <div
                key={b.question_id}
                className="flex items-start justify-between gap-3 rounded-card border border-line-soft p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink">{b.stem}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11.5px] text-ink-dim">
                    {(b.tags || []).map((t) => (
                      <span key={t}>{tagName(t)}</span>
                    ))}
                  </div>
                </div>
                <GhostButton
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleRemoveBookmark(b.question_id)}
                >
                  Remove
                </GhostButton>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Bank coverage" count={coverageRows.length}>
        {coverageRows.length === 0 ? (
          <div className="text-sm text-ink-dim">No coverage data yet.</div>
        ) : (
          <div className="rounded-card border border-line-soft bg-surface-sunken">
            {coverageRows.map((r) => (
              <CoverageRow key={r.id} {...r} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Activity">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: 'repeat(13, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(7, 1fr)',
            gridAutoFlow: 'column',
          }}
        >
          {activityCells.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.count} attempt${c.count === 1 ? '' : 's'}`}
              className={cn('aspect-square rounded-[2px]', c.count === 0 ? 'bg-surface-hover' : 'bg-accent')}
              style={c.count > 0 ? { opacity: 0.25 + 0.75 * (c.count / activityMax) } : undefined}
            />
          ))}
        </div>
      </Section>

      <Section title="Timing">
        {timingRows.length === 0 ? (
          <div className="text-sm text-ink-dim">
            Timing data will appear here once you&rsquo;ve answered a few more questions.
          </div>
        ) : (
          <div className="space-y-2">
            {timingRows.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink">{t.name}</span>
                <span className="shrink-0 font-mono text-ink-mid">{Math.round(t.medianMs / 1000)}s</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Run history" count={stats.history?.length || 0}>
        <div className="space-y-2">
          {(stats.history || []).map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line-soft px-3 py-2.5"
            >
              <span className="font-mono text-sm text-ink">
                {h.score}/{h.total}
              </span>
              <span className="text-xs text-ink-dim">
                {new Date(h.completed_at).toLocaleString()} · {h.difficulty}
              </span>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
