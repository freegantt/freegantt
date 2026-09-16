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
// `--ready` says the work is up for review and meant to merge — the one decision `gh pr ready`
// carries (#255). It reaches both states this script can find a branch in: a pull request that does
// not exist yet is opened as a draft and then flipped, and one that already exists as a draft is
// flipped where it stands. The pull request is still born a draft either way, so a `--ready` run
// that fails at creation spends no CI minutes on a branch nobody asked to review.
//
// Everything after the flags below goes to `gh pr create` unchanged — `--base`, `--label`,
// `--reviewer`, and the rest keep their meaning.

import { execFileSync, spawnSync } from 'node:child_process';

const USAGE =
  'usage: pnpm open-pr --title "<title>" --body-file <path> [--ready] [more flags]\n' +
  '       pnpm open-pr --ready            # this branch already has a draft: mark it ready';

/** Flags that would undo the draft, with the reason each one is refused. */
const REFUSED = new Map([
  ['--draft', 'this script already opens a draft'],
  ['-d', 'this script already opens a draft'],
  ['--web', 'the web form opens a ready pull request, and this script cannot hold it to a draft'],
]);

const TITLE_FLAGS = ['--title', '-t'];
const BODY_FLAGS = ['--body', '-b', '--body-file', '-F', '--fill', '--fill-first', '--fill-verbose'];

/** This script's own flag, never the creation command's — read here, and cut from what is passed on. */
const READY_FLAG = '--ready';

const argv = process.argv.slice(2);
const wantsReady = argv.includes(READY_FLAG);
const args = argv.filter((arg) => arg !== READY_FLAG);

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
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === 'HEAD') stop('this checkout is detached. Make a branch first.');
if (branch === 'main') stop('a pull request needs a branch of its own. Make one, then run this again.');

if (git('status', '--porcelain') !== '') {
  console.warn('open-pr: the working tree is dirty. The pull request carries only what you commit and push.');
}

/** Flips one draft to ready, then names the one command that answers "did the gate pass".
 *  `pr-wait` watches the CI workflow run for the pull request head, so a leftover skipped
 *  draft-time job is not a verdict (docs/04 §5.2). */
function markReady(number) {
  const readied = spawnSync('gh', ['pr', 'ready', String(number)], { encoding: 'utf8' });
  process.stderr.write(readied.stderr ?? '');
  if (readied.status !== 0) stop(`marking #${number} ready failed. The message above says why.`);
  console.log(`open-pr: #${number} is ready for review, so CI runs on every push to this branch.`);
  console.log(`open-pr: \`pnpm pr-wait ${number}\` waits for the gate and states the result in one line.`);
}

const existing = spawnSync('gh', ['pr', 'view', '--json', 'url,number,isDraft'], { encoding: 'utf8' });
if (existing.status === 0) {
  const pr = JSON.parse(existing.stdout);
  console.log(`open-pr: this branch already has pull request #${pr.number} — ${pr.url}`);
  if (pr.isDraft && wantsReady) {
    markReady(pr.number);
  } else if (pr.isDraft) {
    console.log(
      `open-pr: it is still a draft, so CI is idle. Run \`pnpm open-pr --ready\` when it is meant to merge,` +
        ` then \`pnpm pr-wait ${pr.number}\` to wait for the gate.`,
    );
  } else {
    console.log(
      `open-pr: it is already ready for review, so CI runs on every push to this branch.` +
        ` \`pnpm pr-wait ${pr.number}\` waits for the gate and states the result.`,
    );
  }
  process.exit(0);
}

// Only a run that will create something needs a title and a body. `--ready` on its own is the other
// job this script does, and it invents neither. Checked before the push, so a run missing one of
// them fails without touching the remote.
if (!TITLE_FLAGS.some(carries)) stop(`a pull request needs a title.\n${USAGE}`);
if (!BODY_FLAGS.some(carries)) stop(`a pull request needs a body: --body, --body-file, or --fill.\n${USAGE}`);

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
if (wantsReady) {
  markReady(number);
} else {
  console.log(
    `open-pr: CI stays idle until it is ready. Run \`pnpm open-pr --ready\` when it is meant to merge.`,
  );
  // The next question after "ready" is always "did the gate pass". Name the one command that answers
  // it here, where the next reader already is — a wait written on the spot reports green (#354).
  console.log(
    `open-pr: then \`pnpm pr-wait ${number}\` waits for the gate and states the result in one line.`,
  );
}
