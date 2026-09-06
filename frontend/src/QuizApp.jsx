import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { buildQuiz } from './lib/quiz';
import { useQuizSession } from './lib/useQuizSession';
import { useData } from './lib/DataContext';
import { completeRun, getAllRunsLocal } from './lib/sync';
import { buildStats } from './lib/stats';
import { newId } from './lib/db';
import { cn } from './lib/utils';
import { ROUTES } from './lib/routes';
import { pageVariants } from './lib/motion';
import { AppHeader, HeaderLink } from './components/AppHeader';
import { LoginControl } from './components/LoginControl';
import { ThemeToggle } from './components/ThemeToggle';
import { BottomNav } from './components/BottomNav';
import { TopicPicker } from './screens/TopicPicker';
import { QuizScreen } from './screens/QuizScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { DeckScreen } from './screens/DeckScreen';

const INITIAL_CONFIG = {
  selected: {},
  count: 10,
  custom: 15,
  difficulty: 'Mixed',
  timed: false,
};

/** Everything a run needs to answer, resume, and score itself — no dependency on the picker's config. */
const emptyRun = {
  runId: null,
  seed: null,
  quiz: null,
  index: 0,
  picked: null,
  revealed: false,
  answers: [],
  elapsed: 0,
  questionStartedAt: null,
  tagIds: [],
  difficulty: 'Mixed',
  timed: false,
};

/** localStorage/`saved` shape for a paused run — no question objects duplicated beyond the quiz itself. */
function toSession(r) {
  return {
    runId: r.runId,
    seed: r.seed,
    quiz: r.quiz,
    index: r.index,
    answers: r.answers,
    elapsed: r.elapsed,
    tagIds: r.tagIds,
    difficulty: r.difficulty,
    timed: r.timed,
  };
}

function PageTransition({ children }) {
  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </m.div>
  );
}

/** Renders the active quiz, or resolves a `/quiz` visit that isn't mid-session: a `?tags=` deep link
 * starts a fresh drill, a saved session resumes, otherwise there's nothing to do here. */
function QuizRoute({ run, saved, startQuiz, resume, pick, reveal, advance }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const attempted = useRef(false);

  useEffect(() => {
    if (run.quiz || attempted.current) return;
    attempted.current = true;
    const tags = searchParams.get('tags');
    if (tags) {
      startQuiz(
        {
          tagIds: tags.split(',').filter(Boolean),
          difficulty: searchParams.get('difficulty') || 'Mixed',
          count: Number(searchParams.get('count')) || 10,
          timed: searchParams.get('timed') === '1',
        },
        { replace: true }
      );
    } else if (saved) {
      resume();
    } else {
      navigate(ROUTES.home, { replace: true });
    }
    // Deep-link/resume resolution should run once on mount, not re-fire as `run` changes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!run.quiz) return null;

  return (
    <QuizScreen
      quiz={run.quiz}
      index={run.index}
      picked={run.picked}
      revealed={run.revealed}
      elapsed={run.elapsed}
      timed={run.timed}
      onPick={pick}
      onReveal={reveal}
      onAdvance={advance}
    />
  );
}

/** A hard refresh on `/results` has no in-memory result to show — bounce home rather than render blank. */
function ResultsRoute({ result, retryWeak, onNewQuiz }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!result) navigate(ROUTES.home, { replace: true });
  }, [result, navigate]);

  if (!result) return null;

  return (
    <ResultsScreen
      quiz={result.quiz}
      answers={result.answers}
      difficulty={result.difficulty}
      timed={result.timed}
      elapsed={result.elapsed}
      onRetryWeak={retryWeak}
      onNewQuiz={onNewQuiz}
    />
  );
}

export default function QuizApp() {
  const { topics, index, loading, error, drawFromTags, questionLookupSync, tagName } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [run, setRun] = useState(emptyRun);
  const [result, setResult] = useState(null);
  const [startError, setStartError] = useState(null);
  const [stats, setStats] = useState(null);
  const { saved, save, clear, setSaved } = useQuizSession();

  const runRef = useRef(run);
  runRef.current = run;

  const refreshStats = useCallback(async () => {
    const runs = await getAllRunsLocal();
    setStats(buildStats(runs, questionLookupSync, tagName));
  }, [questionLookupSync, tagName]);

  useEffect(() => {
    if (location.pathname === ROUTES.progress) refreshStats();
  }, [location.pathname, refreshStats]);

  const persist = useCallback((r) => save(toSession(r)), [save]);

  useEffect(() => {
    if (location.pathname !== ROUTES.quiz || !run.timed) return;
    const id = setInterval(() => setRun((r) => ({ ...r, elapsed: r.elapsed + 1 })), 1000);
    return () => clearInterval(id);
  }, [location.pathname, run.timed]);

  const startQuiz = async ({ tagIds, difficulty, count, timed }, { replace = false } = {}) => {
    setStartError(null);
    let questions;
    try {
      questions = await drawFromTags(tagIds, difficulty);
    } catch {
      setStartError('Could not load questions. Check your connection and try again.');
      return;
    }
    const seed = Date.now();
    const quiz = buildQuiz(questions, { tagIds, difficulty, count, seed });
    if (!quiz.length) {
      setStartError('No questions match that selection. Try a different difficulty or tags.');
      return;
    }
    const runId = newId();
    const next = {
      ...emptyRun,
      runId,
      seed,
      quiz,
      tagIds,
      difficulty,
      timed,
      questionStartedAt: Date.now(),
    };
    setRun(next);
    setSaved(null);
    persist(next);
    navigate(ROUTES.quiz, { replace });
  };

  const pick = (k) => setRun((r) => (r.revealed ? r : { ...r, picked: k }));

  const reveal = () => {
    const r = runRef.current;
    const q = r.quiz[r.index];
    const timeSpentMs = r.questionStartedAt ? Date.now() - r.questionStartedAt : 0;
    const next = {
      ...r,
      revealed: true,
      answers: [
        ...r.answers,
        {
          questionId: q.id,
          tags: q.tags || [],
          picked: r.picked,
          correct: r.picked === q.answer,
          timeSpentMs,
        },
      ],
    };
    setRun(next);
    persist(next);
  };

  const finishRun = async (finalRun) => {
    const attempts = finalRun.quiz.map((q, i) => {
      const a = finalRun.answers[i];
      return {
        question_id: q.id,
        tags: q.tags || [],
        picked_idx: a?.picked ?? null,
        is_correct: !!a?.correct,
        time_spent_ms: a?.timeSpentMs ?? 0,
      };
    });
    const score = attempts.filter((a) => a.is_correct).length;
    await completeRun({
      id: finalRun.runId,
      config: {
        difficulty: finalRun.difficulty,
        timed: finalRun.timed,
        tagIds: finalRun.tagIds,
        seed: finalRun.seed,
      },
      attempts,
      score,
      total: attempts.length,
      started_at: new Date(finalRun.seed).toISOString(),
      completed_at: new Date().toISOString(),
    });
  };

  /** Side effects (persist a finished run, navigate) live here, outside the `setRun` updater, so
   * StrictMode's double-invoke of updaters can't double-submit a run or double-navigate. */
  const advance = () => {
    const r = runRef.current;
    if (r.index + 1 >= r.quiz.length) {
      clear();
      setRun(emptyRun);
      setResult({ quiz: r.quiz, answers: r.answers, difficulty: r.difficulty, timed: r.timed, elapsed: r.elapsed });
      finishRun(r);
      navigate(ROUTES.results);
      return;
    }
    const next = {
      ...r,
      index: r.index + 1,
      picked: null,
      revealed: false,
      questionStartedAt: Date.now(),
    };
    setRun(next);
    persist(next);
  };

  const saveExit = () => {
    const r = runRef.current;
    if (!r.quiz) {
      navigate(ROUTES.home);
      return;
    }
    persist(r);
    setSaved(toSession(r));
    setRun(emptyRun);
    navigate(ROUTES.home);
  };

  const resume = () => {
    if (!saved) return;
    const answers = saved.answers || [];
    // A save that happened right after reveal (before advance) has one more answer than `index` —
    // restore that reveal instead of re-asking the same question.
    const currentAnswer = answers.length > saved.index ? answers[saved.index] : null;
    setRun({
      runId: saved.runId,
      seed: saved.seed,
      quiz: saved.quiz,
      index: saved.index,
      answers,
      elapsed: saved.elapsed || 0,
      picked: currentAnswer ? currentAnswer.picked : null,
      revealed: !!currentAnswer,
      questionStartedAt: Date.now(),
      tagIds: saved.tagIds || [],
      difficulty: saved.difficulty || 'Mixed',
      timed: !!saved.timed,
    });
    setSaved(null);
    navigate(ROUTES.quiz);
  };

  const goHome = () => navigate(ROUTES.home);

  const retryWeak = (weak) => {
    if (!weak.length || !result) return;
    startQuiz({
      tagIds: weak,
      difficulty: result.difficulty,
      count: Math.min(result.answers.length || 10, 50),
      timed: result.timed,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface text-ink-dim">
        Loading…
      </div>
    );
  }

  if (error || !index) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface text-wrong">
        <span>{error || 'Catalog unavailable'}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-card border border-line-strong bg-transparent px-4 py-2 text-sm text-ink-mid hover:text-ink"
        >
          Reload
        </button>
      </div>
    );
  }

  const onQuiz = location.pathname === ROUTES.quiz;
  const showBottomNav = !onQuiz;

  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader onHome={onQuiz ? saveExit : goHome} trailing={<><ThemeToggle /><LoginControl /></>}>
        {onQuiz && run.quiz ? (
          // Shortened on narrow phones — at 320px the full label wrapped and doubled the
          // header's height.
          <HeaderLink onClick={saveExit}>
            <span className="sm:hidden">Exit</span>
            <span className="hidden sm:inline">Save &amp; exit</span>
          </HeaderLink>
        ) : (
          <>
            <HeaderLink hideOnMobile onClick={() => navigate(ROUTES.progress)}>
              Progress
            </HeaderLink>
            <HeaderLink hideOnMobile onClick={() => navigate(ROUTES.decks)}>
              Decks
            </HeaderLink>
          </>
        )}
      </AppHeader>

      <main className={cn(showBottomNav && 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0')}>
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route
              path={ROUTES.home}
              element={
                <PageTransition>
                  <TopicPicker
                    topics={topics}
                    index={index}
                    config={config}
                    setConfig={setConfig}
                    onStart={startQuiz}
                    startError={startError}
                    resumable={saved}
                    onResume={resume}
                    onDiscardResume={clear}
                  />
                </PageTransition>
              }
            />
            <Route
              path={ROUTES.quiz}
              element={
                <PageTransition>
                  <QuizRoute
                    run={run}
                    saved={saved}
                    startQuiz={startQuiz}
                    resume={resume}
                    pick={pick}
                    reveal={reveal}
                    advance={advance}
                  />
                </PageTransition>
              }
            />
            <Route
              path={ROUTES.results}
              element={
                <PageTransition>
                  <ResultsRoute result={result} retryWeak={retryWeak} onNewQuiz={goHome} />
                </PageTransition>
              }
            />
            <Route
              path={ROUTES.progress}
              element={
                <PageTransition>
                  <ProgressScreen stats={stats} />
                </PageTransition>
              }
            />
            <Route
              path={ROUTES.profile}
              element={
                <PageTransition>
                  <ProfileScreen />
                </PageTransition>
              }
            />
            <Route
              path={ROUTES.decks}
              element={
                <PageTransition>
                  <DeckScreen />
                </PageTransition>
              }
            />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      {showBottomNav && <BottomNav />}
    </div>
  );
}
