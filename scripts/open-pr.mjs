#!/usr/bin/env node
// `pnpm open-pr` — the one way to open a pull request on this repo (#255).
//
// Every pull request opens as a draft, and CI runs on `ready_for_review`. So work in progress
// spends no minutes, and "ready" says one thing: this is up for review, and it is meant to merge.
// `gh pr create` opens a ready pull request by default. That spends minutes on an unfinished
// branch, and it asks for a review nobody wanted yet. `.claude/hooks/require-draft-pr.sh` blocks
// the raw command and names this script, because a rule an agent must remember is a rule that
// breaks on a busy turn.
//
// This script also pushes the branch when the remote does not carry it yet. The push runs
// `.githooks/pre-push`, so the local gate proves the work before the pull request exists.
//
// Everything after the flags below goes to `gh pr create` unchanged — `--base`, `--label`,
// `--reviewer`, and the rest keep their meaning.

import { execFileSync, spawnSync } from 'node:child_process';

const USAGE = 'usage: pnpm open-pr --title "<title>" --body-file <path> [more gh pr create flags]';

/** Flags that would undo the draft, with the reason each one is refused. */
const REFUSED = new Map([
  ['--draft', 'this script already opens a draft'],
  ['-d', 'this script already opens a draft'],
  ['--web', 'the web form opens a ready pull request, and this script cannot hold it to a draft'],
]);

const TITLE_FLAGS = ['--title', '-t'];
const BODY_FLAGS = ['--body', '-b', '--body-file', '-F', '--fill', '--fill-first', '--fill-verbose'];

const args = process.argv.slice(2);

function stop(message) {
  console.error(`open-pr: ${message}`);
  process.exit(1);
}

function git(...argv) {
  return execFileSync('git', argv, { encoding: 'utf8' }).trim();
}

/** True when the argument list carries `flag`, in either the `--x value` or the `--x=value` form. */
function carries(flag) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

for (const [flag, reason] of REFUSED) {
  if (carries(flag)) stop(`${flag} is not accepted — ${reason}.`);
}
if (!TITLE_FLAGS.some(carries)) stop(`a pull request needs a title.\n${USAGE}`);
if (!BODY_FLAGS.some(carries)) stop(`a pull request needs a body: --body, --body-file, or --fill.\n${USAGE}`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === 'HEAD') stop('this checkout is detached. Make a branch first.');
if (branch === 'main') stop('a pull request needs a branch of its own. Make one, then run this again.');

if (git('status', '--porcelain') !== '') {
  console.warn('open-pr: the working tree is dirty. The pull request carries only what you commit and push.');
}

const existing = spawnSync('gh', ['pr', 'view', '--json', 'url,number,isDraft'], { encoding: 'utf8' });
if (existing.status === 0) {
  const pr = JSON.parse(existing.stdout);
  console.log(`open-pr: this branch already has pull request #${pr.number} — ${pr.url}`);
  console.log(
    pr.isDraft
      ? `open-pr: it is still a draft, so CI is idle. Run \`gh pr ready ${pr.number}\` when it is meant to merge.`
      : 'open-pr: it is ready for review, so CI runs on every push to this branch.',
  );
  process.exit(0);
}

const hasUpstream =
  spawnSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { stdio: 'ignore' })
    .status === 0;
const push = hasUpstream ? ['push'] : ['push', '--set-upstream', 'origin', branch];

console.log(`open-pr: git ${push.join(' ')} — pre-push runs the gate.`);
if (spawnSync('git', push, { stdio: 'inherit' }).status !== 0) {
  stop('the push failed, so the branch is not on the remote yet. Nothing was opened.');
}

const created = spawnSync('gh', ['pr', 'create', '--draft', ...args], { encoding: 'utf8' });
process.stdout.write(created.stdout ?? '');
process.stderr.write(created.stderr ?? '');
if (created.status !== 0) {
  stop('`gh pr create` failed. The message above says why.');
}

const url = (created.stdout ?? '').trim().split('\n').pop() ?? '';
const number = url.split('/').pop();
console.log(`open-pr: opened as a draft — ${url}`);
console.log(
  `open-pr: CI stays idle until it is ready. Run \`gh pr ready ${number}\` when it is meant to merge.`,
);
