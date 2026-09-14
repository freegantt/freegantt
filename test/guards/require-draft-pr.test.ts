// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `.claude/hooks/require-draft-pr.sh` holds the draft rule for every agent in this repo: a pull
// request opens as a draft, through `pnpm open-pr`, and CI runs when it turns ready (#255). The
// hook is the enforcement, because a rule that lives only in a document breaks on a busy turn.
//
// Two failure modes matter, and this file pins both. A hook that stops blocking the raw create
// command spends CI minutes on unfinished branches, and asks for reviews nobody wanted. A hook
// that blocks too widely — `gh pr ready`, `gh pr view`, a comment read — makes agents work around
// it, and a hook people route around enforces nothing.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = '.claude/hooks/require-draft-pr.sh';

interface HookResult {
  status: number;
  stderr: string;
}

/** Runs the hook over one Bash tool call, the way Claude Code runs it: payload on stdin. */
function hookOn(command: string): HookResult {
  const run = spawnSync(path.join(root, HOOK), {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    cwd: root,
  });
  return { status: run.status ?? -1, stderr: run.stderr };
}

const CREATE = ['gh', 'pr', 'create'].join(' ');

const BLOCKED = [
  `${CREATE} --title "x" --body "y"`,
  `${CREATE} --draft --title "x"`,
  `git commit -m "wip" && ${CREATE} --fill`,
  'cd /tmp; gh  pr   create --fill',
  'gh api --method POST repos/o/r/pulls -f title=x',
];

const ALLOWED = [
  'pnpm open-pr --title "x" --body-file /tmp/body.md',
  'gh pr ready 12',
  'gh pr view 12 --json url',
  'gh pr merge 12 --squash',
  'gh api repos/o/r/pulls/12/comments',
  'git push --set-upstream origin fix/255-ci-gate',
];

describe('the draft-PR hook blocks the one command that opens a ready pull request', () => {
  it.each(BLOCKED)('blocks: %s', (command) => {
    expect(hookOn(command).status).toBe(2);
  });

  it('names the script that does it right, so the agent has somewhere to go', () => {
    const { stderr } = hookOn(`${CREATE} --fill`);
    expect(stderr).toContain('pnpm open-pr');
    expect(stderr).toContain('gh pr ready');
  });
});

describe('the draft-PR hook leaves every other command alone', () => {
  it.each(ALLOWED)('allows: %s', (command) => {
    expect(hookOn(command).status).toBe(0);
  });
});

describe('the hook is wired in, and can run', () => {
  it('is registered as a PreToolUse hook on Bash', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')) as {
      hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    const onBash = settings.hooks.PreToolUse.filter((entry) => entry.matcher.includes('Bash'));
    // `$CLAUDE_PROJECT_DIR/` prefix: a relative command resolves against the agent's cwd, so the
    // hook goes missing whenever an agent runs from a worktree instead of the project root.
    expect(onBash.flatMap((entry) => entry.hooks.map((h) => h.command))).toContain(
      `$CLAUDE_PROJECT_DIR/${HOOK}`,
    );
  });

  it('is executable', () => {
    expect(fs.statSync(path.join(root, HOOK)).mode & 0o111).toBeGreaterThan(0);
  });
});
