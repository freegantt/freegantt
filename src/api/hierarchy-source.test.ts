// ADR 0020: a plugin states the parent of an Entry, and core owns everything below that answer —
// the child index, `depth`, `descendants()` and the Rollup. ADR 0031 gives a plugin author one door
// onto the seam: declare `hierarchySource` on the plugin definition.
import { describe, expect, it, vi } from 'vitest';
import { Dataset } from './dataset.js';
import { definePlugin } from './define-plugin.js';
import { entryId, fieldRowsOf } from './index.js';
import type { ErrorReport } from './index.js';
import type { EntryInput } from './index.js';

interface PhaseProps {
  phaseId?: string;
  cost?: number;
}

/** Rows whose tree lives in `props.phaseId`, with no `parentId` written anywhere. */
const phaseRows: EntryInput<PhaseProps>[] = [
  { id: 'design', name: 'Design', props: { cost: 0 } },
  { id: 'build', name: 'Build', props: { cost: 0 } },
  { id: 'sketch', name: 'Sketch', props: { phaseId: 'design', cost: 10 } },
  { id: 'review', name: 'Review', props: { phaseId: 'design', cost: 5 } },
  { id: 'wire', name: 'Wire', props: { phaseId: 'build', cost: 7 } },
];

/** The ADR's own example: the phase id when there is one, otherwise whatever the next source says.
 *  One plugin declares the Field it reads and declares the source that reads it. */
const phases = () =>
  definePlugin<PhaseProps>({
    id: 'demo.phases',
    fields: [{ key: 'phaseId' }],
    hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry),
  });

function phaseDataset(entries: EntryInput<PhaseProps>[] = phaseRows): Dataset<PhaseProps> {
  return new Dataset<PhaseProps>({
    timeZone: 'UTC',
    entries,
    fields: [{ key: 'cost', rollUp: 'sum' }],
    plugins: [phases()],
  });
}

describe('a plugin source answers the tree, and every door follows it', () => {
  it('children(), parent(), depth and descendants() all read the plugin tree', () => {
    const dataset = phaseDataset();

    expect(
      dataset.entries
        .get('design')
        ?.children()
        .map((child) => child.id),
    ).toEqual(['sketch', 'review']);
    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
    expect(dataset.entries.get('sketch')?.depth).toBe(1);
    expect(dataset.entries.get('design')?.hasChildren).toBe(true);
    expect(
      dataset.entries
        .get('design')
        ?.descendants()
        .map((row) => row.id),
    ).toEqual(['sketch', 'review']);
    // `read('parentId')` answers the stored value (ADR 0024) — "design" has none, and "sketch" was
    // never given one; only `props.phaseId` says where it sits. `hierarchyParentId` is the tree door.
    expect(dataset.entries.get('design')?.read('parentId')).toBeUndefined();
    expect(dataset.entries.get('sketch')?.read('parentId')).toBeUndefined();
    expect(dataset.entries.get('sketch')?.read('hierarchyParentId')).toBe('design');
  });

  it('the Rollup follows it, with no second registration', () => {
    const dataset = phaseDataset();

    expect(dataset.entries.get('design')?.read('cost')).toBe(15);
    expect(dataset.entries.get('build')?.read('cost')).toBe(7);
  });

  it('a declared source nests, and the construction Rollup follows it', () => {
    // Two plugins each declare `hierarchySource` (ADR 0031). `demo.passthrough` sets up after
    // `demo.phases` (`requires`), wraps its answer, and falls through for every row here, so
    // `phases`'s tree is untouched: `design` still totals 15.
    const passthrough = () =>
      definePlugin({
        id: 'demo.passthrough',
        requires: ['demo.phases'],
        hierarchySource: (next) => (entry) => (entry.id === 'nobody' ? 'design' : next(entry)),
      });
    const dataset = new Dataset<PhaseProps>({
      timeZone: 'UTC',
      entries: phaseRows,
      fields: [{ key: 'cost', rollUp: 'sum' }],
      plugins: [passthrough(), phases()],
    });

    // The construction Rollup already walked the composed tree by the time the constructor
    // returns — both plugins are done declaring, and neither ran a `data()` call to compose it.
    expect(dataset.entries.get('design')?.read('cost')).toBe(15);
    expect(dataset.entries.get('build')?.read('cost')).toBe(7);
  });

  it('an untyped plugin reads props as a Record', () => {
    // No `TProps` named, so `definePlugin` resolves the untyped `DataPlugin<unknown>` arm. `props`
    // still reads as `Record<string, unknown>`, not `unknown` — a bracket read compiles with no
    // `@ts-expect-error`, which pins the type-level fallback `PropsOf` falls back to.
    const untyped = () =>
      definePlugin({
        id: 'demo.untyped',
        hierarchySource: (next) => (entry) => (entry.props['group'] as string | undefined) ?? next(entry),
      });
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'A' }],
      plugins: [untyped()],
    });

    expect(dataset.entries.get('a')?.parent()).toBeUndefined();
  });

  it('a source overrides a stored parentId that says something else', () => {
    const dataset = phaseDataset([
      { id: 'design', name: 'Design' },
      { id: 'build', name: 'Build' },
      { id: 'sketch', name: 'Sketch', parentId: 'build', props: { phaseId: 'design' } },
    ]);

    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
    expect(dataset.entries.get('build')?.hasChildren).toBe(false);
    // `parentId` is still stored, and `toInput()` still hands back what was written (ADR 0020).
    expect(dataset.entries.get('sketch')?.toInput().parentId).toBe('build');
  });

  it('every by-key door on parentId agrees; hierarchyParentId is the tree door (ADR 0024, #331)', () => {
    // Seven public doors used to ask "what is this row's parentId" and split three ways (#299).
    // ADR 0024 settled it: `parentId` names the stored value, on every door, and the tree gets its
    // own key, `hierarchyParentId`. This test states both, so a future divergence turns it red.
    const dataset = new Dataset<PhaseProps>({
      timeZone: 'UTC',
      entries: [
        { id: 'design', name: 'Design' },
        { id: 'build', name: 'Build' },
        { id: 'archive', name: 'Archive' },
        { id: 'sketch', name: 'Sketch', parentId: 'build', props: { phaseId: 'design' } },
      ],
      fields: [
        { key: 'cost', rollUp: 'sum' },
        // A `compute` Field is the only way a test outside `data/` reaches `ctx.read`.
        { key: 'probeParentId', compute: (_entry, ctx) => ctx.read('parentId') },
        // An Aggregator is always a registered name, never an inline function (CLAUDE.md), so the
        // only way a test reaches `ctx.values` is through one declared here.
        { key: 'parentIdsSeenByRollup', rollUp: 'collectParentIds' },
      ],
      aggregators: {
        collectParentIds: (_parent, ctx) => ctx.values('parentId'),
      },
      plugins: [phases()],
    });

    const sketch = dataset.entries.get('sketch')!;

    // Door 1 — `entry.read('parentId')`: answers the stored field (ADR 0024).
    expect(sketch.read('parentId')).toBe('build');
    // Door 2 — `entry.parent()?.id`: the tree door. Disagrees with door 1, on purpose — the plugin
    // owns the tree and never consults `parentId`.
    expect(sketch.parent()?.id).toBe('design');
    // Door 2b — `entry.read('hierarchyParentId')`: the tree door, by key. Agrees with door 2.
    expect(sketch.read('hierarchyParentId')).toBe('design');
    // Door 3 — `entry.toInput().parentId`: the copy door. Answers the stored field, same as door 1.
    expect(sketch.toInput().parentId).toBe('build');
    // Door 4 — `ctx.read('parentId')` inside a `compute` Field: the pass door. Agrees with door 1.
    expect(sketch.read('probeParentId')).toBe('build');
    // Door 5 — `entries.storedValues.get(id).parentId`: the store's own index. Stored field.
    expect(dataset.entries.storedValues.get(entryId('sketch'))?.parentId).toBe('build');
    // Door 6 — `ctx.values('parentId')` inside an Aggregator: folds each child through the same pass
    // door as door 4, so it also answers the stored field. "design"'s plugin-tree child is "sketch".
    expect(dataset.entries.get('design')?.read('parentIdsSeenByRollup')).toEqual(['build']);

    // Door 7 — the `ChangeSet` row a `parentId` write produces.
    let recordedTo: unknown;
    dataset.on('change', ({ changeSet }) => {
      recordedTo = fieldRowsOf(changeSet).find((row) => row.field === 'parentId')?.to;
    });
    dataset.entries.update('sketch', { parentId: 'archive' });
    expect(recordedTo).toBe('archive');
    // Door 1 now moves with the write it names; door 2 does not — the plugin source never
    // consulted the stored field it just changed.
    expect(dataset.entries.get('sketch')?.read('parentId')).toBe('archive');
    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
  });

  it('two sources compose: the second receives the first and may call it', () => {
    const overrideOne = () =>
      definePlugin({
        id: 'demo.pin',
        requires: ['demo.phases'],
        hierarchySource: (next) => (entry) => (entry.id === 'wire' ? 'design' : next(entry)),
      });
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: phaseRows,
      plugins: [overrideOne(), phases()],
    });

    expect(dataset.entries.get('wire')?.parent()?.id).toBe('design');
    // The first source still answers every row the second passes on.
    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
    expect(dataset.entries.get('build')?.hasChildren).toBe(false);
  });
});

describe('core refuses an answer it cannot use, and keeps drawing', () => {
  /** Core raises a refused answer where it happens, and construction happens before a
   *  consumer can subscribe — so the `console` fallback is what a construction-time refusal reaches,
   *  exactly as the construction Rollup's own `derived-values-dropped` report does. Every case below
   *  reads the fallback for the construction half and the `error` event for every revision after. */
  function captureWarnings(): string[] {
    const lines: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    return lines;
  }

  it('a cyclic answer reports a Fault by "plugin", and the Entry reads as a root', () => {
    const loop = () =>
      definePlugin({
        id: 'demo.loop',
        hierarchySource: () => (entry) => (entry.id === 'a' ? 'b' : 'a'),
      });
    const warnings = captureWarnings();
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      plugins: [loop()],
    });

    // The construction check is the news — nothing has read a row yet.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('the source makes "b" its own ancestor');

    // `a` answers `b`, `b` answers `a`. The chain walks from `a`, so `b`'s answer closes it.
    expect(dataset.entries.get('b')?.parent()).toBeUndefined();
    expect(dataset.entries.get('a')?.parent()?.id).toBe('b');

    const reports: ErrorReport[] = [];
    dataset.on('error', (report) => {
      reports.push(report);
    });
    dataset.entries.update('a', { name: 'A2' });
    expect(reports.map((report) => [report.code, report.by, report.entryId])).toEqual([
      ['hierarchy-cycle', 'plugin', 'b'],
    ]);
  });

  it('an error handler reading the tree during the raise sees the committed answer', () => {
    // The source stays acyclic through construction, then a commit turns it cyclic — the raise this
    // test checks only fires on that commit, never on construction.
    let cyclic = false;
    const loop = () =>
      definePlugin({
        id: 'demo.loop',
        hierarchySource: () => (entry) => {
          if (!cyclic) return entry.id === 'a' ? 'b' : undefined;
          return entry.id === 'a' ? 'b' : 'a';
        },
      });
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      plugins: [loop()],
    });

    cyclic = true;
    const seenDuringRaise: (string | undefined)[] = [];
    dataset.on('error', () => {
      seenDuringRaise.push(dataset.entries.get('b')?.parent()?.id);
    });
    dataset.entries.update('a', { name: 'A2' });

    // The chain walks from `a`, so `b`'s cyclic answer is the one refused, and `b` reads as a root —
    // the checked tree the raise itself reports. The write set's own raw answer would read `b` as a
    // child of `a` instead: this handler must see the checked answer, not that one, during the raise.
    expect(seenDuringRaise).toEqual([undefined]);
  });

  it('an unknown parent id reads as a root, and reports once per revision', () => {
    const ghost = () =>
      definePlugin({
        id: 'demo.ghost',
        hierarchySource: () => (entry) => (entry.id === 'a' ? 'nobody' : undefined),
      });
    const warnings = captureWarnings();
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      plugins: [ghost()],
    });

    expect(warnings).toEqual([
      'FreeGantt: hierarchy: the source names "nobody" as the parent of "a", and no Entry holds that id. "a" reads as a root.',
    ]);

    expect(dataset.entries.get('a')?.parent()).toBeUndefined();
    expect(dataset.entries.get('a')?.depth).toBe(0);
    // Four reads, one revision, and not one more report: reading asks the memoized answer.
    dataset.entries.get('a')?.children();
    dataset.entries.get('b')?.parent();
    expect(warnings).toHaveLength(1);

    const reports: ErrorReport[] = [];
    dataset.on('error', (report) => {
      reports.push(report);
    });
    dataset.entries.update('b', { name: 'B2' });
    dataset.entries.get('a')?.parent();
    expect(reports.map((report) => [report.code, report.by, report.entryId])).toEqual([
      ['unknown-parent', 'plugin', 'a'],
    ]);
  });

  it('an unknown parent warns once, even when the construction Rollup writes rows elsewhere', () => {
    const ghost = () =>
      definePlugin({
        id: 'demo.ghost',
        fieldTypes: { money: { rollUp: 'sum' } },
        fields: [{ key: 'cost', type: 'money' }],
        hierarchySource: () => (entry) => (entry.id === 'a' ? 'nobody' : entry.parentId),
        data() {},
      });
    const warnings = captureWarnings();
    new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'p', name: 'P' },
        { id: 'c', name: 'C', parentId: 'p', props: { cost: 500 } },
      ],
      plugins: [ghost()],
    });

    expect(warnings).toHaveLength(1);
  });

  it('warns once for a refusal that exists only after the construction Rollup writes rows', () => {
    // The source reads a rolled-up Field: "p" holds no cost of its own until the Rollup sums its
    // child's, so this refusal cannot exist before that write lands.
    const ghost = () =>
      definePlugin({
        id: 'demo.ghost',
        fieldTypes: { money: { rollUp: 'sum' } },
        fields: [{ key: 'cost', type: 'money' }],
        hierarchySource: () => (entry) => {
          const cost = (entry.props as { cost?: number }).cost;
          return entry.id === 'p' && cost === 500 ? 'nobody' : entry.parentId;
        },
        data() {},
      });
    const warnings = captureWarnings();
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'root', name: 'Root' },
        { id: 'p', name: 'P', parentId: 'root' },
        { id: 'c', name: 'C', parentId: 'p', props: { cost: 500 } },
      ],
      plugins: [ghost()],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"p"');
    expect(dataset.entries.get('p')?.parent()).toBeUndefined();
  });

  it('a commit that nothing reads still reports', () => {
    const ghost = () =>
      definePlugin({
        id: 'demo.ghost',
        hierarchySource: () => (entry) => (entry.id === 'c' ? 'nobody' : undefined),
      });
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'A' }],
      plugins: [ghost()],
    });
    const reports: ErrorReport[] = [];
    dataset.on('error', (report) => {
      reports.push(report);
    });

    // No row is read after this add, and no Gantt is bound. The commit is the report's occasion.
    dataset.entries.add({ id: 'c', name: 'C' });

    expect(reports.map((report) => [report.code, report.by, report.entryId])).toEqual([
      ['unknown-parent', 'plugin', 'c'],
    ]);
  });

  it('a raw dangling parentId throws at construction, with no plugin installed', () => {
    // Construction checks the raw batch the same way `load` does (ADR 0031) — a dangling
    // parentId no longer reaches the plugin source or a construction-time warning at all.
    expect(
      () => new Dataset({ timeZone: 'UTC', entries: [{ id: 'a', name: 'A', parentId: 'nope' }] }),
    ).toThrow('new Dataset: there is no entry with id "nope". Check the id, or add the entry first.');
  });

  it("a plugin that falls through still names the consumer's own parentId", () => {
    // A sound batch at construction: `sketch`'s raw parentId and its `phaseId` both name a real
    // entry, so nothing refuses yet. Removing `build` and then clearing `phaseId` makes the plugin
    // source fall through to the now-dangling raw value, at runtime — the door this case is about.
    const dataset = new Dataset<PhaseProps>({
      timeZone: 'UTC',
      entries: [
        { id: 'design', name: 'Design' },
        { id: 'build', name: 'Build' },
        { id: 'sketch', name: 'Sketch', parentId: 'build', props: { phaseId: 'design' } },
      ],
      plugins: [phases()],
    });

    const reports: ErrorReport[] = [];
    dataset.on('error', (report) => {
      reports.push(report);
    });
    dataset.entries.remove('build');
    dataset.entries.update('sketch', { phaseId: undefined });
    expect(reports.map((report) => [report.code, report.by])).toEqual([['unknown-parent', 'consumer']]);
    expect(reports[0]?.message).toBe(
      'hierarchy: the row\'s own parentId names "build" as the parent of "sketch", and no Entry holds that id. "sketch" reads as a root.',
    );
  });

  it('a write to parentId still lands, and raises no warning, while a source ignores it', () => {
    const reports: ErrorReport[] = [];
    const dataset = phaseDataset();
    dataset.on('error', (report) => {
      reports.push(report);
    });

    dataset.entries.update('sketch', { parentId: 'build' });

    expect(dataset.entries.get('sketch')?.toInput().parentId).toBe('build');
    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
    expect(reports).toEqual([]);
  });
});

describe('the Rollup follows the source when a row moves', () => {
  it('a move under the plugin tree rolls up the old parent and the new one', () => {
    const dataset = phaseDataset();
    expect(dataset.entries.get('design')?.read('cost')).toBe(15);
    expect(dataset.entries.get('build')?.read('cost')).toBe(7);

    // No `parentId` is written here: the source reads `props.phaseId`, so the move is a props edit.
    dataset.entries.update('sketch', { phaseId: 'build' });

    expect(dataset.entries.get('design')?.read('cost')).toBe(5);
    expect(dataset.entries.get('build')?.read('cost')).toBe(17);
  });

  it("clearing the key hands the row back to the tree core's own source answers", () => {
    const dataset = phaseDataset([
      { id: 'design', name: 'Design' },
      { id: 'build', name: 'Build' },
      { id: 'sketch', name: 'Sketch', parentId: 'design', props: { phaseId: 'build' } },
    ]);
    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('build');

    dataset.entries.update('sketch', { phaseId: undefined });

    expect(dataset.entries.get('sketch')?.parent()?.id).toBe('design');
    expect(dataset.entries.get('build')?.hasChildren).toBe(false);
  });

  it('a row that leaves its last sibling behind demotes the parent it left', () => {
    const dataset = phaseDataset();

    dataset.entries.update('wire', { phaseId: 'design' });

    expect(dataset.entries.get('build')?.hasChildren).toBe(false);
    expect(dataset.entries.get('build')?.read('cost')).toBeUndefined();
    expect(dataset.entries.get('design')?.read('cost')).toBe(22);
  });

  it('the same move inside one transaction reads its own tree while the transaction is open', () => {
    const dataset = phaseDataset();

    dataset.transaction(() => {
      dataset.entries.update('sketch', { phaseId: 'build' });
      expect(
        dataset.entries
          .get('build')
          ?.children()
          .map((row) => row.id),
      ).toEqual(['wire', 'sketch']);
      expect(dataset.entries.get('sketch')?.parent()?.id).toBe('build');
      expect(dataset.entries.get('sketch')?.depth).toBe(1);
    });

    expect(dataset.entries.get('build')?.read('cost')).toBe(17);
  });
});

describe('the cost shape holds with a source installed', () => {
  it('reading children inside an open transaction asks the source O(children + edits) times', () => {
    const asked = vi.fn<(id: string) => void>();
    const counting = () =>
      definePlugin<PhaseProps>({
        id: 'demo.counting',
        fields: [{ key: 'phaseId' }],
        hierarchySource: (next) => (entry) => {
          asked(entry.id);
          return entry.props.phaseId ?? next(entry);
        },
      });
    // One small family inside a large dataset: the answer must cost the family, never the dataset.
    const rows: EntryInput<PhaseProps>[] = [{ id: 'design', name: 'Design' }];
    for (let index = 0; index < 3; index += 1) {
      rows.push({ id: `child${index}`, name: `Child ${index}`, props: { phaseId: 'design' } });
    }
    for (let index = 0; index < 500; index += 1) {
      rows.push({ id: `root${index}`, name: `Root ${index}` });
    }
    const dataset = new Dataset<PhaseProps>({ timeZone: 'UTC', entries: rows, plugins: [counting()] });

    dataset.transaction(() => {
      dataset.entries.update('root0', { name: 'Renamed' });
      asked.mockClear();
      expect(dataset.entries.get('design')?.children()).toHaveLength(3);
      // Three committed children, plus the one row this transaction staged. A source that took the
      // whole dataset would make this O(dataset) per query — the shape finding S1 (#212) killed.
      expect(asked.mock.calls.length).toBeLessThanOrEqual(4);

      asked.mockClear();
      expect(dataset.entries.get('design')?.hasChildren).toBe(true);
      expect(asked.mock.calls.length).toBeLessThanOrEqual(4);
    });
  });
});
