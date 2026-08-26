// Type surface for slice-gate.mjs's exports, consumed by test/guards/slice-gate.test.ts. The script
// itself stays plain JS (run directly by `node`, no build step) — this is the sibling declaration
// file convention for a `.mjs` module (Node ESM), not a signal it should become TypeScript.

export interface GateCheck {
  label: string;
  run(): boolean;
}

export type RunnerImpl = (id: string) => boolean;

export function run(cmd: string, cwd?: string): boolean;

export function idExistsInSource(id: string, options?: { dirs?: string[]; cwd?: string }): boolean;

export const RUNNERS: Record<'vitest' | 'e2e', RunnerImpl>;

export function tagged(
  id: string,
  runners: string[],
  label: string,
  options?: { runnerImpls?: Record<string, RunnerImpl>; existsOptions?: { dirs?: string[]; cwd?: string } },
): GateCheck;
