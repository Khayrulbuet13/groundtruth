import { cn } from '../lib/utils';

const BAND = {
  high: { bar: 'bg-correct', text: 'text-correct' },
  mid: { bar: 'bg-accent', text: 'text-accent' },
  low: { bar: 'bg-wrong', text: 'text-wrong' },
};

export function band(pct) {
  return pct >= 80 ? BAND.high : pct >= 60 ? BAND.mid : BAND.low;
}

/** One responsive row: label (+ optional parent line) · bar · count · %. Used for both quiz-result
 * and progress-screen tag breakdowns — same shape, same thresholds. */
export function BreakdownRow({ name, parentName, asked, correct }) {
  const pct = asked ? Math.round((correct / asked) * 100) : 0;
  const tone = band(pct);

  return (
    <div className="flex flex-col gap-2 border-b border-line-soft p-3 last:border-none sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 sm:basis-[180px]">
        <div className="text-sm leading-snug text-ink">{name}</div>
        {parentName && <div className="mt-0.5 text-[11.5px] text-ink-dim">{parentName}</div>}
      </div>
      <div className="flex min-w-0 items-center gap-3 sm:w-[220px] sm:shrink-0">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
          <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-[42px] shrink-0 text-right font-mono text-[12.5px] text-ink-mid">
          {correct}/{asked}
        </span>
        <span className={cn('w-[46px] shrink-0 text-right font-mono text-[11.5px]', tone.text)}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
