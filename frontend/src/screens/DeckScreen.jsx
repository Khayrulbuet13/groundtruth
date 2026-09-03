import { useCallback, useEffect, useState } from 'react';
import { validateDeck } from '@schema/validate.js';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { assignDeckQuestionIds, deleteDeck, newId, saveDeck } from '../lib/db';
import { useData } from '../lib/DataContext';
import { Eyebrow, GhostButton, PrimaryButton } from '../components/controls';

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
  const { customDecks, reloadDecks } = useData();
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

  return (
    <div className="mx-auto max-w-shell px-4 pb-16 pt-8 sm:px-7 lg:max-w-[720px]">
      <Eyebrow className="mb-4">Your decks</Eyebrow>
      <p className="mb-4 text-sm text-ink-mid">
        Decks live only in this browser unless you log in and opt in below.{' '}
        <a href="/example-deck.json" download className="text-accent">
          Download example deck
        </a>
      </p>

      {user ? (
        <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface-raised p-4 text-sm text-ink-mid">
          <input
            type="checkbox"
            checked={retain}
            onChange={(e) => setRetain(e.target.checked)}
            className="mt-1"
          />
          <span>{CONSENT}</span>
        </label>
      ) : (
        <p className="mb-6 text-sm text-ink-dim">
          Log in to optionally share a copy for curation. Without login, imports stay local only.
        </p>
      )}

      <div className="mb-4">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-card border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink-mid hover:border-line-hover">
          Choose deck file
          <input type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
        </label>
      </div>

      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder="Paste deck JSON here…"
        rows={8}
        className="mb-3 w-full rounded-card border border-line-strong bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
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
        className="mb-8 min-h-[44px]"
        disabled={!paste.trim()}
        onClick={() => handleRaw(paste)}
      >
        Validate &amp; import
      </PrimaryButton>

      <details className="mb-8 rounded-card border border-line bg-surface-raised p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">LLM prompt for deck generation</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-ink-mid">{LLM_PROMPT}</pre>
      </details>

      <div className="grid gap-2">
        {customDecks.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-raised px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-ink">{d.name}</div>
              <div className="text-xs text-ink-dim">{d.questions?.length ?? '?'} questions · local</div>
            </div>
            <GhostButton onClick={() => remove(d.id)}>Remove</GhostButton>
          </div>
        ))}
      </div>
    </div>
  );
}
