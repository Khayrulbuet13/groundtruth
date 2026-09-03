#!/usr/bin/env node
/**
 * Raw upload curation helper.
 *
 *   node scripts/curate.mjs review          # emit review JSON from raw-uploads/
 *   node scripts/curate.mjs promote <file>  # append approved questions to YAML bank
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import yaml from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'raw-uploads');
const contentDir = join(root, 'content/questions');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function newBankId() {
  const buf = randomBytes(8);
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  for (let i = 0; i < 12; i++) {
    out = ALPHABET[Number(n % 32n)] + out;
    n /= 32n;
  }
  return `q_${out}`;
}

function loadBankNormalized() {
  const stems = new Set();
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    const deck = yaml.parse(readFileSync(join(contentDir, file), 'utf8'));
    for (const q of deck.questions || []) {
      stems.add(normalize(q.stem));
    }
  }
  return stems;
}

function iterRawFiles() {
  if (!existsSync(rawDir)) return [];
  const out = [];
  for (const day of readdirSync(rawDir)) {
    const dayPath = join(rawDir, day);
    if (!day.endsWith('.json') && !day.includes('-')) {
      for (const f of readdirSync(dayPath)) {
        if (f.endsWith('.json')) out.push(join(dayPath, f));
      }
    }
  }
  return out;
}

function reviewMode() {
  const bank = loadBankNormalized();
  const candidates = [];
  for (const path of iterRawFiles()) {
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    for (const q of data.questions || []) {
      const norm = normalize(q.stem);
      if (bank.has(norm)) continue;
      candidates.push({
        source_file: path.replace(root + '/', ''),
        deck_name: data.deck_name,
        tags: q.tags,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        answer_idx: q.answer_idx,
        explanation: q.explanation,
        source: q.source,
      });
    }
  }
  const outPath = join(rawDir, 'review-candidates.json');
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), candidates }, null, 2));
  console.log(`Wrote ${candidates.length} candidates -> ${outPath}`);
}

function promoteMode(file) {
  const approved = JSON.parse(readFileSync(file, 'utf8'));
  const items = Array.isArray(approved) ? approved : approved.candidates || approved.questions || [];
  const byTagFile = {};
  for (const q of items) {
    const tag = q.tags?.[0] || 'misc';
    const fileName = `${tag.split('_')[0]}.yaml`;
    if (!byTagFile[fileName]) byTagFile[fileName] = [];
    byTagFile[fileName].push({
      id: newBankId(),
      tags: q.tags,
      difficulty: String(q.difficulty || 'easy').toLowerCase(),
      stem: q.stem,
      options: q.options,
      answer_idx: q.answer_idx,
      explanation: q.explanation,
      source: q.source,
      figure_url: null,
    });
  }
  for (const [fileName, qs] of Object.entries(byTagFile)) {
    const path = join(contentDir, fileName);
    if (!existsSync(path)) {
      console.warn(`Skip ${fileName} — file not found`);
      continue;
    }
    const deck = yaml.parse(readFileSync(path, 'utf8'));
    deck.questions.push(...qs);
    writeFileSync(path, yaml.stringify(deck));
    console.log(`Appended ${qs.length} questions to ${fileName}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'review') reviewMode();
else if (cmd === 'promote') promoteMode(process.argv[3]);
else {
  console.error('Usage: curate.mjs review | promote <approved.json>');
  process.exit(1);
}
