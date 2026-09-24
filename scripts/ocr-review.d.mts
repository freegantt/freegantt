// Type surface for ocr-review.mjs's exports, consumed by test/guards/ocr-review-verdict.test.ts.
// The script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

/** One row of `ocr session list --json`, normalized to camelCase and narrowed to the fields this
 *  script reads. `failedFilePaths` comes from `run_manifest.coverage.failed`, which `ocr` fills in
 *  only once the session has a terminal state — empty while the run is still going. */
export interface SessionRecord {
  sessionId: string;
  repoDir: string;
  startTime: string;
  endTime: string;
  selectedFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalComments: number;
  terminalState?: string;
  failedFilePaths: readonly string[];
}

/** One row of `ocr session comments <id> --json`, normalized to camelCase. */
export interface ReviewComment {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
}

/** Which repo's session to claim, and how far back it may have started. */
export interface OwnSessionQuery {
  repoDir: string;
  notBefore: string;
}

/** The one verdict line for a session that reached its end, and the file names behind a PARTIAL. */
export interface SessionVerdict {
  ok: boolean;
  failedFilePaths: readonly string[];
  line: string;
}

/** The newest session for `repoDir` that started at or after `notBefore` — the run this script just launched. */
export function findOwnSession(
  sessions: readonly SessionRecord[],
  query: OwnSessionQuery,
): SessionRecord | undefined;

/** True once `stallMinutes` have passed since the run last completed a file or landed a finding. */
export function isStalled(lastProgressAt: Date, now: Date, stallMinutes: number): boolean;

/** The comments in `current` that `previous` did not yet have, in `current`'s own order. */
export function newComments(
  previous: readonly ReviewComment[],
  current: readonly ReviewComment[],
): ReviewComment[];

/** One report line for a finding: `path:line [severity] title`. */
export function formatFinding(comment: ReviewComment): string;

/** The first sentence of a finding's body, short enough to stand in for a title. */
export function findingTitle(content: string): string;

/** PASS when every file finished; PARTIAL, with the failed paths, when any file did not. */
export function verdictForSession(session: SessionRecord, context: { resumeCommand: string }): SessionVerdict;

/** How a spawned `child_process` ended: normal exit, a signal, or a failure to run at all. */
export interface ChildOutcome {
  code: number | null;
  signal: string | null;
  error?: Error;
}

/** A short, human phrase for why the `ocr` child stopped, for a FAILED line. */
export function describeChildOutcome(outcome: ChildOutcome): string;
