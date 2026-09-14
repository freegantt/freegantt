// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `.claude/hooks/require-pr-wait.sh` holds the CI-wait rule for every agent in this repo: waiting
// goes through `pnpm pr-wait`, whose last line is the answer (#354). The hook is the enforcement,
// because a rule that lives only in a document breaks on a busy turn — and this one did. The
// session that wrote `pr-wait` still hand-rolled a status loop afterwards, which is why the BLOCKED
// list below quotes the real commands from that session.
//
// Two failure modes matter, and this file pins both. A hook that stops blocking the poll lets a
// wait that never waited report as green. A hook that blocks too widely — a log read, a run list,
// `gh run watch` on a dispatch run that has no pull request — makes agents route around it, and a
// hook people route around enforces nothing.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = '.claude/hooks/require-pr-wait.sh';

/** Runs the hook over one Bash tool call, the way Claude Code runs it: payload on stdin. */
function hookOn(command: string): { status: number; stderr: string } {
  const run = spawnSync(path.join(root, HOOK), {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    cwd: root,
  });
  return { status: run.status ?? -1, stderr: run.stderr };
}

// Every one of these ran in the session that built `pr-wait`, after it was built. They are assembled
// from parts so that this file does not trip the hook it tests when a shell reads it.
const CHECKS = ['gh', 'pr', 'checks'].join(' ');
const RUN_VIEW = ['gh', 'run', 'view'].join(' ');
const RUN_LIST = ['gh', 'run', 'list'].join(' ');

const BLOCKED = [
  `until [ "$(${CHECKS} 354 --json state --jq '.[0].state')" != "PENDING" ]; do sleep 5; done`,
  `until ${RUN_VIEW} 34884846692 --json status --jq '.status' | grep -q completed; do sleep 20; done`,
  `sleep 20; ${CHECKS} 354`,
  `sleep 8; ${RUN_LIST} --branch fix/ci-cost-workers-and-concurrency`,
  `while ${CHECKS} 360 --json bucket | grep -q pending; do sleep 10; done`,
  `${CHECKS} 360 --watch --fail-fast`,
];

const ALLOWED = [
  'pnpm pr-wait 360',
  'pnpm pr-wait',
  `${RUN_LIST} --branch main --limit 5`,
  `${RUN_VIEW} 34884846692 --log`,
  `${RUN_VIEW} 34884846692 --json conclusion --jq .conclusion`,
  `${CHECKS} 360 --json name,state,bucket`,
  // A dispatch run has no pull request, so `pr-wait` cannot reach it. `gh run watch` really blocks.
  'gh run watch 34885308053',
  'gh pr ready 361',
  'sleep 5',
  // Waiting on `pr-wait`'s own output is the rule working, not a way around it.
  'until grep -q "pr-wait PASS" /tmp/v.log; do sleep 20; done',
];

describe('the pr-wait hook blocks a hand-rolled CI poll', () => {
  it.each(BLOCKED)('blocks: %s', (command) => {
    expect(hookOn(command).status).toBe(2);
  });

  it('names the command that does it right, so the agent has somewhere to go', () => {
    const { stderr } = hookOn(`sleep 20; ${CHECKS} 354`);
    expect(stderr).toContain('pnpm pr-wait');
    expect(stderr).toContain('last line');
  });

  it.each(ALLOWED)('allows: %s', (command) => {
    expect(hookOn(command).status).toBe(0);
  });

  // A hook that is written but not wired enforces nothing, and nothing else in the repo would say
  // so — the tests above call the script directly, which passes whether or not Claude Code runs it.
  it('is registered as a PreToolUse hook on Bash', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')) as {
      hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    const onBash = settings.hooks.PreToolUse.filter((entry) => entry.matcher.includes('Bash'));
    const commands = onBash.flatMap((entry) => entry.hooks.map((hook) => hook.command));
    expect(commands.some((command) => command.endsWith('require-pr-wait.sh'))).toBe(true);
  });

  it('is executable', () => {
    expect(() => fs.accessSync(path.join(root, HOOK), fs.constants.X_OK)).not.toThrow();
  });
});
