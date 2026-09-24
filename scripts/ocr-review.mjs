#!/usr/bin/env node
// `pnpm ocr-review [--resume <id>]` — run the branch reviewer `ocr`, report its findings as they
// land, and kill a stalled run.
//
// Why a script, and not `ocr review --from origin/main --to HEAD` typed by hand. A real run takes
// 10 to 30+ minutes. A foreground tool call stops at 10 minutes, so it always reports "timed out"
// before a hand-typed run can finish — and the agent is then left to poll `ocr session list` by
// hand, the exact mistake `pr-wait` already exists to stop for CI (#415, #420): a wait written on
// the spot reads the wrong signal, or reports done before the run has settled.
//
// So this script owns the whole run, in the background, as one process:
//   - it launches `ocr review`, then finds the session `ocr` just opened for this repo — the
//     newest session that started at or after the launch;
//   - every minute it reads that session back and prints one line per finding it has not printed
//     yet, so an agent can start fixing before the run ends;
//   - a run earns a kill only when it stops making any kind of progress — no file finishes, no
//     file fails, no finding lands — for `STALL_MINUTES`;
//   - the last line it prints is always the verdict: PASS, PARTIAL, STALLED, or FAILED.
//
// Exit codes, one per verdict, so a caller branches on more than "zero or not":
//   0 PASS      every selected file finished.
//   1 PARTIAL   some file failed; rerun with `--resume <id>` to retry only those.
//   2 STALLED   the run made no progress for `STALL_MINUTES` and this script killed it.
//   3 FAILED    `ocr` itself exited with an error, or setup (fetch, session lookup) failed.

import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const POLL_MILLISECONDS = 60_000;
const STALL_MINUTES = 15;
const OWN_SESSION_TIMEOUT_MILLISECONDS = 60_000;
// `ocr session comments` returns the full text of every finding, which a branch-wide review can
// push past Node's 1 MiB `spawnSync` default. 64 MiB is generous headroom for a JSON reply that is
// plain text, not a binary payload.
const OCR_JSON_MAX_BUFFER = 64 * 1024 * 1024;
// `ocr` writes this as `end_time` on a session it has not finished yet (Go's zero `time.Time`).
const UNSET_END_TIME = '0001-01-01T00:00:00Z';

export const EXIT_CODE = { pass: 0, partial: 1, stalled: 2, failed: 3 };

/** The newest session for `repoDir` that started at or after `notBefore` — the run this script just launched. */
export function findOwnSession(sessions, { repoDir, notBefore }) {
  let newest;
  for (const session of sessions) {
    if (session.repoDir !== repoDir) continue;
    if (session.startTime < notBefore) continue;
    if (newest === undefined || session.startTime > newest.startTime) newest = session;
  }
  return newest;
}

/** True once `stallMinutes` have passed since the run last completed a file or landed a finding. */
export function isStalled(lastProgressAt, now, stallMinutes) {
  return now.getTime() - lastProgressAt.getTime() >= stallMinutes * 60_000;
}

/** A comment's identity, for spotting the ones `previous` did not have yet. No field in `ocr`'s
 *  output is a stable id, so identity is the content itself: where it lands, how bad it is, what
 *  it says. */
function commentKey(comment) {
  return [comment.path, comment.startLine, comment.endLine, comment.severity, comment.content].join('\u0000');
}

/** The comments in `current` that `previous` did not yet have, in `current`'s own order. */
export function newComments(previous, current) {
  const seen = new Set(previous.map(commentKey));
  return current.filter((comment) => !seen.has(commentKey(comment)));
}

/** The first sentence of a finding's body, short enough to stand in for a title. */
export function findingTitle(content) {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  const sentence = /^(.{1,117}?[.!?])(\s|$)/.exec(firstLine);
  const title = sentence ? sentence[1] : firstLine;
  return title.length > 120 ? `${title.slice(0, 117)}…` : title;
}

/** One report line for a finding: `path:line [severity] title`. */
export function formatFinding(comment) {
  const location =
    comment.startLine > 0
      ? `${comment.path}:${comment.startLine}${comment.endLine > comment.startLine ? `-${comment.endLine}` : ''}`
      : comment.path;
  return `${location} [${comment.severity}] ${findingTitle(comment.content)}`;
}

/** PASS when every file finished; PARTIAL, with the failed paths, when any file did not. */
export function verdictForSession(session, context) {
  if (session.failedFilePaths.length === 0) {
    return {
      ok: true,
      failedFilePaths: [],
      line: `ocr-review PASS — all ${session.selectedFiles} file(s) done. Session ${session.sessionId}.`,
    };
  }
  return {
    ok: false,
    failedFilePaths: session.failedFilePaths,
    line: `ocr-review PARTIAL — ${session.failedFilePaths.length} file(s) failed. Resume with: ${context.resumeCommand}`,
  };
}

function normalizeSession(raw) {
  return {
    sessionId: raw.session_id,
    repoDir: raw.repo_dir,
    startTime: raw.start_time,
    endTime: raw.end_time,
    selectedFiles: raw.selected_files ?? 0,
    completedFiles: raw.completed_files ?? 0,
    failedFiles: raw.failed_files ?? 0,
    totalComments: raw.total_comments ?? 0,
    terminalState: raw.run_manifest?.terminal_state,
    failedFilePaths: (raw.run_manifest?.coverage?.failed ?? []).map((item) => item.path),
  };
}

function normalizeComment(raw) {
  return {
    path: raw.path,
    content: raw.content,
    startLine: raw.start_line,
    endLine: raw.end_line,
    severity: raw.severity,
    category: raw.category,
  };
}

/** A short, human phrase for why the `ocr` child stopped, for a FAILED line. */
export function describeChildOutcome(outcome) {
  if (outcome.error) return outcome.error.message;
  if (outcome.signal) return `signal ${outcome.signal}`;
  return `exit code ${outcome.code}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// The `ocr review` child this run launched, tracked here (not only inside `main()`) so every exit
// path — `stop()`, a STALLED kill, an uncaught throw — can reach it. Left running, it is an orphan
// process still writing to a temp log nobody is reading.
let activeChild;

/** Kills the run's `ocr` child, its whole process group so a shell wrapper cannot outlive it
 *  (`scripts/measure-scale.mjs` uses the same pattern). A no-op once nothing is running. */
function killActiveChild() {
  if (activeChild === undefined) return;
  try {
    process.kill(-activeChild.pid, 'SIGTERM');
  } catch {
    activeChild.kill('SIGTERM');
  }
}

function stop(message) {
  killActiveChild();
  console.log(`ocr-review FAILED — ${message}`);
  process.exit(EXIT_CODE.failed);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    await main();
  } catch (error) {
    killActiveChild();
    console.log(`ocr-review FAILED — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODE.failed);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let resumeId;
  if (args.length === 2 && args[0] === '--resume') {
    resumeId = args[1];
  } else if (args.length !== 0) {
    stop('usage: pnpm ocr-review [--resume <session-id>]');
  }

  function ocrJson(argv) {
    const result = spawnSync('ocr', argv, { cwd: root, encoding: 'utf8', maxBuffer: OCR_JSON_MAX_BUFFER });
    if (result.error) stop(`\`ocr ${argv.join(' ')}\` could not run: ${result.error.message}`);
    if (result.status !== 0)
      stop(`\`ocr ${argv.join(' ')}\` failed. ${(result.stderr || result.stdout || '').trim()}`);
    try {
      return JSON.parse(result.stdout);
    } catch {
      stop(`\`ocr ${argv.join(' ')}\` did not return JSON.`);
    }
  }

  const readSessions = () =>
    ocrJson(['session', 'list', '--json', '--repo', root, '--limit', '50']).map(normalizeSession);
  const readComments = (sessionId) =>
    ocrJson(['session', 'comments', sessionId, '--json', '--repo', root]).map(normalizeComment);

  console.log('ocr-review: fetching origin so origin/main is fresh.');
  const fetch = spawnSync('git', ['fetch', 'origin'], { cwd: root, stdio: 'inherit' });
  if (fetch.status !== 0) stop('`git fetch origin` failed.');

  const reviewArgs = ['review', '--from', 'origin/main', '--to', 'HEAD', '--color', 'never'];
  if (resumeId !== undefined) reviewArgs.push('--resume', resumeId);

  const logPath = path.join(os.tmpdir(), `ocr-review-${process.pid}.log`);
  const logFd = openSync(logPath, 'a');
  console.log(`ocr-review: running \`ocr ${reviewArgs.join(' ')}\` in ${root}`);
  console.log(`ocr-review: ocr's own output goes to ${logPath}`);
  const spawnedAt = new Date().toISOString();
  // Detached, so `killActiveChild()` can kill the whole process group `ocr` may spawn under, the
  // same pattern `scripts/measure-scale.mjs` uses for its dev-server child.
  const child = spawn('ocr', reviewArgs, { cwd: root, stdio: ['ignore', logFd, logFd], detached: true });
  activeChild = child;

  let childOutcome;
  const childExited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      childOutcome = { code, signal };
      resolve();
    });
    child.on('error', (error) => {
      childOutcome = { code: null, signal: null, error };
      resolve();
    });
  });

  let session;
  const findSessionDeadline = Date.now() + OWN_SESSION_TIMEOUT_MILLISECONDS;
  while (session === undefined && childOutcome === undefined && Date.now() < findSessionDeadline) {
    session = findOwnSession(readSessions(), { repoDir: root, notBefore: spawnedAt });
    if (session === undefined) await Promise.race([sleep(3_000), childExited]);
  }
  if (session === undefined) {
    if (childOutcome !== undefined) {
      stop(
        `\`ocr ${reviewArgs.join(' ')}\` stopped with ${describeChildOutcome(childOutcome)} before a session appeared. Raw ocr output: ${logPath}`,
      );
    }
    stop(
      `no session for this repo appeared within ${OWN_SESSION_TIMEOUT_MILLISECONDS / 1000}s of launch. Raw ocr output: ${logPath}`,
    );
  }

  console.log(`ocr-review: session ${session.sessionId} started.`);
  console.log(`ocr-review: read findings any time with \`ocr session comments ${session.sessionId}\`.`);

  let latest = session;
  let previousComments = [];
  let lastProgressAt = new Date();

  for (;;) {
    await Promise.race([sleep(POLL_MILLISECONDS), childExited]);

    const sessions = readSessions();
    const current = sessions.find((row) => row.sessionId === session.sessionId) ?? latest;
    const comments = readComments(session.sessionId);
    const fresh = newComments(previousComments, comments);
    for (const comment of fresh) console.log(formatFinding(comment));
    previousComments = comments;

    const progressed =
      current.completedFiles !== latest.completedFiles ||
      current.failedFiles !== latest.failedFiles ||
      fresh.length > 0;
    if (progressed) lastProgressAt = new Date();
    latest = current;

    const ended = current.endTime !== UNSET_END_TIME;
    if (ended || childOutcome !== undefined) break;

    if (isStalled(lastProgressAt, new Date(), STALL_MINUTES)) {
      killActiveChild();
      const resumeCommand = `pnpm ocr-review --resume ${session.sessionId}`;
      console.log(
        `\nocr-review STALLED — no new file and no new finding for ${STALL_MINUTES} minutes. Resume with: ${resumeCommand}`,
      );
      process.exit(EXIT_CODE.stalled);
    }
  }

  if (childOutcome !== undefined && childOutcome.code !== 0) {
    console.log(
      `\nocr-review FAILED — ocr exited with ${describeChildOutcome(childOutcome)}. Raw ocr output: ${logPath}`,
    );
    process.exit(EXIT_CODE.failed);
  }

  const resumeCommand = `pnpm ocr-review --resume ${latest.sessionId}`;
  const verdict = verdictForSession(latest, { resumeCommand });
  if (!verdict.ok) {
    for (const failedPath of verdict.failedFilePaths) console.log(`  - ${failedPath}`);
  }
  console.log(`\n${verdict.line}`);
  process.exit(verdict.ok ? EXIT_CODE.pass : EXIT_CODE.partial);
}
