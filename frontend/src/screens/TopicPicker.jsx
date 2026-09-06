import { useEffect, useMemo, useState } from 'react';
import { COUNT_PRESETS, DIFFICULTIES, matchesDifficulty } from '../lib/quiz';
import { useData } from '../lib/DataContext';
import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';
import {
  Checkbox,
  Eyebrow,
  FIELD,
  GhostButton,
  NeutralButton,
  PrimaryButton,
  Segmented,
  Switch,
  TextButton,
} from '../components/controls';

function TopicCard({ topic, open, onToggleOpen, selected, onToggleSub, onToggleAll, index }) {
  const onCount = topic.subtopics.filter((s) => selected[s.id]).length;
  const allOn = onCount === topic.subtopics.length;
  const topicCount =
    topic.subtopics.reduce(
      (n, s) => n + (index?.tags?.find((t) => t.id === s.id)?.count ?? 0),
      0
    ) || topic.count;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border bg-surface-raised',
        onCount > 0 ? 'border-accent/40' : 'border-line'
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="flex min-h-[44px] w-full cursor-pointer select-none items-center gap-3 border-none bg-transparent px-[17px] py-[15px] text-left transition-colors hover:bg-surface-hover"
      >
        <span className="min-w-0">
          <span className="block text-[16.5px] font-semibold leading-tight tracking-[-0.015em] text-ink-bright">
            {topic.name}
          </span>
          <span className="mt-[5px] flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-ink-dim">
            <span>
              {topic.subtopics.length} tags · {topicCount} questions
            </span>
            {topic.fromDeck && (
              <span className="rounded-full bg-accent-wash px-[7px] py-px text-[10px] uppercase tracking-[0.08em] text-accent">
                your deck
              </span>
            )}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          {onCount > 0 && (
            <span className="rounded-full bg-accent px-[9px] py-[3px] font-mono text-[10.5px] font-bold text-on-accent">
              {onCount} on
            </span>
          )}
          <span className="w-[13px] text-center font-mono text-[15px] text-ink-dim">
            {open ? '−' : '+'}
          </span>
        </span>
      </button>

      {open && (
        <div className="animate-fadeIn border-t border-line-soft px-[9px] pb-2.5 pt-2">
          {topic.subtopics.map((s) => (
            <button
              key={s.id}
              type="button"
              role="checkbox"
              aria-checked={!!selected[s.id]}
              onClick={() => onToggleSub(s.id)}
              className="flex min-h-[44px] w-full cursor-pointer select-none items-center gap-[11px] rounded-chip border-none bg-transparent px-2 py-[9px] text-left transition-colors hover:bg-surface-hover2"
            >
              <Checkbox checked={!!selected[s.id]} />
              <span className="min-w-0 text-sm leading-snug text-ink-mid">{s.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
                {index?.tags?.find((t) => t.id === s.id)?.count ?? s.count ?? 0}
              </span>
            </button>
          ))}
          <div className="px-1 pb-[3px] pt-[3px]">
            <TextButton size="sm" onClick={onToggleAll}>
              {allOn ? 'Deselect all' : 'Select all'}
            </TextButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ title, help, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 py-2.5">
      <div className="min-w-0 flex-1 basis-[190px]">
        <div className="text-[14.5px] font-semibold text-ink">{title}</div>
        <div className="mt-1 text-[12.5px] leading-snug text-ink-dim">{help}</div>
      </div>
      {children}
    </div>
  );
}

export function TopicPicker({
  topics,
  index,
  config,
  setConfig,
  onStart,
  startError,
  resumable,
  onResume,
  onDiscardResume,
}) {
  const { customDecks } = useData();
  const [open, setOpen] = useState({});
  useEffect(() => {
    if (topics.length) setOpen((o) => (Object.keys(o).length ? o : { [topics[0].id]: true }));
  }, [topics]);
  const { selected, count, custom, difficulty, timed } = config;

  const tagIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

  const deckQuestions = useMemo(
    () => customDecks.flatMap((d) => d.questions || []),
    [customDecks]
  );

  const bankAvailable = useMemo(() => {
    if (!index || !tagIds.length) return 0;
    if (difficulty === 'Mixed') {
      return tagIds.reduce(
        (sum, id) => sum + (index.tags.find((t) => t.id === id)?.count || 0),
        0
      );
    }
    return tagIds.reduce((sum, id) => {
      const t = index.tags.find((x) => x.id === id);
      return sum + (t?.byDifficulty?.[difficulty] || 0);
    }, 0);
  }, [index, tagIds, difficulty]);

  const deckAvailable = useMemo(() => {
    const tagSet = new Set(tagIds);
    const seen = new Set();
    for (const q of deckQuestions) {
      if (!q.tags?.some((t) => tagSet.has(t))) continue;
      if (!matchesDifficulty(q.difficulty, difficulty)) continue;
      seen.add(q.id);
    }
    return seen.size;
  }, [deckQuestions, tagIds, difficulty]);

  const available = bankAvailable + deckAvailable;
  const target = count === 'Custom' ? Math.max(1, parseInt(custom, 10) || 1) : count;
  const willAsk = Math.min(target, available);
  const blocked = tagIds.length === 0 || available === 0;

  const patch = (p) => setConfig((c) => ({ ...c, ...p }));

  const toggleSub = (id) => patch({ selected: { ...selected, [id]: !selected[id] } });

  const toggleAll = (topic) => {
    const allOn = topic.subtopics.every((s) => selected[s.id]);
    const next = { ...selected };
    topic.subtopics.forEach((s) => {
      next[s.id] = !allOn;
    });
    patch({ selected: next });
  };

  return (
    <>
      <div className={cn(SHELL, 'pb-[30px] pt-8 sm:pt-[54px]')}>
        <h1 className="mb-3.5 text-h1 font-bold text-ink-bright">
          Test what you know about vision and ML
        </h1>
        <p className="mb-[34px] max-w-[60ch] text-pretty text-base leading-relaxed text-ink-mid">
          Pick a topic, set the format, go. Every answer is explained and cited. Works offline, sync
          is optional.
        </p>

        {resumable && (
          <div className="mb-8 flex flex-wrap items-center gap-3.5 rounded-card border border-accent/30 bg-accent-wash px-[18px] py-4">
            <div className="min-w-0 flex-1 basis-[230px]">
              <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.13em] text-accent">
                Unfinished session
              </div>
              <div className="text-sm leading-normal text-ink-mid">
                Question {resumable.index + 1} of {resumable.quiz.length} ·{' '}
                {(resumable.answers || []).filter((a) => a.correct).length} correct so far
              </div>
            </div>
            <div className="flex shrink-0 gap-2.5">
              <NeutralButton onClick={onResume}>Resume</NeutralButton>
              <GhostButton onClick={onDiscardResume}>Discard</GhostButton>
            </div>
          </div>
        )}

        <div className="mb-3.5 flex flex-wrap items-baseline gap-3.5">
          <Eyebrow>01 &nbsp;Topics</Eyebrow>
          <span className="text-[13px] text-ink-faint">
            {tagIds.length
              ? `${tagIds.length} tag${tagIds.length === 1 ? '' : 's'} selected`
              : 'none selected yet'}
          </span>
          <TextButton
            size="sm"
            onClick={() => patch({ selected: {} })}
            className="ml-auto text-ink-dim hover:text-ink"
          >
            Clear
          </TextButton>
        </div>

        <div className="mb-[42px] grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(292px,1fr))]">
          {topics.map((t) => (
            <TopicCard
              key={t.id}
              topic={t}
              index={index}
              open={!!open[t.id]}
              onToggleOpen={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}
              selected={selected}
              onToggleSub={toggleSub}
              onToggleAll={() => toggleAll(t)}
            />
          ))}
        </div>

        <Eyebrow className="mb-3.5">02 &nbsp;Format</Eyebrow>

        <div className="grid gap-1.5 rounded-card border border-line bg-surface-raised px-4 py-3.5 sm:px-[22px] sm:py-5">
          <ConfigRow
            title="Questions"
            help={
              tagIds.length
                ? `${available} available in your selection`
                : 'select tags to see the pool'
            }
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <Segmented
                mono
                value={count}
                onChange={(v) => patch({ count: v })}
                options={COUNT_PRESETS.map((c) => ({ value: c, label: String(c) }))}
              />
              {count === 'Custom' && (
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={custom}
                  onChange={(e) => patch({ custom: e.target.value })}
                  aria-label="Custom question count"
                  // Same height ramp as the Segmented control it sits beside, or the row
                  // is 8px out of line on a phone.
                  className={cn(FIELD, 'h-9 w-[76px] px-2.5 py-0 font-mono text-[12.5px] coarse:h-11')}
                />
              )}
            </div>
          </ConfigRow>

          <div className="h-px bg-line-soft" />

          <ConfigRow title="Difficulty" help="Mixed draws across all three bands">
            <Segmented
              value={difficulty}
              onChange={(v) => patch({ difficulty: v })}
              options={DIFFICULTIES.map((d) => ({ value: d, label: d }))}
            />
          </ConfigRow>

          <div className="h-px bg-line-soft" />

          <ConfigRow
            title="Timed"
            help={timed ? 'Elapsed time is shown, no cutoff' : 'Off, take as long as you need'}
          >
            <Switch checked={timed} onChange={(v) => patch({ timed: v })} label="Timed quiz" />
          </ConfigRow>
        </div>
      </div>

      {/* Opaque, with a top border — the old version faded to transparent, so the status
          line printed straight over whichever topic card happened to be behind it. Same
          treatment as the quiz screen's action bar. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface py-3 sm:bottom-0 sm:py-4">
        <div className={cn(SHELL, 'flex flex-wrap items-center gap-4')}>
          <div className="min-w-0 flex-1 basis-[190px] font-mono text-[12.5px] leading-relaxed text-ink-mid">
            {startError
              ? startError
              : !tagIds.length
                ? 'Pick at least one tag to begin.'
                : available === 0
                  ? 'No questions match that difficulty. Try Mixed.'
                  : `${willAsk} questions · ${difficulty} · ${timed ? 'timed' : 'untimed'}${
                      willAsk < target ? ` · pool capped at ${available}` : ''
                    }`}
          </div>
          <PrimaryButton
            size="lg"
            disabled={blocked}
            onClick={() => onStart({ tagIds, difficulty, count: willAsk, timed })}
            className="w-full sm:w-auto"
          >
            Start quiz
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
