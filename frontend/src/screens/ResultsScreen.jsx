import { useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import {
  WEAK_THRESHOLD,
  accuracy,
  formatTime,
  scoreByTag,
  weakTags,
} from '../lib/quiz';
import { useData } from '../lib/DataContext';
import { SafeText } from '../components/SafeText';
import { Eyebrow, GhostButton, PrimaryButton } from '../components/controls';
import { BreakdownRow, band } from '../components/BreakdownRow';
import { staggerContainer, staggerItem } from '../lib/motion';

function useCountUp(target, { duration = 600 } = {}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="font-mono text-[17px] font-medium text-ink">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-dim">{label}</div>
    </div>
  );
}

function ReviewCard({ n, question, answer, subtopicName }) {
  const ok = answer?.correct;
  return (
    <div className="rounded-card border border-line bg-surface-raised px-[18px] py-4">
      <div className="mb-[11px] flex flex-wrap items-center gap-[11px]">
        <span className="font-mono text-[11px] text-ink-dim">#{n}</span>
        <span
          className={[
            'rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.05em]',
            ok ? 'bg-correct-wash text-correct' : 'bg-wrong-wash text-wrong',
          ].join(' ')}
        >
          {ok ? 'correct' : 'missed'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {subtopicName}
        </span>
      </div>
      <div className="mb-3 text-pretty text-[15px] leading-snug text-ink-bright">
        <SafeText text={question.stem} />
      </div>
      <div className="mb-3 grid gap-[5px]">
        <div className="text-[13.5px] leading-normal text-ink-mid">
          <span className="text-ink-dim">correct&nbsp;&nbsp;</span>
          <SafeText text={question.options[question.answer]} />
        </div>
        {!ok && answer?.picked != null && (
          <div className="text-[13.5px] leading-normal text-ink-mid">
            <span className="text-ink-dim">yours&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <SafeText text={question.options[answer.picked]} />
          </div>
        )}
      </div>
      <p className="m-0 text-pretty text-[13.5px] leading-[1.62] text-ink-mid">
        <SafeText text={question.explanation} />
      </p>
      <div className="mt-2.5 text-[11.5px] text-ink-dim">
        <SafeText text={question.source} />
      </div>
    </div>
  );
}

export function ResultsScreen({ quiz, answers, difficulty, timed, elapsed, onRetryWeak, onNewQuiz }) {
  const { tagName, index } = useData();
  const [reviewOpen, setReviewOpen] = useState(false);

  const nameFor = (id) => tagName(id);
  const parentFor = (id) => {
    const parent = index?.tags?.find((t) => t.id === id)?.parent;
    return parent ? tagName(parent) : '';
  };

  const per = useMemo(() => scoreByTag(answers), [answers]);
  const weak = useMemo(() => weakTags(answers), [answers]);
  const pct = accuracy(answers);
  const tone = band(pct);
  const correctCount = answers.filter((a) => a.correct).length;
  const validTimes = answers
    .map((a) => a.timeSpentMs)
    .filter((t) => t > 0);
  const avgTimeLabel =
    validTimes.length > 0
      ? `${Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length / 1000)}s`
      : '—';

  const animatedCorrect = useCountUp(correctCount);
  const animatedPct = useCountUp(pct);

  const rows = useMemo(
    () =>
      Object.keys(per).sort(
        (a, b) => per[a].correct / per[a].asked - per[b].correct / per[b].asked
      ),
    [per]
  );

  return (
    <div className="mx-auto max-w-shell px-4 pb-[70px] pt-7 sm:px-7 sm:pt-12 lg:max-w-[720px]">
      <Eyebrow className="mb-[22px]">
        Session complete · {difficulty} · {timed ? formatTime(elapsed) : 'untimed'}
      </Eyebrow>

      <div className="mb-4 flex flex-wrap items-end gap-6 sm:gap-[52px]">
        <div>
          <div className="font-mono text-score font-bold text-ink-bright">
            {animatedCorrect}/{answers.length}
          </div>
          <div className="mt-[11px] font-mono text-[11.5px] uppercase tracking-[0.11em] text-ink-dim">
            correct
          </div>
        </div>
        <div>
          <div
            className={`font-mono text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-none tracking-[-0.03em] ${tone.text}`}
          >
            {animatedPct}%
          </div>
          <div className="mt-[11px] font-mono text-[11.5px] uppercase tracking-[0.11em] text-ink-dim">
            accuracy
          </div>
        </div>
        <div className="flex flex-wrap gap-5 pb-[5px] sm:gap-[34px]">
          <Stat value={String(Object.keys(per).length)} label="tags covered" />
          <Stat value={timed ? formatTime(elapsed) : '—'} label={timed ? 'total time' : 'untimed'} />
          <Stat value={avgTimeLabel} label="avg time / question" />
        </div>
      </div>

      <div className="mb-[42px] h-1.5 overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full rounded-full ${tone.bar} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <Eyebrow className="mb-[15px]">Breakdown by tag</Eyebrow>
      <m.div
        className="mb-[30px] rounded-card border border-line bg-surface-raised px-2 py-[5px]"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {rows.map((k) => (
          <m.div key={k} variants={staggerItem}>
            <BreakdownRow
              name={nameFor(k)}
              parentName={parentFor(k)}
              asked={per[k].asked}
              correct={per[k].correct}
            />
          </m.div>
        ))}
      </m.div>

      {weak.length > 0 && (
        <div className="mb-[30px] rounded-card border border-wrong/30 bg-wrong-wash px-5 py-[18px]">
          <div className="mb-[11px] font-mono text-[10.5px] uppercase tracking-[0.13em] text-wrong">
            Weak areas · below {Math.round(WEAK_THRESHOLD * 100)}%
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {weak.map((k) => (
              <span
                key={k}
                className="rounded-full bg-surface-hover px-3 py-[5px] text-[13px] text-ink"
              >
                {nameFor(k)}
              </span>
            ))}
          </div>
          <p className="m-0 max-w-[62ch] text-pretty text-[13.5px] leading-relaxed text-ink-mid">
            Retry pulls a fresh set drawn only from these {weak.length} tag
            {weak.length === 1 ? '' : 's'}, at the same difficulty setting.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-[11px]">
        <PrimaryButton
          disabled={weak.length === 0}
          onClick={() => onRetryWeak(weak)}
          className="px-[22px] py-3 text-[14.5px]"
        >
          Retry weak topics
        </PrimaryButton>
        <GhostButton className="px-[22px] py-3 text-[14.5px]" onClick={onNewQuiz}>
          New quiz
        </GhostButton>
        <button
          type="button"
          onClick={() => setReviewOpen((o) => !o)}
          className="cursor-pointer border-none bg-transparent px-1 py-3 text-[13.5px] text-accent hover:text-accent-hi"
        >
          {reviewOpen ? 'Hide answer review' : `Review all ${answers.length} answers`}
        </button>
      </div>

      {reviewOpen && (
        <div className="mt-[26px] grid animate-fadeIn gap-2.5">
          {answers.map((a, n) => (
            <ReviewCard
              key={n}
              n={n + 1}
              question={quiz[n]}
              answer={a}
              subtopicName={(quiz[n].tags || []).map(nameFor).join(' · ')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
