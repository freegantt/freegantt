// ADR 0020: a plugin states the parent of an Entry, and core owns everything below that answer —
// the child index, `depth`, `descendants()` and the Rollup. Every case here goes through the public
// door a plugin author writes, `ctx.hierarchy.setSource`.
import { describe, expect, it, vi } from 'vitest';
import { Dataset } from './dataset.js';
import { definePlugin } from './define-plugin.js';
import { RegistrationClosedError } from './index.js';
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
 *  One plugin declares the Field it reads and claims the seam that reads it. */
const phases = () =>
  definePlugin({
    id: 'demo.phases',
    data(ctx) {
      ctx.fields.register({ key: 'phaseId' });
      ctx.hierarchy.setSource<PhaseProps>((next) => (entry) => entry.props.phaseId ?? next(entry));
    },
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
    expect(dataset.entries.get('design')?.read('parentId')).toBeUndefined();
    expect(dataset.entries.get('sketch')?.read('parentId')).toBe('design');
  });

  it('the Rollup follows it, with no second registration', () => {
    const dataset = phaseDataset();

    expect(dataset.entries.get('design')?.read('cost')).toBe(15);
    expect(dataset.entries.get('build')?.read('cost')).toBe(7);
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

  it('two sources compose: the second receives the first and may call it', () => {
    const overrideOne = () =>
      definePlugin({
        id: 'demo.pin',
        requires: ['demo.phases'],
        data(ctx) {
          ctx.hierarchy.setSource((next) => (entry) => (entry.id === 'wire' ? 'design' : next(entry)));
        },
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
  it('a cyclic answer reports a Fault by "plugin", and the Entry reads as a root', () => {
    const loop = () =>
      definePlugin({
        id: 'demo.loop',
        data(ctx) {
          ctx.hierarchy.setSource(() => (entry) => (entry.id === 'a' ? 'b' : 'a'));
        },
      });
    const reports: ErrorReport[] = [];
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      plugins: [loop()],
    });
    dataset.on('error', (report) => {
      reports.push(report);
    });

    // `a` claims `b`, `b` claims `a`. The chain walks from `a`, so `b`'s answer closes it.
    expect(dataset.entries.get('b')?.parent()).toBeUndefined();
    expect(dataset.entries.get('a')?.parent()?.id).toBe('b');
    expect(reports.map((report) => [report.code, report.by, report.entryId])).toEqual([
      ['hierarchy-cycle', 'plugin', 'b'],
    ]);
  });

  it('an unknown parent id reads as a root, and reports once per revision', () => {
    const ghost = () =>
      definePlugin({
        id: 'demo.ghost',
        data(ctx) {
          ctx.hierarchy.setSource(() => (entry) => (entry.id === 'a' ? 'nobody' : undefined));
        },
      });
    const reports: ErrorReport[] = [];
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      plugins: [ghost()],
    });
    dataset.on('error', (report) => {
      reports.push(report);
    });

    expect(dataset.entries.get('a')?.parent()).toBeUndefined();
    expect(dataset.entries.get('a')?.depth).toBe(0);
    // Four reads, one revision, one report.
    dataset.entries.get('a')?.children();
    dataset.entries.get('b')?.parent();
    expect(reports.map((report) => [report.code, report.by, report.entryId])).toEqual([
      ['unknown-parent', 'plugin', 'a'],
    ]);

    reports.length = 0;
    dataset.entries.update('b', { name: 'B2' });
    dataset.entries.get('a')?.parent();
    expect(reports.filter((report) => report.code === 'unknown-parent')).toHaveLength(1);
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

describe('the door is closed once the plugin has set up', () => {
  it('a setSource call after data() returns throws RegistrationClosedError', () => {
    let callLate: (() => void) | undefined;
    const late = () =>
      definePlugin({
        id: 'demo.late',
        data(ctx) {
          callLate = () => {
            ctx.hierarchy.setSource((next) => next);
          };
        },
      });
    new Dataset({ timeZone: 'UTC', entries: [{ id: 'a', name: 'A' }], plugins: [late()] });

    expect(() => callLate?.()).toThrow(RegistrationClosedError);
  });
});

describe('the cost shape holds with a source installed', () => {
  it('reading children inside an open transaction asks the source O(children + edits) times', () => {
    const asked = vi.fn<(id: string) => void>();
    const counting = () =>
      definePlugin({
        id: 'demo.counting',
        data(ctx) {
          ctx.fields.register({ key: 'phaseId' });
          ctx.hierarchy.setSource<PhaseProps>((next) => (entry) => {
            asked(entry.id);
            return entry.props.phaseId ?? next(entry);
          });
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
