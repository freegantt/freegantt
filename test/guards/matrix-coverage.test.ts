// docs/04-hooks-and-ci.md §4 promises this file: "closes the loop plans/04 §4 opens (an invariant
// without a job is a TODO, tracked in the table itself). The table stops being prose and becomes a
// checked artifact." Parses docs/01-invariant-guard-matrix.md's numbered table and asserts every row
// names a gate check that runs today (CI is one job running the whole gate — docs/04 §5), or one
// docs/04 §5's pipeline diagram plans for a later slice, and that no row's status is blank (#43).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCheckList } from '../../scripts/verify-full.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

interface Row {
  id: string;
  mechanismCell: string;
  gateCheckCell: string;
  statusCell: string;
}

/** Table rows for §1 (`| I1 | ... |`) and §2 (`| Rule prose | ... |`, no numbered id column — the
 * `#` cell is folded into the rule-name cell there). Both are 5-column-with-a-stray-pipe-hazard
 * tables (I12's Mechanism cell has an unescaped `|` in a regex literal), so both parse the same way:
 * Gate check and Status are always the trailing two cells, whatever the earlier cells' prose contains. */
function parseRows(lines: string[]): Row[] {
  return lines.map((line) => {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1); // drop the empty leading/trailing split
    const id = cells[0]!;
    const mechanismCell = cells[cells.length - 3] ?? '';
    const gateCheckCell = cells[cells.length - 2] ?? '';
    const statusCell = cells[cells.length - 1] ?? '';
    return { id, mechanismCell, gateCheckCell, statusCell };
  });
}

function parseInvariantRows(matrix: string): Row[] {
  return parseRows(matrix.split('\n').filter((line) => /^\|\s*I\d+\s*\|/.test(line)));
}

/** §2's un-numbered hard-rule rows: any table row that isn't a header/separator/§1 `I<n>` row and
 * has at least 5 cells (the real content rows; the "Status | Meaning" vocabulary table up top has
 * only 2). Scoped to lines after the `## 2.` heading so §1 and §3's prose never leak in. */
function parseHardRuleRows(matrix: string): Row[] {
  const section2 = matrix.split(/^## 2\./m)[1]?.split(/^## 3\./m)[0] ?? '';
  const lines = section2
    .split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*-+\s*\|/.test(line) && !/^\|\s*Rule \(source\)/.test(line));
  return parseRows(lines);
}

const PLANNED_NEARBY_WINDOW = 40;

/** Every backtick-quoted `` `freegantt/<name>` `` mentioned in a Mechanism cell, with whether a
 * `PLANNED (Sn)` tag sits within a short window right after it — an AUTO-PARTIAL row can enforce one
 * half and merely plan the other (I2, model-is-types-only, I13, reconciler-scope all do), so planned-
 * ness is read per mention, not just off the row's own overall status. Backtick-scoped so an ordinary
 * package-path mention like `import('freegantt/data')` is never mistaken for a rule name. */
function freegantRuleMentionsInCell(cell: string): { rule: string; plannedNearby: boolean }[] {
  return [...cell.matchAll(/`freegantt\/([\w-]+)`/g)].map((m) => ({
    rule: m[1]!,
    plannedNearby: /PLANNED \(S\d/.test(
      cell.slice(m.index! + m[0].length, m.index! + m[0].length + PLANNED_NEARBY_WINDOW),
    ),
  }));
}

/** Every check the gate runs today. CI is one job running one command (docs/04 §5), so the list
 * lives in `package.json` — the same list `pre-push` and an agent run. Reading it from there, and
 * not from the workflow, is what keeps this table checked against what actually runs. */
function checksRunByGate(): Set<string> {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  return new Set(readCheckList(pkg));
}

/** Checks docs/04-hooks-and-ci.md §5's pipeline diagram names for a later slice — not in the gate
 * yet because their subject doesn't exist yet (matrix status `PLANNED (Sn)`), not because they were
 * forgotten. Sourced from the mermaid diagram's own node labels, not invented here. */
const FUTURE_PLANNED_CHECKS = new Set(['axe', 'perf']);

function checkNamesInCell(cell: string): string[] {
  return [...cell.matchAll(/`([\w:-]+)`/g)].map((m) => m[1]!);
}

/** The spec's own §11 table is the list, so the page above cannot quietly stop at the invariant it
 * happened to know about. `I15` (ADR 0024) landed in `plans/01` and nothing noticed that
 * `docs/01-invariant-guard-matrix.md` still ended at `I14`, because this guard held its own copy of
 * the count. Read the ids instead of counting them. */
function invariantIdsInSpec(): string[] {
  const spec = read('plans/01-domain-architecture.md');
  const section = spec.split(/^## 11\./m)[1] ?? '';
  return [...section.matchAll(/^\|\s*(I\d+)\s*\|/gm)].map((m) => m[1]!);
}

describe('the invariant guard matrix maps every row to a real check (#43)', () => {
  const matrix = read('docs/01-invariant-guard-matrix.md');
  const rows = parseInvariantRows(matrix);
  const knownChecks = new Set([...checksRunByGate(), ...FUTURE_PLANNED_CHECKS]);

  it('carries one row per invariant `plans/01` §11 declares — the page cannot fall behind the spec', () => {
    expect(rows.map((r) => r.id)).toEqual(invariantIdsInSpec());
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s names a non-blank status', (_id, row) => {
    expect(row.statusCell.length).toBeGreaterThan(0);
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s names at least one gate check', (_id, row) => {
    expect(checkNamesInCell(row.gateCheckCell).length).toBeGreaterThan(0);
  });

  it.each(
    rows.flatMap((r) =>
      checkNamesInCell(r.gateCheckCell).map((check) => [`${r.id}: ${check}`, check] as const),
    ),
  )('%s is a check the gate runs, or a documented future one', (_label, check) => {
    expect(knownChecks.has(check)).toBe(true);
  });
});

// plans/s1.11-close-the-gate/README.md, #43's other half: the coverage above only ever
// read the gate-check column. Thirteen `freegantt/*` rules named in the Mechanism column had no file in
// eslint/rules/ at S1.11's baseline, seven of them on rows claiming `AUTO` — enforced today. This
// closes that: every `freegantt/*` rule on an `AUTO`/`AUTO-PARTIAL` row must be a registered rule;
// `PLANNED (Sn)` rows are exempt (that status *is* "not enforced yet, and here is when").
describe('every freegantt/* rule the matrix claims is enforced is actually registered (D-S1.11-11)', () => {
  const matrix = read('docs/01-invariant-guard-matrix.md');
  const pluginIndex = read('eslint/rules/index.cjs');
  const registeredRules = new Set(
    [...pluginIndex.matchAll(/^\s*'([\w-]+)':\s*require\(/gm)].map((m) => m[1]!),
  );

  it('finds at least one registered rule — guards the parser against a plugin-index rewrite', () => {
    expect(registeredRules.size).toBeGreaterThan(0);
  });

  const rows = [...parseInvariantRows(matrix), ...parseHardRuleRows(matrix)];
  const mentions = rows.flatMap((row) =>
    freegantRuleMentionsInCell(row.mechanismCell).map((mention) => ({
      id: row.id,
      ...mention,
      rowPlanned: /^`?PLANNED \(S\d/.test(row.statusCell),
    })),
  );

  it('finds mentions in both §1 and §2 — guards the section-2 parser against a doc rewrite', () => {
    expect(mentions.length).toBeGreaterThan(10);
  });

  it.each(mentions.map((m) => [`${m.id}: freegantt/${m.rule}`, m] as const))(
    '%s is registered, unless it is honestly marked PLANNED',
    (_label, m) => {
      if (m.rowPlanned || m.plannedNearby) return; // subject doesn't exist yet — nothing to register
      expect(registeredRules.has(m.rule)).toBe(true);
    },
  );
});
