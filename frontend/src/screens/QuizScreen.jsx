import { useCallback, useEffect, useState } from 'react';
import { m } from 'motion/react';
import { Bookmark, BookmarkCheck, MoreVertical } from 'lucide-react';
import { formatTime } from '../lib/quiz';
import { useData } from '../lib/DataContext';
import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';
import { SafeText } from '../components/SafeText';
import { FIELD, IconButton, NeutralButton, PrimaryButton, Segmented } from '../components/controls';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui/dropdown-menu';
import { addBookmark, removeBookmark, isBookmarked } from '../lib/db';
import { api } from '../lib/api';
import { staggerContainer, staggerItem } from '../lib/motion';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Option card. Every card is the same width, the same min-height, the same padding and the
 * same type size in every state — nothing about a card hints at correctness until
 * `revealed`. Text wraps inside the fixed frame instead of resizing it.
 *
 * Two things keep that true and are easy to undo by accident:
 *  - `w-full`, because a <button> shrink-wraps its content even at `display: grid`, which
 *    gave every option a different width.
 *  - the verdict column is reserved (`invisible`, not `hidden`) so revealing an answer
 *    cannot reflow the text and change the card's height.
 */
function OptionCard({ index, text, state, onPick }) {
  const frame =
    'grid h-full w-full grid-cols-[26px_minmax(0,1fr)] items-center gap-[15px] rounded-card border px-[18px] py-[15px] text-left transition-[border-color,background-color,opacity] duration-150 sm:grid-cols-[26px_minmax(0,1fr)_72px]';

  const byState = {
    idle: 'border-line bg-surface-sunken cursor-pointer hover:border-line-hover hover:bg-surface-hover',
    picked: 'border-accent bg-accent-wash cursor-pointer',
    correct: 'border-correct bg-correct-wash cursor-default',
    wrong: 'border-wrong bg-wrong-wash cursor-default',
    dimmed: 'border-line bg-surface-sunken opacity-45 cursor-default',
  }[state];

  const keyByState = {
    idle: 'border-line-key text-ink-mid',
    picked: 'border-accent bg-accent text-on-accent',
    correct: 'border-correct bg-correct text-on-accent',
    wrong: 'border-wrong bg-wrong text-on-accent',
    dimmed: 'border-line-key text-ink-mid',
  }[state];

  const tag =
    state === 'correct' ? { label: 'correct', cls: 'text-correct' }
    : state === 'wrong' ? { label: 'your pick', cls: 'text-wrong' }
    : null;

  const interactive = state === 'idle' || state === 'picked';

  return (
    <button
      type="button"
      data-option={LETTERS[index]}
      disabled={!interactive}
      aria-pressed={state === 'picked'}
      onClick={onPick}
      className={cn(frame, byState, 'min-h-[64px] sm:min-h-[68px]')}
    >
      <span
        className={cn(
          'flex h-[26px] items-center justify-center rounded-chip border font-mono text-[11.5px] font-medium',
          keyByState
        )}
      >
        {LETTERS[index]}
      </span>
      <span className="text-pretty text-[15.5px] leading-normal text-ink">
        <SafeText text={text} />
      </span>
      {/* The visible verdict is desktop-only (it costs too much width on a phone), so the
          state still has to reach a screen reader on every viewport. */}
      {tag && <span className="sr-only">{tag.label}</span>}
      <span
        aria-hidden={!tag}
        className={cn(
          'hidden text-right font-mono text-[10px] uppercase leading-tight tracking-[0.09em] sm:block',
          tag ? tag.cls : 'invisible'
        )}
      >
        {tag?.label ?? 'correct'}
      </span>
    </button>
  );
}

export function QuizScreen({
  quiz,
  index,
  picked,
  revealed,
  elapsed,
  timed,
  onPick,
  onReveal,
  onAdvance,
}) {
  const { tagName } = useData();
  const q = quiz[index];
  const last = index + 1 >= quiz.length;
  const wasRight = revealed && picked === q.answer;
  const progress = ((index + (revealed ? 1 : 0)) / quiz.length) * 100;

  const [bookmarked, setBookmarked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('wrong_answer');
  const [note, setNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    let ignore = false;
    isBookmarked(q.id)
      .then((v) => {
        if (!ignore) setBookmarked(v);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [q.id]);

  const toggleBookmark = useCallback(async () => {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) await addBookmark(q);
      else await removeBookmark(q.id);
    } catch {
      setBookmarked(!next);
    }
  }, [bookmarked, q]);

  const submitReport = async () => {
    setReportError('');
    try {
      await api.report({ question_id: q.id, reason, note: note || null });
      setReportSent(true);
    } catch {
      setReportError('Could not send report. Try again later.');
    }
  };

  useEffect(() => {
    if (!reportSent) return undefined;
    const id = setTimeout(() => {
      setReportOpen(false);
      setReportSent(false);
      setNote('');
    }, 700);
    return () => clearTimeout(id);
  }, [reportSent]);

  useEffect(() => {
    const onKey = (e) => {
      if (reportOpen) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'f') return toggleBookmark();
      if (!revealed && '1234'.includes(k)) return onPick(Number(k) - 1);
      if (!revealed && 'abcd'.includes(k)) return onPick('abcd'.indexOf(k));
      if (k === 'enter') {
        if (revealed) onAdvance();
        else if (picked !== null) onReveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reportOpen, revealed, picked, onPick, onReveal, onAdvance, toggleBookmark]);

  const optionState = (k) => {
    if (!revealed) return picked === k ? 'picked' : 'idle';
    if (k === q.answer) return 'correct';
    if (k === picked) return 'wrong';
    return 'dimmed';
  };

  return (
    <div className={cn(SHELL, 'pb-28 pt-4 sm:pb-16 sm:pt-[38px]')}>
      <div className="flex items-center gap-3.5">
        <span className="font-mono text-[12.5px] font-medium text-ink-mid">
          Question {index + 1} of {quiz.length}
        </span>
        {timed && (
          <span className="font-mono text-[12.5px] font-medium text-ink-dim">
            · {formatTime(elapsed)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            onClick={toggleBookmark}
            active={bookmarked}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? 'Saved for review' : 'Save for review'}
            title={bookmarked ? 'Saved for review' : 'Save for review'}
          >
            {bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton title="More options" aria-label="More options">
                <MoreVertical size={15} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                Report issue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a problem with this question</DialogTitle>
            <DialogDescription>
              Let us know what&apos;s wrong. This helps improve the question bank.
            </DialogDescription>
          </DialogHeader>
          <Segmented
            options={[
              { value: 'wrong_answer', label: 'Wrong answer' },
              { value: 'typo', label: 'Typo' },
              { value: 'unclear', label: 'Unclear' },
              { value: 'other', label: 'Other' },
            ]}
            value={reason}
            onChange={setReason}
          />
          <textarea
            className={FIELD}
            placeholder="Optional details"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {reportError && <p className="m-0 text-[12.5px] text-wrong">{reportError}</p>}
          {reportSent && <p className="m-0 text-[12.5px] text-correct">Report sent. Thank you!</p>}
          <DialogFooter>
            <PrimaryButton disabled={reportSent} onClick={submitReport}>
              {reportSent ? 'Sent' : 'Submit report'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className="my-[13px] mb-[30px] h-[3px] overflow-hidden rounded-full bg-line-soft"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mb-[15px] flex flex-wrap items-center gap-[11px]">
        <span className="font-mono text-[10.5px] uppercase leading-snug tracking-[0.12em] text-ink-dim">
          {(q.tags || [])
            .map((t) => tagName(t))
            .join(' · ')}
        </span>
        <span className="rounded-full border border-line-strong px-[9px] py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-mid">
          {q.difficulty}
        </span>
      </div>

      <h2 className="mb-5 max-w-[60ch] text-pretty text-stem font-semibold text-ink-bright sm:mb-[26px]">
        <SafeText text={q.stem} />
      </h2>

      {/* `auto-rows-fr` makes all four rows the height of the tallest, so the four cards are
          one uniform block rather than four differently-sized boxes. */}
      <m.div
        key={q.id}
        className="grid auto-rows-fr gap-2.5"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {q.options.map((text, k) => (
          <m.div key={k} variants={staggerItem} className="h-full">
            <OptionCard
              index={k}
              text={text}
              state={optionState(k)}
              onPick={() => onPick(k)}
            />
          </m.div>
        ))}
      </m.div>

      {revealed && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mt-5 grid gap-[13px] rounded-card border border-line bg-surface-raised px-5 py-[18px]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                'rounded-full px-[11px] py-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-on-accent',
                wasRight ? 'bg-correct' : 'bg-wrong'
              )}
            >
              {wasRight ? 'Correct' : 'Incorrect'}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
              Why
            </span>
          </div>
          <p className="m-0 max-w-[68ch] text-pretty text-[15px] leading-[1.68] text-ink-mid">
            <SafeText text={q.explanation} />
          </p>
          <div className="text-pretty border-t border-line-soft pt-3 text-xs leading-normal text-ink-dim">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              Source
            </span>
            <SafeText text={q.source} />
          </div>
        </m.div>
      )}

      {(revealed || picked !== null) && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mt-6 sm:border-none sm:bg-transparent sm:p-0">
          <div className={cn(SHELL, 'flex animate-fadeUp items-center gap-3.5 sm:p-0')}>
            <NeutralButton size="lg" className="flex-1 sm:flex-none" onClick={revealed ? onAdvance : onReveal}>
              {revealed ? (last ? 'See results' : 'Next question') : 'Check answer'}
            </NeutralButton>
            <span className="hidden font-mono text-[11.5px] text-ink-faint sm:inline">enter</span>
          </div>
        </div>
      )}

      {!revealed && (
        <div className="mt-[26px] hidden font-mono text-[11.5px] leading-relaxed text-ink-faint sm:block">
          1–4 select · enter confirm · f save
        </div>
      )}
    </div>
  );
}
