#!/usr/bin/env node
// Drop AI tool attribution from a commit message. Refuse it on a pull request.
//
// Cursor, Claude Code, Copilot, and Codex append a trailer or a generator line after the
// message the author wrote. The strings below are the ones those tools actually emit, not
// a guess. A message that only mentions a tool in prose is not attribution. A Co-authored-by
// line for a person is not attribution.
//
// Cursor injects the trailer on `git commit` after the author writes the message, so the
// commit-msg hook deletes that line instead of refusing the commit. `pnpm open-pr` still
// refuses, because that copy is under our control.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Inboxes the vendors put on Co-authored-by trailers. */
const TOOL_EMAIL = [
  /cursoragent@cursor\.com/i,
  /noreply@cursor\.com/i,
  /noreply@anthropic\.com/i,
  /copilot@github\.com/i,
  /codex@openai\.com/i,
  /noreply@openai\.com/i,
  /\+copilot\[bot\]@users\.noreply\.github\.com/i,
  /chatgpt-codex-connector\[bot\]@users\.noreply\.github\.com/i,
];

/**
 * Display names those same trailers use. Claude puts the session model in the name
 * (`Claude Sonnet 5`). Cursor uses `Cursor`. Codex uses `Codex` or `GPT 5.4`.
 */
const TOOL_NAME = [
  /^cursor$/i,
  /^claude(\s|$)/i,
  /^copilot(\[bot\])?$/i,
  /^codex(\s|$)/i,
  /^chatgpt(\s|$)/i,
  /^gemini(\s|$)/i,
  /^gpt[\s.-]?\d/i,
];

const CO_AUTHOR = /^\s*co-authored-by:\s*(.+?)\s*$/i;
const MADE_WITH_TRAILER = /^\s*made-with:\s*cursor\b/i;
const GENERATOR = /^\s*(?:🤖\s*)?(?:generated with|made with)\s+\[?(claude|cursor)\b/i;

function parseCoAuthor(rest) {
  const match = /^(.*?)(?:\s*<([^>]*)>)?\s*$/.exec(rest);
  return { name: (match?.[1] ?? '').trim(), email: (match?.[2] ?? '').trim() };
}

function isToolCoAuthor(name, email) {
  return TOOL_EMAIL.some((pattern) => pattern.test(email)) || TOOL_NAME.some((pattern) => pattern.test(name));
}

function isGeneratorLine(line) {
  return MADE_WITH_TRAILER.test(line) || GENERATOR.test(line) || /^\s*🤖/.test(line);
}

/**
 * Lines in `text` that name a coding tool as author.
 * `aiToolAttributionIn(message)` reads "AI tool attribution in this message".
 */
export function aiToolAttributionIn(text) {
  const hits = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.trim() === '') continue;
    const coAuthor = CO_AUTHOR.exec(line);
    if (coAuthor) {
      const { name, email } = parseCoAuthor(coAuthor[1] ?? '');
      if (isToolCoAuthor(name, email)) hits.push(line.trim());
      continue;
    }
    if (isGeneratorLine(line)) hits.push(line.trim());
  }
  return hits;
}

/**
 * Drop attribution lines and keep the rest, including git `#` comments.
 * `messageWithoutAiToolAttribution(file)` reads "the message without AI tool attribution".
 */
export function messageWithoutAiToolAttribution(text) {
  const kept = [];
  const dropped = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) {
      kept.push(raw);
      continue;
    }
    if (raw.trim() !== '' && aiToolAttributionIn(raw).length > 0) {
      dropped.push(raw.trim());
      continue;
    }
    kept.push(raw);
  }
  return { text: kept.join('\n'), dropped };
}

function commitSubjectRemains(text) {
  return text.split(/\r?\n/).some((line) => !/^\s*#/.test(line) && line.trim() !== '');
}

/** Title and body `pnpm open-pr` will send, joined for one scan. */
export function openPrCopy(args, readFile = readFileSync) {
  const parts = [];
  for (const value of flagValues(args, ['--title', '-t'])) parts.push(value);
  for (const value of flagValues(args, ['--body', '-b'])) parts.push(value);
  for (const file of flagValues(args, ['--body-file', '-F'])) {
    parts.push(readFile(file, 'utf8'));
  }
  return parts.join('\n');
}

function flagValues(args, flags) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    for (const flag of flags) {
      if (arg === flag) {
        values.push(args[i + 1] ?? '');
      } else if (arg.startsWith(`${flag}=`)) {
        values.push(arg.slice(flag.length + 1));
      }
    }
  }
  return values;
}

export function refuseAiToolAttributionMessage(hits) {
  return [
    'Blocked: this message names a coding tool as author.',
    '',
    "Write the title and body as the repo's own. Do not add a Co-authored-by trailer",
    'for a tool, a Made-with trailer, or a Generated-with line.',
    '',
    'The line:',
    ...hits.map((line) => `  ${line}`),
  ].join('\n');
}

function refuse(text) {
  const hits = aiToolAttributionIn(text);
  if (hits.length === 0) return;
  console.error(refuseAiToolAttributionMessage(hits));
  process.exit(1);
}

function stripCommitMsg(path) {
  const original = readFileSync(path, 'utf8');
  const { text, dropped } = messageWithoutAiToolAttribution(original);
  if (dropped.length > 0) {
    console.error(
      `commit-msg: dropped AI tool attribution:\n${dropped.map((line) => `  ${line}`).join('\n')}`,
    );
    writeFileSync(path, text);
  }
  if (!commitSubjectRemains(text)) {
    console.error('commit-msg: nothing left after dropping AI tool attribution.');
    process.exit(1);
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--commit-msg' && argv[1]) {
    stripCommitMsg(argv[1]);
    process.exit(0);
  }
  if (argv[0] === '--file' && argv[1]) {
    refuse(readFileSync(argv[1], 'utf8'));
    process.exit(0);
  }
  console.error('usage: refuse-ai-attribution.mjs --commit-msg <file> | --file <file>');
  process.exit(2);
}
