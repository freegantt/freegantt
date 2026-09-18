#!/usr/bin/env node
// CLAUDE.md, "Hard rules": comment prose is ASD-STE100 Simplified Technical English. One of its
// rules is a sentence ceiling — 20 words for an instruction, 25 for a description. This script
// enforces the 25-word ceiling over comment prose, so the rule holds by CI and not by eye.
//
// Why it exists. The pass has been run by hand twice (R6's ST1, then #164). It drifted back both
// times. A standard nothing measures is a standard nobody keeps.
//
// Scope is a declared list, not all of `src/`. `SCOPED_FILES` below holds every file a sentence
// pass has actually been run over. The rest of `src/` has never had one. Adding a file to the list
// is how the scope grows: run the pass over the file first, then add its path. That is the only way
// in, on purpose.
//
// The scope stays a list because the rest of the tree is a backlog, not a near miss. Measured over
// all of `src/` in September 2026 (#163 loose end (a)): 679 sentences over the ceiling, in 130 of
// 246 files, 562 of them outside test files. Widening the gate would turn one gate into that
// backlog, and a gate nobody can pass is a gate somebody turns off. So a green run here means the
// declared files pass, never that the tree passes, and the run says so in as many words. Re-measure
// with `for f in $(find src -name '*.ts'); do node scripts/check-sentence-length.mjs $f; done`.
//
// What it reads. Comment prose in three places: a comment line that starts with `//`, a comment
// that follows code on the same line, and a block comment (`/* */` and `/** */`), continuation
// lines included. It walks each line rather than matching one, so a `//` inside a string literal —
// a URL, most often — stays code. It reads no string literal and no Markdown file.
//
// Counting. One backticked code span counts as one word. That is the generous reading, and it is
// deliberate. A pair like the move events reads as one idea, and a rule that punished precise
// references would push comments toward vaguer prose. Comment lines that touch join into one
// paragraph, so a wrapped sentence counts once. A trailing comment starts its own paragraph: it
// sits beside its code, not under the prose above it.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every file a sentence pass has been run over. See the header for how this list grows. */
const SCOPED_FILES = [
  'src/view/capability.ts',
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
  'src/view/mount-layer.ts',
  'src/view/plugin-ports.ts',
  'src/view/plugin-registrations.ts',
  'src/view/entry-selection.ts',
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

/** Where the next comment on `line` opens, at or after `from`, or `-1`. It walks the line and
 *  tracks the open quote, so a `//` inside a string literal is code and not prose. */
function commentStart(line, from) {
  let quote;
  for (let i = from; i < line.length; i++) {
    const character = line[i];
    if (quote !== undefined) {
      if (character === '\\') i++;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '/' && (line[i + 1] === '/' || line[i + 1] === '*')) return i;
  }
  return -1;
}

/** The comment prose in one TypeScript source, as `{ line, text, trailing }` per comment line.
 *  `trailing` marks a comment with code before it on its own line — the shape an earlier version of
 *  this script read straight past, so a forty-word sentence after a semicolon passed (#163). */
function commentLines(source) {
  const lines = source.split('\n');
  const found = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let position = 0;
    for (;;) {
      if (inBlock) {
        const end = line.indexOf('*/', position);
        const body = end === -1 ? line.slice(position) : line.slice(position, end);
        found.push({ line: i + 1, text: stripBlockMarkers(body), trailing: false });
        if (end === -1) break;
        inBlock = false;
        position = end + 2;
        continue;
      }
      const open = commentStart(line, position);
      if (open === -1) break;
      const trailing = line.slice(0, open).trim() !== '';
      if (line[open + 1] === '/') {
        found.push({ line: i + 1, text: line.slice(open + 2).trim(), trailing });
        break;
      }
      const end = line.indexOf('*/', open + 2);
      const body = end === -1 ? line.slice(open + 2) : line.slice(open + 2, end);
      found.push({ line: i + 1, text: stripBlockMarkers(body), trailing });
      if (end === -1) {
        inBlock = true;
        break;
      }
      position = end + 2;
    }
  }
  return found;
}

/** Joins comment lines that touch into one paragraph, so a sentence wrapped over three lines is
 *  counted once. A blank comment line ends a paragraph, the way it does in prose. A trailing comment
 *  opens a paragraph of its own: it belongs to the code on its line, not to the prose above it. */
function paragraphs(lines) {
  const groups = [];
  let current;
  for (const { line, text, trailing } of lines) {
    if (text === '') {
      current = undefined;
      continue;
    }
    if (trailing) {
      current = { line, lastLine: line, text };
      groups.push(current);
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

/** How many TypeScript files `src/` holds, so the clean line can name the scope against the tree
 *  rather than against itself. */
function countSourceFiles() {
  let total = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts')) total++;
    }
  };
  walk(path.join(root, 'src'));
  return total;
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

// The run says what it covered, so nobody reads a green gate as "the whole tree passes". Only a
// default run makes that claim: a run over one named file covers that file.
if (argument === undefined) {
  console.log(
    `sentence-length: clean (${files.length} declared files of ${countSourceFiles()} in src/ — ` +
      "the declared scope, not the whole tree; see this script's header).",
  );
} else {
  console.log(`sentence-length: clean (${files.length} file).`);
}
