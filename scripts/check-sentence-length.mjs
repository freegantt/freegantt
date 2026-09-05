#!/usr/bin/env node
// CLAUDE.md, "Hard rules": comment prose is ASD-STE100 Simplified Technical English. One of its
// rules is a sentence ceiling — 20 words for an instruction, 25 for a description. This script
// enforces the 25-word ceiling over comment prose, so the rule holds by CI and not by eye.
//
// Why it exists. The pass has been run by hand twice (R6's ST1, then #164). It drifted back both
// times. A standard nothing measures is a standard nobody keeps.
//
// Scope is a declared list, not all of `src/`. `SCOPED_FILES` below holds every file a sentence
// pass has actually been run over. The rest of `src/` has never had one. Widening the scope here
// would turn one gate into a backlog. Adding a file to the list is how the scope grows: run the
// pass over the file first, then add its path. That is the only way in, on purpose.
//
// Counting. One backticked code span counts as one word. That is the generous reading, and it is
// deliberate. A pair like the move events reads as one idea, and a rule that punished precise
// references would push comments toward vaguer prose.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every file a sentence pass has been run over. See the header for how this list grows. */
const SCOPED_FILES = [
  'src/api/plugin.ts',
  'src/extensions/features/context-menu.ts',
  'src/extensions/features/date-input.ts',
  'src/extensions/features/inline-editing.ts',
  'src/extensions/features/menu-view.ts',
  'src/extensions/features/tooltips.ts',
  'src/render/dom/dom-contract.ts',
  'src/view/gantt-dom.ts',
  'src/view/frame-settings.ts',
  'src/view/gantt-shell.ts',
  'src/view/plugin-ports.ts',
  'src/view/row-layer.ts',
];

/** A description may run to 25 words (CLAUDE.md). An instruction may run to 20. No rule tells one
 *  from the other by machine, so this gate enforces the looser of the two. */
const MAX_WORDS = 25;

/** A period here ends a word, not a sentence. */
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'cf.', 'vs.', 'approx.', 'no.', 'fig.']);

/** Stands in for one backticked code span while sentences are split and words are counted. It holds
 *  no space, no period and no backtick, so neither pass can see inside a span. */
const CODE_SPAN_TOKEN = 'CODE';

/** Replaces every backticked code span with one token. A span may not hold a newline, which stops
 *  an unbalanced backtick from swallowing the rest of the file. */
function maskCodeSpans(text) {
  return text.replace(/`+[^`\n]*`+/g, CODE_SPAN_TOKEN);
}

function stripBlockMarkers(text) {
  return text
    .replace(/^\s*\*+/, '')
    .replace(/\*+\/?\s*$/, '')
    .trim();
}

/** The comment prose in one TypeScript source, as `{ line, text }` per comment line. A string
 *  literal holding a comment marker is the one false positive this misses. None exists in scope. */
function commentLines(source) {
  const lines = source.split('\n');
  const found = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (inBlock) {
      const end = line.indexOf('*/');
      found.push({ line: i + 1, text: stripBlockMarkers(end === -1 ? line : line.slice(0, end)) });
      if (end !== -1) inBlock = false;
      continue;
    }
    if (line.startsWith('//')) {
      found.push({ line: i + 1, text: line.slice(2).trim() });
      continue;
    }
    const open = line.indexOf('/*');
    if (open === -1) continue;
    const end = line.indexOf('*/', open + 2);
    const body = end === -1 ? line.slice(open + 2) : line.slice(open + 2, end);
    found.push({ line: i + 1, text: stripBlockMarkers(body) });
    if (end === -1) inBlock = true;
  }
  return found;
}

/** Joins comment lines that touch into one paragraph, so a sentence wrapped over three lines is
 *  counted once. A blank comment line ends a paragraph, the way it does in prose. */
function paragraphs(lines) {
  const groups = [];
  let current;
  for (const { line, text } of lines) {
    if (text === '') {
      current = undefined;
      continue;
    }
    if (current !== undefined && line === current.lastLine + 1) {
      current.text += ` ${text}`;
      current.lastLine = line;
      continue;
    }
    current = { line, lastLine: line, text };
    groups.push(current);
  }
  return groups;
}

function endsInAbbreviation(candidate) {
  const lastWord = candidate.trim().split(/\s+/).at(-1) ?? '';
  return ABBREVIATIONS.has(lastWord.toLowerCase());
}

/** Splits masked prose into sentences at a period, an exclamation mark or a question mark followed
 *  by a space. An abbreviation keeps its sentence. A period inside a code span is already masked. */
function sentences(masked) {
  const parts = [];
  const boundary = /[.!?]["')\]]*\s+/g;
  let start = 0;
  let match;
  while ((match = boundary.exec(masked)) !== null) {
    const end = match.index + match[0].length;
    const candidate = masked.slice(start, end);
    if (endsInAbbreviation(candidate)) continue;
    parts.push(candidate);
    start = end;
  }
  if (start < masked.length) parts.push(masked.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function wordCount(sentence) {
  return sentence.split(/\s+/).filter((word) => word !== '').length;
}

function breachesIn(relativePath) {
  const source = readFileSync(path.join(root, relativePath), 'utf8');
  const breaches = [];
  for (const paragraph of paragraphs(commentLines(source))) {
    for (const sentence of sentences(maskCodeSpans(paragraph.text))) {
      const words = wordCount(sentence);
      if (words > MAX_WORDS) breaches.push({ line: paragraph.line, words, sentence });
    }
  }
  return breaches;
}

const argument = process.argv[2];
const files = argument === undefined ? SCOPED_FILES : [path.relative(root, path.resolve(argument))];

let total = 0;
for (const file of files) {
  for (const breach of breachesIn(file)) {
    total++;
    console.error(`${file}:${breach.line}: ${breach.words} words (ceiling ${MAX_WORDS})`);
    console.error(`    ${breach.sentence.replaceAll(CODE_SPAN_TOKEN, 'CODE')}`);
  }
}

if (total > 0) {
  console.error(`\nsentence-length: ${total} sentence(s) over the ${MAX_WORDS}-word ceiling.`);
  console.error('Split each one. Most split at an em-dash the sentence already carries.');
  process.exit(1);
}

console.log(`sentence-length: clean (${files.length} files in scope).`);
