// Type surface for pr-wait.mjs's exports, consumed by test/guards/pr-wait-verdict.test.ts. The
// script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

/** One row of `gh run list --json databaseId,status,conclusion,event,headSha,url`. */
export interface GateRun {
  databaseId: number;
  status: string;
  conclusion: string;
  event: string;
  headSha: string;
  createdAt: string;
  url?: string;
}

/** Which pull request the verdict names, and how long the wait took. */
export interface VerdictContext {
  number: number;
  seconds: number;
  branch: string;
  dispatchUrl?: string;
}

/** The one verdict line, and whether the gate run settled and went green. */
export interface GateVerdict {
  settled: boolean;
  ok: boolean;
  verdict: string;
}

/** True when this row is the gate for `headSha`: a `pull_request` run that actually ran. */
export function isLiveGateRun(run: GateRun, headSha: string): boolean;

/** The newest live gate run for this head. `besidesId` drops a run we already watched. */
export function gateRunForHead(
  runs: readonly GateRun[],
  headSha: string,
  pick?: { besidesId?: number },
): GateRun | undefined;

/**
 * True when a watched run skipped on a ready pull request, so the ready gate
 * is a newer run on the same commit.
 */
export function shouldWaitForNewerRunAfterSkip(run: GateRun, context: { isDraft: boolean }): boolean;

export function summarizeGateRun(run: GateRun | undefined, context: VerdictContext): GateVerdict;
