// Type surface for report-nightly-failures.mjs's exports, consumed by
// test/guards/nightly-failures.test.ts. The script itself stays plain JS, run directly by `node`.

export interface NightlyFailure {
  project: string;
  file: string;
  title: string;
  /** The spec line the failing assertion sits on, or 0 when the error names none. */
  line: number;
  error: string;
}

export const FAILURE_LABEL: string;
export function firstErrorLine(message: string | undefined): string;
export function readFailures(report: unknown): NightlyFailure[];
export function failureSignature(failure: NightlyFailure): string;
export function unreportedFailures(failures: readonly NightlyFailure[], knownText: string): NightlyFailure[];
export function formatFailures(failures: readonly NightlyFailure[]): string;
