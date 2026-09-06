import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateDeck } from '@schema/validate.js';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { assignDeckQuestionIds, deleteDeck, newId, saveDeck } from '../lib/db';
import { useData } from '../lib/DataContext';
import { ROUTES } from '../lib/routes';
import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';
import { Checkbox, Eyebrow, FIELD, GhostButton, PrimaryButton } from '../components/controls';

const LLM_PROMPT = `Generate a practice quiz deck as JSON matching this schema:
- schema_version: 1
- deck_name: string
- questions: array of { tags: string[], difficulty (easy|medium|hard), stem, options[4], answer_idx (0-3), explanation, source, figure_url: null }
Rules: tags is a flat list (e.g. ["cnn", "conv"] or ["det", "anchor"]), 4 options per question, answer_idx 0-3.
Output valid JSON only.`;

const CONSENT =
  'Your deck stays in your browser. We never run your questions on our servers. We do keep one copy of the file you upload. A human reviews it, and questions good enough to help others get added to the public bank; the rest are deleted. Deleting your account removes your name from the copy, but not the copy itself.';

export function DeckScreen() {
  const { user } = useAuth();
  const { customDecks, deckTagCounts, reloadDecks } = useData();
  const navigate = useNavigate();
  const [paste, setPaste] = useState('');
  const [retain, setRetain] = useState(true);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    reloadDecks();
  }, [reloadDecks]);

  const handleRaw = useCallback(
    async (raw) => {
      setErrors([]);
      setMessage('');
      if (raw.length > 1024 * 1024) {
        setErrors(['Deck exceeds 1 MB limit']);
        return;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        setErrors(['Invalid JSON: check brackets and quotes']);
        return;
      }
      const result = validateDeck(data);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      const deckId = newId();
      const deck = {
        id: deckId,
        name: result.data.deck_name,
        schema_version: 1,
        questions: assignDeckQuestionIds(deckId, result.data.questions),
        size_bytes: raw.length,
        created_at: new Date().toISOString(),
      };
      await saveDeck(deck);
      if (user && retain) {
        try {
          await api.contribute({ ...data, retain: true });
        } catch {
          setMessage(`Imported "${deck.name}" locally; archive upload failed`);
          setPaste('');
          reloadDecks();
          return;
        }
      }
      setPaste('');
      setMessage(`Imported "${deck.name}" (${deck.questions.length} questions)`);
      reloadDecks();
    },
    [user, retain, reloadDecks]
  );

  const onFile = (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setErrors(['File exceeds 1 MB limit']);
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      handleRaw(reader.result);
      input.value = '';
    };
    reader.onerror = () => {
      setErrors(['Could not read file']);
      input.value = '';
    };
    reader.readAsText(file);
  };

  const remove = async (id) => {
    await deleteDeck(id);
    reloadDecks();
  };

  /** Straight into a run over this deck's tags — the deck list used to be a dead end. */
  const practice = (deck) => {
    const tags = deckTagCounts(deck).map((t) => t.id);
    if (!tags.length) return;
    navigate(
      `${ROUTES.quiz}?tags=${encodeURIComponent(tags.join(','))}&count=${deck.questions?.length || 10}`
    );
  };

  return (
    <div className={cn(SHELL, 'pb-16 pt-8')}>
      <Eyebrow className="mb-4">Your decks</Eyebrow>
      <p className="mb-4 text-sm text-ink-mid">
        Decks live only in this browser unless you log in and opt in below.{' '}
        <a href="/example-deck.json" download className="text-accent">
          Download example deck
        </a>
      </p>

      {/* The native checkbox looked nothing like the custom one used on the topic picker.
          The real input stays for accessibility and form semantics; the visual is the
          shared Checkbox. */}
      {user ? (
        <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface-raised p-4 text-sm text-ink-mid">
          <input
            type="checkbox"
            checked={retain}
            onChange={(e) => setRetain(e.target.checked)}
            className="sr-only"
          />
          <span className="mt-0.5">
            <Checkbox checked={retain} />
          </span>
          <span>{CONSENT}</span>
        </label>
      ) : (
        <p className="mb-6 text-sm text-ink-dim">
          Log in to optionally share a copy for curation. Without login, imports stay local only.
        </p>
      )}

      <div className="mb-4">
        <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-card border border-line-strong bg-transparent px-[18px] text-sm font-medium text-ink-mid hover:border-line-hover hover:text-ink-bright">
          Choose deck file
          <input type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
        </label>
      </div>

      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder="Paste deck JSON here…"
        rows={8}
        className={cn(FIELD, 'mb-3 font-mono text-xs')}
      />

      {errors.length > 0 && (
        <ul className="mb-4 list-inside list-disc text-sm text-wrong">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      {message && <p className="mb-4 text-sm text-correct">{message}</p>}

      <PrimaryButton
        className="mb-8"
        disabled={!paste.trim()}
        onClick={() => handleRaw(paste)}
      >
        Validate &amp; import
      </PrimaryButton>

      <details className="mb-8 rounded-card border border-line bg-surface-raised p-4">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-ink">LLM prompt for deck generation</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-ink-mid">{LLM_PROMPT}</pre>
      </details>

      <div className="grid gap-2">
        {customDecks.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-raised px-4 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{d.name}</div>
              <div className="text-xs text-ink-dim">{d.questions?.length ?? '?'} questions · local</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PrimaryButton size="sm" onClick={() => practice(d)}>
                Practice
              </PrimaryButton>
              <GhostButton size="sm" onClick={() => remove(d.id)}>
                Remove
              </GhostButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
