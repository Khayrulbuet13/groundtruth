#!/usr/bin/env node
/**
 * Build-time question linter. Exits non-zero on failing gates.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content/questions');

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function stemKeywords(stem) {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
}

function lintQuestion(q, ctx, { strict = false } = {}) {
  const errors = [];
  const counts = q.options.map(wordCount);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const spread = Math.max(...counts.map((c) => Math.abs(c - mean) / mean));
  if (strict && spread > 0.2) {
    errors.push(
      `${ctx}: option word-count spread ${(spread * 100).toFixed(0)}% exceeds ±20% (counts: ${counts.join(', ')})`
    );
  }

  const lowerOpts = q.options.map((o) => o.toLowerCase());
  const dupPairs = [];
  for (let i = 0; i < lowerOpts.length; i++) {
    for (let j = i + 1; j < lowerOpts.length; j++) {
      if (lowerOpts[i] === lowerOpts[j]) dupPairs.push([i, j]);
    }
  }
  if (dupPairs.length) {
    errors.push(`${ctx}: duplicate options at indices ${dupPairs.map(([a, b]) => `${a}/${b}`).join(', ')}`);
  }

  if (strict) {
    const keywords = stemKeywords(q.stem);
    const correct = q.options[q.answer_idx].toLowerCase();
    for (const kw of keywords) {
      const inCorrect = correct.includes(kw);
      const inOthers = q.options.some(
        (o, i) => i !== q.answer_idx && o.toLowerCase().includes(kw)
      );
      if (inCorrect && !inOthers) {
        errors.push(`${ctx}: stem keyword "${kw}" appears only in the correct option`);
        break;
      }
    }
  }

  return errors;
}

function lintDistribution(allQuestions) {
  const errors = [];
  const buckets = [0, 0, 0, 0];
  for (const q of allQuestions) buckets[q.answer_idx]++;
  const n = allQuestions.length;
  if (n < 100) return errors;
  const expected = n / 4;
  const maxDev = Math.max(...buckets.map((c) => Math.abs(c - expected) / expected));
  if (maxDev > 0.02) {
    errors.push(
      `bank: answer_idx distribution skewed [${buckets.join(', ')}] (max deviation ${(maxDev * 100).toFixed(1)}%, limit 2%)`
    );
  }
  return errors;
}

export function lintQuestions(questions, prefix = 'question', { strict = false } = {}) {
  const errors = [];
  questions.forEach((q, i) => {
    const label = q.id || q.legacy_id || i + 1;
    errors.push(...lintQuestion(q, `${prefix} ${i + 1} (${label})`, { strict }));
  });
  errors.push(...lintDistribution(questions));
  return errors;
}

export function lintContentDir(dir = contentDir, opts = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const all = [];
  const errors = [];
  for (const file of files) {
    const deck = yaml.parse(readFileSync(join(dir, file), 'utf8'));
    for (const q of deck.questions) all.push(q);
  }
  errors.push(...lintQuestions(all, 'question', opts));
  return errors;
}

if (process.argv[1]?.endsWith('lint-questions.mjs')) {
  const strict = process.argv.includes('--strict');
  const errors = lintContentDir(undefined, { strict });
  if (errors.length) {
    console.error('Question linter failed:\n' + errors.map((e) => `  • ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('Question linter passed.');
}
