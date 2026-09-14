// Type surface for pr-wait.mjs's exports, consumed by test/guards/pr-wait-verdict.test.ts. The
// script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

/** One row of `gh pr checks <n> --json name,state,bucket,link`. */
export interface PullRequestCheck {
  name: string;
  state: string;
  bucket: string;
  link?: string;
}

/** Which pull request the verdict names, and how long the wait took. */
export interface VerdictContext {
  number: number;
  seconds: number;
  branch: string;
}

/** The one verdict line, and whether the checks settled and went green. */
export interface CheckSummary {
  settled: boolean;
  ok: boolean;
  verdict: string;
}

/** True when a real run is on the board. A skipped check is the stale draft-time run, not a start. */
export function hasRunStarted(checks: readonly PullRequestCheck[]): boolean;

export function summarizeChecks(checks: readonly PullRequestCheck[], context: VerdictContext): CheckSummary;
