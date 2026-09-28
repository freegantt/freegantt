// Type surface for check-crap.mjs's exports, consumed by test/guards/crap.test.ts.
// The script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

export type CrapMetric = 'crap' | 'complexity';

export interface CrapConfig {
  metric: CrapMetric;
  threshold: number;
}

export interface CrapFunction {
  name: string;
  line: number;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  complexity: number;
}

export interface ScoredFunction extends CrapFunction {
  file: string;
  coverage: number | undefined;
  score: number;
}

export interface EvaluatedTree {
  scored: ScoredFunction[];
  breaches: ScoredFunction[];
  max: number;
  files: number;
  functions: number;
}

export function crapScore(complexity: number, coverage: number): number;

export function readConfig(configPath: string): CrapConfig;

export function functionsIn(source: string, fileName?: string): CrapFunction[];

export function mergeCoverageMaps(
  maps: ReadonlyArray<Record<string, { s?: Record<string, number> }> | null | undefined>,
): Record<string, { s?: Record<string, number> }>;

export function evaluateTree(options: {
  rootDir: string;
  srcDir: string;
  metric: CrapMetric;
  threshold: number;
  coveragePath: string;
  coverage?: Record<string, unknown> | null;
  collectCoverageRun?: (rootDir: string) => void;
}): EvaluatedTree;

export function main(
  argv?: string[],
  io?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    exit: (code: number) => void;
  },
): number;
