// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// Cursor, Claude Code, Copilot, and Codex append an author trailer or a generator line after
// the message. The fixtures below are the strings those tools emit, taken from their docs and
// from the trailers they inject on `git commit` / pull request bodies. A hook that does not
// fail these is presumed broken. A message that only names a tool in prose, or a Co-authored-by
// line for a person, must still pass.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiToolAttributionIn,
  messageWithoutAiToolAttribution,
  openPrCopy,
  refuseAiToolAttributionMessage,
} from '../../scripts/refuse-ai-attribution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(root, 'scripts/refuse-ai-attribution.mjs');
const HOOK = '.githooks/commit-msg';

const BLOCKED = [
  'Co-authored-by: Cursor <cursoragent@cursor.com>',
  'Co-authored-by: Cursor <noreply@cursor.com>',
  'Made-with: Cursor',
  'Made with Cursor',
  'Co-Authored-By: Claude <noreply@anthropic.com>',
  'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
  'Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  'Generated with [Claude Code](https://claude.ai/claude-code)',
  'Made with Claude',
  'Co-authored-by: Codex <noreply@openai.com>',
  'Co-Authored-By: Codex <codex@openai.com>',
  'Co-Authored-By: GPT 5.4 <codex@openai.com>',
  'Co-authored-by: Copilot <copilot@github.com>',
];

const ALLOWED = [
  'Wait for the ready gate after a draft-time skip in pr-wait',
  'Co-authored-by: Jane Doe <jane@example.com>',
  'Refuse a Cursor trailer in commit messages',
  'Document how Claude Code used to append a trailer',
];

describe('AI tool attribution matches the strings vendors actually append', () => {
  it.each(BLOCKED)('blocks: %s', (line) => {
    expect(aiToolAttributionIn(`Fix the pane\n\n${line}`)).toEqual([line]);
  });

  it.each(ALLOWED)('allows: %s', (line) => {
    expect(aiToolAttributionIn(line)).toEqual([]);
  });

  it('names the line so the author can delete it', () => {
    const hits = aiToolAttributionIn('Co-authored-by: Cursor <cursoragent@cursor.com>');
    const message = refuseAiToolAttributionMessage(hits);
    expect(message).toContain('coding tool as author');
    expect(message).toContain('cursoragent@cursor.com');
  });
});

describe('open-pr scans the title and body it will send', () => {
  it('reads --title and --body', () => {
    const copy = openPrCopy(['--title', 'Fix the pane', '--body', 'Made with Cursor']);
    expect(aiToolAttributionIn(copy)).toEqual(['Made with Cursor']);
  });

  it('reads --body-file', () => {
    const copy = openPrCopy(['--title', 'Fix the pane', '--body-file', 'body.md'], (file) => {
      expect(file).toBe('body.md');
      return '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n';
    });
    expect(aiToolAttributionIn(copy).length).toBe(1);
  });

  it('allows a body that only mentions a tool in prose', () => {
    const copy = openPrCopy([
      '--title',
      'Refuse Cursor trailers',
      '--body',
      'The hook matches vendor strings.',
    ]);
    expect(aiToolAttributionIn(copy)).toEqual([]);
  });
});

describe('the commit-msg hook drops a vendor trailer', () => {
  function runHook(message: string): { status: number; stderr: string; file: string } {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fg-commit-msg-')), 'COMMIT_EDITMSG');
    fs.writeFileSync(file, message);
    const run = spawnSync('node', [SCRIPT, '--commit-msg', file], { encoding: 'utf8', cwd: root });
    return { status: run.status ?? -1, stderr: run.stderr, file };
  }

  it('drops the Cursor trailer and keeps the subject', () => {
    const { status, stderr, file } = runHook(
      'Fix the pane\n\nCo-authored-by: Cursor <cursoragent@cursor.com>\n',
    );
    expect(status).toBe(0);
    expect(stderr).toContain('dropped AI tool attribution');
    expect(fs.readFileSync(file, 'utf8')).toContain('Fix the pane');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('cursoragent@cursor.com');
  });

  it('refuses a message that is only attribution', () => {
    const { status, stderr } = runHook('Co-authored-by: Cursor <cursoragent@cursor.com>\n');
    expect(status).toBe(1);
    expect(stderr).toContain('nothing left');
  });

  it('ignores a commented line in the commit-msg file', () => {
    const input = 'Fix the pane\n\n# Co-authored-by: Cursor <cursoragent@cursor.com>\n';
    expect(messageWithoutAiToolAttribution(input).dropped).toEqual([]);
    expect(runHook(input).status).toBe(0);
  });

  it('allows a human co-author', () => {
    expect(runHook('Fix the pane\n\nCo-authored-by: Jane Doe <jane@example.com>\n').status).toBe(0);
  });

  it('is executable', () => {
    expect(fs.statSync(path.join(root, HOOK)).mode & 0o111).toBeGreaterThan(0);
  });
});
