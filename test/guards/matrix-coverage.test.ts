// docs/04-hooks-and-ci.md §4 promises this file: "closes the loop plans/04 §4 opens (an invariant
// without a job is a TODO, tracked in the table itself). The table stops being prose and becomes a
// checked artifact." Parses docs/01-invariant-guard-matrix.md's I1-I14 table and asserts every row
// names a CI job that exists (either running today in ci.yml, or explicitly planned in docs/04 §5's
// pipeline diagram for a later slice) and that no row's status cell is blank (#43).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

interface Row {
  id: string;
  ciJobCell: string;
  statusCell: string;
}

function parseInvariantRows(matrix: string): Row[] {
  const lines = matrix.split('\n').filter((line) => /^\|\s*I\d+\s*\|/.test(line));
  return lines.map((line) => {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1); // drop the empty leading/trailing split
    // The table is 5 columns (#, Invariant, Mechanism, CI job, Status), but I12's Mechanism cell
    // contains a regex literal with an unescaped `|` (`/px|width|left|x$/i`), which a naive split
    // sees as an extra column boundary. CI job and Status are always the trailing two cells
    // regardless of how many extra pipes an earlier cell's prose happens to contain.
    const id = cells[0]!;
    const ciJobCell = cells[cells.length - 2] ?? '';
    const statusCell = cells[cells.length - 1] ?? '';
    return { id, ciJobCell, statusCell };
  });
}

/** Job names `pnpm <script>` lines in ci.yml actually run today. */
function jobsRunByCi(workflow: string): Set<string> {
  const names = [...workflow.matchAll(/^\s*-\s*run:\s*pnpm\s+(?:run\s+)?([\w:-]+)/gm)].map((m) => m[1]!);
  return new Set(names);
}

/** Jobs docs/04-hooks-and-ci.md §5's pipeline diagram names for a later slice — not in ci.yml yet
 * because their subject doesn't exist yet (matrix status `PLANNED (Sn)`), not because they were
 * forgotten. Sourced from the mermaid diagram's own node labels, not invented here. */
const FUTURE_PLANNED_JOBS = new Set(['api-report', 'size-limit', 'e2e', 'axe', 'perf']);

function jobNamesInCell(cell: string): string[] {
  return [...cell.matchAll(/`([\w:-]+)`/g)].map((m) => m[1]!);
}

describe('the invariant guard matrix maps every row to a real job (#43)', () => {
  const matrix = read('docs/01-invariant-guard-matrix.md');
  const workflow = read('.github/workflows/ci.yml');
  const rows = parseInvariantRows(matrix);
  const knownJobs = new Set([...jobsRunByCi(workflow), ...FUTURE_PLANNED_JOBS]);

  it('finds exactly 14 rows (I1-I14) — guards the parser itself against a doc rewrite', () => {
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 14 }, (_, i) => `I${i + 1}`));
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s names a non-blank status', (_id, row) => {
    expect(row.statusCell.length).toBeGreaterThan(0);
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s names at least one CI job', (_id, row) => {
    expect(jobNamesInCell(row.ciJobCell).length).toBeGreaterThan(0);
  });

  it.each(rows.flatMap((r) => jobNamesInCell(r.ciJobCell).map((job) => [`${r.id}: ${job}`, job] as const)))(
    '%s exists in ci.yml or is a documented future job',
    (_label, job) => {
      expect(knownJobs.has(job)).toBe(true);
    },
  );
});
