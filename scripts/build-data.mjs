#!/usr/bin/env node
/**
 * YAML content -> chunked /data/index.json + /data/t/{tag}/{n}.json
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import {
  validateBankDeck,
  flattenTagIds,
  findGlobalDuplicateIds,
} from '../schema/validate.js';
import { lintQuestions } from './lint-questions.mjs';

const CHUNK_SIZE = 300;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tagsYaml = yaml.parse(readFileSync(join(root, 'content/tags.yaml'), 'utf8'));
const knownTags = flattenTagIds(tagsYaml);
const contentDir = join(root, 'content/questions');
const outDir = join(root, 'frontend/public/data');
const tagOutDir = join(outDir, 't');

rmSync(tagOutDir, { recursive: true, force: true });
mkdirSync(tagOutDir, { recursive: true });

const allQuestions = [];
const decks = [];

const files = readdirSync(contentDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
for (const file of files) {
  const raw = yaml.parse(readFileSync(join(contentDir, file), 'utf8'));
  const validated = validateBankDeck(raw, { knownTags });
  if (!validated.ok) {
    console.error(`Invalid deck ${file}:\n${validated.errors.map((e) => `  • ${e}`).join('\n')}`);
    process.exit(1);
  }
  decks.push(validated.data);
  for (const q of validated.data.questions) {
    allQuestions.push({
      ...q,
      difficulty: q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1),
      answer: q.answer_idx,
    });
  }
}

const globalDupes = findGlobalDuplicateIds(decks);
if (globalDupes.length) {
  console.error('Global ID collisions:\n' + globalDupes.map((e) => `  • ${e}`).join('\n'));
  process.exit(1);
}

const lintErrors = lintQuestions(allQuestions, 'question', {
  strict: process.env.STRICT_LINT === '1',
});
if (lintErrors.length) {
  console.error('Question linter failed:\n' + lintErrors.map((e) => `  • ${e}`).join('\n'));
  process.exit(1);
}

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @type {Map<string, typeof allQuestions>} */
const byTag = new Map();
for (const q of allQuestions) {
  for (const tag of q.tags) {
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(q);
  }
}

/** @type {Record<string, { chunks: number, count: number, byDifficulty: Record<string, number> }>} */
const tagMeta = {};

for (const [tag, questions] of byTag.entries()) {
  const numChunks = Math.max(1, Math.ceil(questions.length / CHUNK_SIZE));
  const chunks = Array.from({ length: numChunks }, () => []);
  for (const q of questions) {
    chunks[hashId(q.id) % numChunks].push(q);
  }

  const tagDir = join(tagOutDir, tag);
  mkdirSync(tagDir, { recursive: true });
  for (let i = 0; i < chunks.length; i++) {
    writeFileSync(
      join(tagDir, `${i}.json`),
      JSON.stringify({ tag, chunk: i, questions: chunks[i] }, null, 0)
    );
  }

  const byDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
  for (const q of questions) byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
  tagMeta[tag] = { chunks: numChunks, count: questions.length, byDifficulty };
}

const tags = [];
for (const t of tagsYaml) {
  tags.push({
    id: t.id,
    name: t.name,
    parent: null,
    count: tagMeta[t.id]?.count || 0,
    byDifficulty: tagMeta[t.id]?.byDifficulty || { Easy: 0, Medium: 0, Hard: 0 },
    chunks: tagMeta[t.id]?.chunks || 0,
  });
  for (const s of t.subtopics || []) {
    tags.push({
      id: s.id,
      name: s.name,
      parent: t.id,
      count: tagMeta[s.id]?.count || 0,
      byDifficulty: tagMeta[s.id]?.byDifficulty || { Easy: 0, Medium: 0, Hard: 0 },
      chunks: tagMeta[s.id]?.chunks || 0,
    });
  }
}

const index = {
  version: 2,
  generated_at: new Date().toISOString(),
  total_questions: allQuestions.length,
  chunk_size: CHUNK_SIZE,
  tags,
};

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
console.log(
  `Built ${tags.length} tags, ${allQuestions.length} questions, ${Object.keys(tagMeta).length} tag chunk sets -> frontend/public/data/`
);
