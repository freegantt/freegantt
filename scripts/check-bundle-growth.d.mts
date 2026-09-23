// Type surface for check-bundle-growth.mjs's exports, consumed by test/guards/bundle-growth.test.ts.
// The script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

export interface SizeLimitEntry {
  name: string;
  path: string;
  import: string;
}

export interface MeasuredSize {
  name: string;
  size: number;
}

export interface LedgerRow {
  pullRequest: string;
  entry: string;
  recordedDelta: number;
  reason: string;
}

export interface GrowthFailure {
  name: string;
  delta: number;
}

export interface GrowthEvaluation {
  lines: string[];
  failures: GrowthFailure[];
  comparisons: number;
}

export function entryKey(entry: Pick<SizeLimitEntry, 'path' | 'import'>): string;

export function measureSizes(dir: string): Map<string, MeasuredSize>;

export function resolvePullRequestId(): string;

export function readLedger(filePath?: string): LedgerRow[];

export function formatDelta(bytes: number): string;

export function formatBudget(bytes: number): string;

export function evaluateGrowth(
  branchSizes: Map<string, MeasuredSize>,
  baseSizes: Map<string, MeasuredSize>,
  options: { ledger: LedgerRow[]; pullRequestId: string; growthBudgetBytes: number },
): GrowthEvaluation;
