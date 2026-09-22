import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import * as entryTree from './entry-tree.js';
import * as hierarchySource from './hierarchy-source.js';
import { AggregatorFailedError, entryId } from '../model/index.js';
import type { ChangeSet, EntryEdits, ErrorReport, Instant } from '../model/index.js';
import { MS, diffMs, toEndInstant, toInstant } from '../time/index.js';

function treeDataset(
  entries: {
    id: string;
    parentId?: string;
    start?: string;
    end?: string;
    props?: { cost?: number };
  }[],
) {
  return new DatasetState({
    entries: entries.map((e) => ({
      name: e.id,
      start: e.start ?? '2026-01-01',
      end: e.end ?? '2026-01-10',
      ...e,
    })),
    timeZone: 'UTC',
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
}

function costOf(state: DatasetState, id: string): number | undefined {
  return state.entries.get(id)?.read('cost') as number | undefined;
}

describe('rollUpFields (S4.2)', () => {
  it('construction writes parent props.cost from children (ADR 0011)', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'a', parentId: 'root', props: { cost: 40 } },
      { id: 'b', parentId: 'root', props: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    expect(state.entries.get('root')!.read('cost')).toBe(100);
  });

  it('sum rolls cost up two levels in one commit', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'mid', parentId: 'root' },
      { id: 'leaf', parentId: 'mid', props: { cost: 100 } },
    ]);

    state.entries.update('leaf', { cost: 250 });

    expect(costOf(state, 'mid')).toBe(250);
    expect(costOf(state, 'root')).toBe(250);
  });

  it('#270: a declining Aggregator clears a stale parent value and reports the clear', () => {
    const state = treeDataset([{ id: 'p' }, { id: 'c', parentId: 'p', props: { cost: 10 } }]);

    expect(costOf(state, 'p')).toBe(10);

    let changeSet: ChangeSet | undefined;
    state.on('change', ({ changeSet: cs }) => {
      changeSet = cs;
    });

    // `sum` over no numeric values answers `undefined` — no opinion. On a roll-up parent that
    // has no referent: nothing but the Rollup may write this cell (`view/capability.ts`), so
    // there is no authored value the parent could be falling back to. The clear must land, and
    // it must be reported.
    state.entries.update('c', { cost: undefined });

    expect(costOf(state, 'p')).toBeUndefined();

    expect(changeSet).toBeDefined();
    const parentCost = changeSet!.updated.find(
      (row) => row.store === 'entries' && row.id === entryId('p') && row.field === 'cost',
    );
    expect(parentCost).toEqual({
      store: 'entries',
      id: entryId('p'),
      field: 'cost',
      from: 10,
      to: undefined,
    });
  });

  // `rollUpKinds`/`hierarchy.autoGroup` (a per-kind opt-out of rolling up) were retired end to end
  // by ADR 0013: a Field rolls up for every Entry that has children, with no kind to opt out by.
  // Their two tests are gone with the feature, not weakened.

  it('[S4-A8] an empty group keeps its zero-length span, then gains a real one when a child arrives', () => {
    const state = new DatasetState({
      entries: [{ id: 'g1', name: 'g1' }],
      timeZone: 'UTC',
    });
    const g1 = state.entries.get('g1')!;
    expect(g1.start).toBe(g1.end);

    state.entries.add({
      id: 'c1',
      parentId: 'g1',
      name: 'c1',
      start: '2026-03-01',
      end: '2026-03-05',
    });

    const rolled = state.entries.get('g1')!;
    expect(rolled.start).toBe(toInstant('UTC', '2026-03-01'));
    expect(rolled.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive'));
  });

  it('D-S4-9: a throwing Aggregator raises AggregatorFailedError and commits nothing', () => {
    let rollupCalls = 0;
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1' },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', props: { cost: 1 } },
      ],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      aggregators: {
        sum: (_parent, ctx) => {
          rollupCalls += 1;
          if (rollupCalls > 1) throw new Error('boom');
          let total = 0;
          for (const value of ctx.numericValues('cost')) total += value;
          return total;
        },
      },
    });
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    expect(() => state.entries.update('c1', { cost: 2 })).toThrow(AggregatorFailedError);
    try {
      state.entries.update('c1', { cost: 2 });
    } catch (error) {
      expect(error).toBeInstanceOf(AggregatorFailedError);
      expect((error as AggregatorFailedError).cause).toBeInstanceOf(Error);
      expect(((error as AggregatorFailedError).cause as Error).message).toBe('boom');
    }
    expect(fired).toBe(false);
    expect(costOf(state, 'c1')).toBe(1);
    expect(state.canUndo).toBe(false);
  });

  it('[S4-A1] undo reverts a rolled-up parent cost with the child edit in one step', () => {
    const state = treeDataset([{ id: 'root' }, { id: 'leaf', parentId: 'root', props: { cost: 100 } }]);

    state.entries.update('leaf', { cost: 500 });
    expect(costOf(state, 'root')).toBe(500);

    state.undo();
    expect(costOf(state, 'leaf')).toBe(100);
    expect(costOf(state, 'root')).toBe(100);
  });

  it('a parent whose Field has rollUp: none keeps its cost while span still rolls up', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', props: { notes: 5 } },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', props: { notes: 2 } },
      ],
      timeZone: 'UTC',
      fieldTypes: { tally: { rollUp: 'sum' } },
      fields: [{ key: 'notes', type: 'tally', rollUp: 'none' }],
    });

    state.entries.update('c1', { start: '2026-06-01', end: '2026-06-05', notes: 9 });

    const parent = state.entries.get('p1')!;
    expect(parent.read('notes')).toBe(5);
    expect(parent.start).toBe(toInstant('UTC', '2026-06-01'));
  });
  describe('#470: a core Field may opt out of the Rollup with rollUp: none', () => {
    it('a parent whose start/end opt out keeps its authored dates, and the Rollup writes neither', () => {
      const state = new DatasetState({
        entries: [
          { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-01-05' },
          { id: 'c1', name: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-10' },
        ],
        timeZone: 'UTC',
        fields: [
          { key: 'start', rollUp: 'none' },
          { key: 'end', rollUp: 'none' },
        ],
      });

      let changeSet: ChangeSet | undefined;
      state.on('change', ({ changeSet: cs }) => {
        changeSet = cs;
      });
      state.entries.update('c1', { start: '2026-06-01', end: '2026-06-10' });

      const parent = state.entries.get('p1')!;
      expect(parent.start).toBe(toInstant('UTC', '2026-01-01'));
      expect(parent.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
      expect(changeSet).toBeDefined();
      const parentWrite = changeSet!.updated.find(
        (row) => row.store === 'entries' && row.id === entryId('p1'),
      );
      expect(parentWrite).toBeUndefined();
    });

    it('a dated leaf that gains a child keeps its authored dates (promotion writes nothing)', () => {
      const state = new DatasetState({
        entries: [{ id: 'leaf', name: 'leaf', start: '2026-01-01', end: '2026-01-05' }],
        timeZone: 'UTC',
        fields: [
          { key: 'start', rollUp: 'none' },
          { key: 'end', rollUp: 'none' },
        ],
      });

      state.entries.add({ id: 'child', name: 'child', parentId: 'leaf' });

      const promoted = state.entries.get('leaf')!;
      expect(promoted.start).toBe(toInstant('UTC', '2026-01-01'));
      expect(promoted.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
    });

    it('a parent that loses its last child keeps its authored dates (demotion clears nothing)', () => {
      const state = new DatasetState({
        entries: [
          { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-01-05' },
          { id: 'c1', name: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-10' },
        ],
        timeZone: 'UTC',
        fields: [
          { key: 'start', rollUp: 'none' },
          { key: 'end', rollUp: 'none' },
        ],
      });

      state.entries.remove('c1');

      const demoted = state.entries.get('p1')!;
      expect(demoted.start).toBe(toInstant('UTC', '2026-01-01'));
      expect(demoted.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
    });
  });

  it('reparenting recomputes both the old and new parent', () => {
    // `a` keeps a second child (`d`) so the reparent below does not also demote it (ADR 0013) —
    // this test's claim is the recompute on both sides, not the demotion clear hierarchy.test.ts
    // already covers.
    const state = treeDataset([
      { id: 'a' },
      { id: 'b' },
      { id: 'c', parentId: 'a', props: { cost: 10 } },
      { id: 'd', parentId: 'a', props: { cost: 5 } },
    ]);

    state.entries.update('c', { parentId: 'b', cost: 20 });

    expect(costOf(state, 'a')).toBe(5);
    expect(costOf(state, 'b')).toBe(20);
  });

  describe('ADR 0013, decision 5/6: one report when the Rollup drops a value nobody may keep', () => {
    it('construction drops an authored value on a parent whose only child has none, and raises one report', () => {
      const reports: ErrorReport[] = [];
      // `installPlugins` runs before `applyConstructionRollUp` (dataset-state.ts), so it is the one
      // door onto the Dataset that exists early enough to observe a construction-time report — the
      // constructor itself has not returned yet when a consumer could otherwise call `state.on(...)`.
      const state = new DatasetState({
        entries: [
          { id: 't1', name: 'p1', props: { cost: 500 } },
          { id: 't2', name: 'c1', parentId: 't1' },
        ],
        timeZone: 'UTC',
        fieldTypes: { money: { rollUp: 'sum' } },
        fields: [{ key: 'cost', type: 'money' }],
        installPlugins: (installing) => {
          installing.on('error', (report) => {
            reports.push(report);
          });
          return () => {};
        },
      });

      expect(costOf(state, 't1')).toBeUndefined();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('derived-values-dropped');
      expect(reports[0]?.severity).toBe('warning');
      expect(reports[0]?.message).toContain('"cost"');
      expect(reports[0]?.message).toContain('"t1"');
    });

    it("a batch of add() calls in one transaction drops the new parent's authored value, one report", () => {
      const reports: ErrorReport[] = [];
      const state = treeDataset([{ id: 'x' }]);
      state.on('error', (report) => {
        reports.push(report);
      });

      state.transaction(() => {
        state.entries.add({ id: 'p1', name: 'p1', props: { cost: 500 } });
        state.entries.add({ id: 'c1', name: 'c1', parentId: 'p1' });
      });

      expect(costOf(state, 'p1')).toBeUndefined();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('derived-values-dropped');
      expect(reports[0]?.severity).toBe('warning');
      expect(reports[0]?.message).toContain('"cost"');
      expect(reports[0]?.message).toContain('"p1"');
    });

    it("a plugin cascade's write to a rolling-up parent cell is dropped, and raises one report", () => {
      const reports: ErrorReport[] = [];
      const state = new DatasetState({
        entries: [
          { id: 'p1', name: 'p1' },
          { id: 'c1', name: 'c1', parentId: 'p1', props: { cost: 10 } },
        ],
        timeZone: 'UTC',
        fieldTypes: { money: { rollUp: 'sum' } },
        fields: [{ key: 'cost', type: 'money' }],
        // A cascade that reaches for the Rollup's own cell — the write lands in `merged`, never
        // `body`, so `rollup.ts` overwrites it rather than yielding (D-S2-22 is the body's alone).
        editExtender: (): EntryEdits => new Map([[entryId('p1'), { cost: 999 }]]),
      });
      state.on('error', (report) => {
        reports.push(report);
      });

      state.entries.update('c1', { name: 'c1 renamed' });

      expect(costOf(state, 'p1')).toBe(10); // the Rollup's own answer wins, not the cascade's 999
      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('derived-values-dropped');
      expect(reports[0]?.severity).toBe('warning');
      expect(reports[0]?.message).toContain('cascade');
      expect(reports[0]?.message).toContain('"cost"');
    });

    // Q39: `start`/`end` are ordinary rolling-up Fields now (ADR 0026 retired the Segment that used
    // to make them a derived pair), so an `EditExtender` cascade that proposes one on a rolling-up
    // parent hits this same mechanism — not a throw `gesture-pipeline.ts`'s commit path must catch,
    // but the Rollup silently overwriting the cascade's proposal and reporting the drop, exactly as
    // it already does for `cost` above. D-S5-44's "the cascade owes the envelope invariant a plain
    // refusal" holds; only which door enforces it moved, from an ingest-time throw to this report.
    it("a plugin cascade's write to a rolling-up parent's start is dropped, and raises one report", () => {
      const reports: ErrorReport[] = [];
      const state = new DatasetState({
        entries: [
          { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-02-10' },
          { id: 'c1', name: 'c1', parentId: 'p1', start: '2026-02-01', end: '2026-02-10' },
        ],
        timeZone: 'UTC',
        // A cascade that reaches for the Rollup's own cell — the write lands in `merged`, never
        // `body`, so `rollup.ts` overwrites it rather than yielding. Picked inside the parent's
        // existing span so this reconciles cleanly and reaches the Rollup pass, rather than tripping
        // `InvertedSpanError` first — that inversion case is the extender-bug path #332 already
        // covers, a fault, not this decision-5 refusal.
        editExtender: (): EntryEdits => new Map([[entryId('p1'), { start: '2026-01-15' }]]),
      });
      state.on('error', (report) => {
        reports.push(report);
      });

      state.entries.update('c1', { name: 'c1 renamed' });

      const parent = state.entries.get('p1')!;
      // The Rollup's own answer wins — the earliest child's start — not the cascade's 2026-01-15.
      expect(parent.start).toBe(toInstant('UTC', '2026-02-01'));
      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('derived-values-dropped');
      expect(reports[0]?.severity).toBe('warning');
      expect(reports[0]?.message).toContain('cascade');
      expect(reports[0]?.message).toContain('"start"');
    });
  });

  describe('D-S4-8 / P1 — rollup after child removal', () => {
    it('[P1 regression] the review probe: parent cost drops when the cheaper child is removed', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      expect(costOf(state, 'p')).toBe(15);

      state.entries.remove('b');

      expect(costOf(state, 'p')).toBe(10);
      expect(state.entries.get('p')!.read('cost')).toBe(10);
    });

    it('[P1 regression] removing the child that extended the parent span shrinks start/end', () => {
      const state = treeDataset([
        { id: 'p', start: '2026-01-01', end: '2026-01-10' },
        { id: 'a', parentId: 'p', start: '2026-01-01', end: '2026-01-05', props: { cost: 10 } },
        { id: 'b', parentId: 'p', start: '2026-06-01', end: '2026-06-10', props: { cost: 5 } },
      ]);

      const before = state.entries.get('p')!;
      expect(before.end).toBe(toEndInstant('UTC', '2026-06-10', 'inclusive'));

      state.entries.remove('b');

      const after = state.entries.get('p')!;
      expect(costOf(state, 'p')).toBe(10);
      expect(after.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
      expect(after.start).toBe(toInstant('UTC', '2026-01-01'));
    });

    it('[P1 / D-S4-8] removing a grandchild recomputes every roll-up ancestor in one commit', () => {
      const state = treeDataset([
        { id: 'root' },
        { id: 'mid', parentId: 'root' },
        { id: 'leaf', parentId: 'mid', props: { cost: 100 } },
        { id: 'sibling', parentId: 'mid', props: { cost: 25 } },
      ]);

      expect(costOf(state, 'mid')).toBe(125);
      expect(costOf(state, 'root')).toBe(125);

      state.entries.remove('leaf');

      expect(costOf(state, 'mid')).toBe(25);
      expect(costOf(state, 'root')).toBe(25);
    });

    it('[P1] undo restores the parent aggregate with the removed child', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      state.entries.remove('b');
      expect(costOf(state, 'p')).toBe(10);
      expect(state.entries.has('b')).toBe(false);

      state.undo();

      expect(state.entries.has('b')).toBe(true);
      expect(costOf(state, 'p')).toBe(15);
      expect(costOf(state, 'b')).toBe(5);
    });

    it('[P1] removal records the parent rollup in the changeset', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      let changeSet: ChangeSet | undefined;
      state.on('change', ({ changeSet: cs }) => {
        changeSet = cs;
      });

      state.entries.remove('b');

      expect(changeSet).toBeDefined();
      const parentCost = changeSet!.updated.find(
        (row) => row.store === 'entries' && row.id === entryId('p') && row.field === 'cost',
      );
      expect(parentCost).toEqual({
        store: 'entries',
        id: entryId('p'),
        field: 'cost',
        from: 15,
        to: 10,
      });
    });
  });

  it('D-S4-11: every store child counts toward the parent, including one a view would hide', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'visible', parentId: 'root', props: { cost: 40 } },
      { id: 'hidden', parentId: 'root', props: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    state.entries.update('visible', { cost: 50 });
    expect(costOf(state, 'hidden')).toBe(60);
    expect(costOf(state, 'root')).toBe(110);
  });
});

// ADR 0017: each child a Rollup reads is an *effective* row — the store, plus this transaction's
// edits, plus the values this same bottom-up pass already produced for that child. A pass that read
// the committed row instead would stop rolling up at the first level.
describe('an Aggregator reads this pass’s own children (ADR 0017)', () => {
  it('reads the value the same pass gave a child, not the committed one, across two levels', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'mid', parentId: 'root' },
      { id: 'leafA', parentId: 'mid', props: { cost: 10 } },
      { id: 'leafB', parentId: 'mid', props: { cost: 20 } },
    ]);
    expect(costOf(state, 'mid')).toBe(30);
    expect(costOf(state, 'root')).toBe(30);

    // One edit, one commit. `mid` is recomputed to 120 inside this pass, and `root` must read that
    // 120 — the committed `mid` still says 30 while the pass runs.
    state.entries.update('leafA', { cost: 100 });

    expect(costOf(state, 'mid')).toBe(120);
    expect(costOf(state, 'root')).toBe(120);
  });
});

describe('the Rollup context reads each row through its own children (F22)', () => {
  /** `kidCount` computes from the row's own children; `kidSum` rolls the children's `kidCount` up.
   *  Over `p → {a, b}` and `a → {a1, a2, a3}`, `p.kidSum` is `a`'s 3 plus `b`'s 0. */
  function twoLevelDataset(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p' },
        { id: 'a', name: 'a', parentId: 'p' },
        { id: 'b', name: 'b', parentId: 'p' },
        { id: 'a1', name: 'a1', parentId: 'a' },
        { id: 'a2', name: 'a2', parentId: 'a' },
        { id: 'a3', name: 'a3', parentId: 'a' },
      ],
      fields: [
        { key: 'kidCount', compute: (entry, ctx) => ctx.children(entry).length },
        { key: 'kidSum', rollUp: 'sumKidCounts' },
      ],
      aggregators: {
        sumKidCounts: (_parent, ctx) =>
          ctx.values('kidCount').reduce((total: number, value) => total + Number(value), 0),
      },
    });
  }

  it('answers a child’s compute Field about that child, not about the parent', () => {
    const state = twoLevelDataset();

    // The store's own answer, for the same two rows the Rollup read.
    expect(state.entries.get('a')!.read('kidCount')).toBe(3);
    expect(state.entries.get('b')!.read('kidCount')).toBe(0);
    expect(state.entries.get('p')!.read('kidSum')).toBe(3);
  });
});

// #466 step 1's own trap: `readingChildrenFrom` (`field-access.ts`) rebinds the pass's tree, and a
// plain sibling `hasChildren` would keep answering off the store while `children` already answers
// off the pass's effective tree — two answers to one question, on exactly the commit that moves a
// row. `checkAgreement` below never trusts either answer; it asks both, inside the pass, for every
// row the commit touches.
describe('the rebinding trap: ctx.hasChildren and ctx.children agree inside the pass (#466 step 1)', () => {
  it('a commit that moves a row: every row the pass reaches answers both questions the same way', () => {
    const mismatches: string[] = [];
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'root', name: 'root' },
        { id: 'a', name: 'a', parentId: 'root' },
        { id: 'b', name: 'b', parentId: 'root' },
        { id: 'a1', name: 'a1', parentId: 'a' },
      ],
      fields: [{ key: 'cost', rollUp: 'checkAgreement' }],
      aggregators: {
        checkAgreement: (parent, ctx) => {
          for (const row of [parent, ...ctx.descendants(parent)]) {
            if (ctx.hasChildren(row) !== ctx.children(row).length > 0) mismatches.push(String(row.id));
          }
          return 0;
        },
      },
    });

    // `a1` moves from `a` to `b`: `a` is demoted (its `hasChildren` must flip from true to false)
    // and `b` is promoted (its `hasChildren` must flip from false to true) on this one commit.
    state.entries.update('a1', { parentId: 'b' });

    expect(mismatches).toEqual([]);
    expect(state.entries.get('a')!.hasChildren).toBe(false);
    expect(state.entries.get('b')!.hasChildren).toBe(true);
  });
});

// #300. The memo (`ComputedFieldCache`) is keyed by dataset revision, and the revision does not move
// until the commit lands. The commit path runs *after* the transaction body closes, so
// `DatasetState`'s "stand the memo down while a transaction is open" rule does not reach it: the
// Rollup used to run with a live memo at the pre-commit revision, and an Aggregator reading a
// child's `compute` Field was served the value cached before the edit.
describe('the Rollup reads a compute Field fresh, never the pre-commit memo (#300)', () => {
  function datasetTallyingNameLengths(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'c', name: 'Child A', parentId: 'p' },
      ],
      fields: [
        // A `compute` Field reads the *stored* record, and storage stays sparse (#421 F8) — only the
        // live `Entry.name` normalizes to `''`.
        { key: 'nameLen', compute: (entry) => (entry.name ?? '').length },
        { key: 'tally', rollUp: 'sumNameLens' },
      ],
      aggregators: {
        sumNameLens: (_parent, ctx) =>
          ctx.values('nameLen').reduce((total: number, value) => total + Number(value), 0),
      },
    });
  }

  const LONGER_NAME = 'Child A Renamed Much Longer';

  it('rolls up the edited value when nothing primed the memo first', () => {
    const state = datasetTallyingNameLengths();

    state.transaction(() => {
      state.entries.update('c', { name: LONGER_NAME });
    });

    expect(state.entries.get('p')!.read('tally')).toBe(LONGER_NAME.length);
  });

  // The same edit, with one ordinary read in front of it — what any drawn frame does. Before the
  // fix this answered 7, the length of the name the child carried before the transaction opened.
  it('rolls up the edited value when a read primed the memo first', () => {
    const state = datasetTallyingNameLengths();

    expect(state.entries.get('c')!.read('nameLen')).toBe('Child A'.length);

    state.transaction(() => {
      state.entries.update('c', { name: LONGER_NAME });
    });

    expect(state.entries.get('c')!.read('nameLen')).toBe(LONGER_NAME.length);
    expect(state.entries.get('p')!.read('tally')).toBe(LONGER_NAME.length);
  });
});

// #421 C4. The store's own committed index (`committedParents`/`committedChildIds`) already answers
// for a commit that cannot have moved a row — no add, no remove, no edit naming `parentId`. Before
// this build, every commit re-derived that answer with `checkHierarchyAnswers` and rebuilt the child
// index twice with `childIdsByParent`, both costs scaling with dataset size
// (SPIKE-FINDINGS.md: 8.6 ms → 4.9 ms for one write over a 10,200-row fixture).
describe('the Rollup fast path skips re-deriving the committed tree (#421 C4)', () => {
  /** How many times the two expensive re-derivations ran while `run` was committing. Spies on the
   *  named exports `rollup.ts` calls directly.
   *
   *  `checks` carries one call every commit pays regardless of the fast path: `EntryStore`'s own
   *  `committedParents()` memo (`entry-store.ts`'s `#hierarchy`) re-derives once per revision, and
   *  the commit path reads it before `rollUpFields` runs. `rollup.ts`'s own call is the one the fast
   *  path removes, so a re-checked commit's `checks` is one more than a fast-pathed one's, never two
   *  more. `childIndexBuilds` carries no such baseline — `childIdsByParent` is `rollup.ts`'s alone. */
  function countTreeRederivations(run: () => void): { checks: number; childIndexBuilds: number } {
    const checkSpy = vi.spyOn(hierarchySource, 'checkHierarchyAnswers');
    const childIdsSpy = vi.spyOn(entryTree, 'childIdsByParent');
    checkSpy.mockClear();
    childIdsSpy.mockClear();
    run();
    const counts = { checks: checkSpy.mock.calls.length, childIndexBuilds: childIdsSpy.mock.calls.length };
    checkSpy.mockRestore();
    childIdsSpy.mockRestore();
    return counts;
  }

  it('a write that touches no parentId and adds/removes nothing takes the fast path', () => {
    const state = treeDataset([
      { id: 'p' },
      { id: 'a', parentId: 'p', props: { cost: 10 } },
      { id: 'b', parentId: 'p', props: { cost: 5 } },
    ]);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      state.entries.update('a', { cost: 20 });
    });

    expect(checks).toBe(1); // the store's own baseline call, and nothing from rollup.ts
    expect(childIndexBuilds).toBe(0);
    expect(costOf(state, 'p')).toBe(25);
  });

  it('a reparenting write still re-derives the tree, and rolls up the same as before', () => {
    const state = treeDataset([{ id: 'a' }, { id: 'b' }, { id: 'c', parentId: 'a', props: { cost: 10 } }]);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      state.entries.update('c', { parentId: 'b' });
    });

    expect(checks).toBe(2); // the baseline call, plus rollup.ts's own re-check
    expect(childIndexBuilds).toBe(2);
    expect(costOf(state, 'a')).toBeUndefined();
    expect(costOf(state, 'b')).toBe(10);
  });

  it('adding an Entry still re-derives the tree, even with no parentId written on an existing row', () => {
    const state = treeDataset([{ id: 'p' }, { id: 'a', parentId: 'p', props: { cost: 10 } }]);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      state.entries.add({ id: 'b', parentId: 'p', name: 'b', props: { cost: 5 } });
    });

    expect(checks).toBe(2); // the baseline call, plus rollup.ts's own re-check
    expect(childIndexBuilds).toBe(2);
    expect(costOf(state, 'p')).toBe(15);
  });

  it('removing an Entry still re-derives the tree', () => {
    const state = treeDataset([
      { id: 'p' },
      { id: 'a', parentId: 'p', props: { cost: 10 } },
      { id: 'b', parentId: 'p', props: { cost: 5 } },
    ]);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      state.entries.remove('b');
    });

    expect(checks).toBe(2); // the baseline call, plus rollup.ts's own re-check
    expect(childIndexBuilds).toBe(2);
    expect(costOf(state, 'p')).toBe(10);
  });

  it("a consumer's own hierarchy source re-checks on every commit — the fast path is core's alone", () => {
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p' },
        { id: 'c', name: 'c', props: { phaseId: 'p', cost: 10 } },
      ],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }, { key: 'phaseId' }],
    });
    // The tree lives in `props.phaseId`, never `parentId` — the shape ADR 0020's own example
    // takes. This write names no `parentId`, so it would take the fast path under core's own
    // source; a plugin source may read any field, so it must not.
    state.setHierarchySource(() => (entry) => (entry.props as { phaseId?: string }).phaseId);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      state.entries.update('c', { cost: 20 });
    });

    expect(checks).toBe(2); // the baseline call, plus the plugin source's own re-check — never the fast path
    expect(childIndexBuilds).toBe(2);
    expect(costOf(state, 'p')).toBe(20);
  });

  // Does the fast path still skip both re-derivations once the tree is the size the spike
  // measured, not the three-entry size the tests above use? A three-entry fixture cannot tell
  // `checks`/`childIndexBuilds` staying flat from an accident of a tiny tree; 10,200 entries (the
  // spike's own 200-parent, 50-child shape) is where SPIKE-FINDINGS.md found the fast path halve
  // one write from 8.6 ms to 4.9 ms. This asserts the same invariant the small test above does —
  // `checks === 1`, `childIndexBuilds === 0` — never a wall-clock bound: a millisecond number is
  // machine-dependent and goes flaky in CI, where a call count is deterministic everywhere.
  it('the fast path stays free of both re-derivations as the tree grows (the spike’s own fixture shape: 200 parents × 50 children)', () => {
    const parents = Array.from({ length: 200 }, (_, p) => ({ id: `p${p}` }));
    const children = parents.flatMap((parent) =>
      Array.from({ length: 50 }, (_, c) => ({
        id: `${parent.id}-c${c}`,
        parentId: parent.id,
        props: { cost: 1 },
      })),
    );
    const large = treeDataset([...parents, ...children]);

    const { checks, childIndexBuilds } = countTreeRederivations(() => {
      large.entries.update('p0-c0', { cost: 2 });
    });

    expect(checks).toBe(1); // the store's own baseline call, and nothing from rollup.ts, however large the tree
    expect(childIndexBuilds).toBe(0);
    expect(costOf(large, 'p0')).toBe(51);
  });
});

// #466 cases 3 and 4, and the non-case that guards the API from growing. One tree answers all three:
// `Depot` holds `Van 1` (which holds `Crate A` and `Crate B`, four days apart) and the leaf `Van 2`,
// away on its own. Three leaves, three levels, and one gap nobody works through.
describe('a pass reads the leaves of any row it hands you (#466 cases 3 and 4)', () => {
  const at = (iso: string): string => `2026-01-${iso}T00:00:00Z`;

  /** `work` totals each leaf's own duration; `leafCount` counts them. Both read `ctx.leaves(entry)`
   *  about the row they are handed, which is the whole point — a `compute` Field runs on every row,
   *  a rolling-up parent included, and gets its own subtree each time. */
  function depotDataset(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'depot', name: 'Depot' },
        { id: 'van-1', name: 'Van 1', parentId: 'depot' },
        { id: 'crate-a', name: 'Crate A', parentId: 'van-1', start: at('01'), end: at('03') },
        { id: 'crate-b', name: 'Crate B', parentId: 'van-1', start: at('07'), end: at('09') },
        { id: 'van-2', name: 'Van 2', parentId: 'depot', start: at('20'), end: at('21') },
      ],
      fields: [
        {
          key: 'work',
          compute: (entry, ctx) =>
            ctx
              .leaves(entry)
              .reduce(
                (total, leaf) =>
                  leaf.start === undefined || leaf.end === undefined
                    ? total
                    : total + diffMs(leaf.end, leaf.start),
                0,
              ),
        },
        { key: 'leafCount', compute: (entry, ctx) => ctx.leaves(entry).length },
      ],
    });
  }

  /** A row's own span, in days — the envelope the Rollup already computes, for comparison. */
  const spanDays = (start: Instant | undefined, end: Instant | undefined): number =>
    start === undefined || end === undefined ? Number.NaN : diffMs(end, start) / MS.DAY;

  it('totals the work of a row’s leaves, which is strictly less than the row’s own span', () => {
    // Case 3. The span is the envelope the Rollup already computes — every leaf's work, plus the gaps
    // between them. So the two numbers answer two different questions and must not be equal, and a
    // `leaves` that walked the wrong way would make them agree.
    const state = depotDataset();
    const depot = state.entries.get('depot')!;
    const van1 = state.entries.get('van-1')!;

    // Three leaves: two days, two days, one day.
    expect(depot.read('work')).toBe(5 * MS.DAY);
    expect(spanDays(depot.start, depot.end)).toBe(20);
    expect(depot.read('work')).toBeLessThan(diffMs(depot.end!, depot.start!));

    // And one level down, where the four-day gap between the crates is the whole difference.
    expect(van1.read('work')).toBe(4 * MS.DAY);
    expect(spanDays(van1.start, van1.end)).toBe(8);
    expect(van1.read('work')).toBeLessThan(diffMs(van1.end!, van1.start!));
  });

  it('a leaf’s work is its own span — the two numbers meet only at the bottom', () => {
    // The self-inclusion rule, read as a number: `leaves(Crate A)` is `[Crate A]`, so a leaf works
    // through the whole of its own span and has no gap to lose.
    const state = depotDataset();
    const crateA = state.entries.get('crate-a')!;

    expect(crateA.read('work')).toBe(diffMs(crateA.end!, crateA.start!));
    expect(crateA.read('work')).toBe(2 * MS.DAY);
  });

  it('counts the leaves of a parent at depth 0 and at depth 1, and of a leaf itself', () => {
    // Case 4.
    const state = depotDataset();

    expect(state.entries.get('depot')!.read('leafCount')).toBe(3);
    expect(state.entries.get('van-1')!.read('leafCount')).toBe(2);
    expect(state.entries.get('van-2')!.read('leafCount')).toBe(1);
    expect(state.entries.get('crate-a')!.read('leafCount')).toBe(1);
  });

  it('the non-case: an Aggregator reading numericValues alone still totals three levels (#466)', () => {
    // This test exists so nobody adds API for a case the bottom-up pass already answers. An
    // Aggregator sees its own children's finished values, so summing one level deep sums the whole
    // subtree — no walk, no `descendants`, no `leaves`. The three tree words are for the row a pass
    // is *handed*, never for reaching the recursion the pass is already doing.
    let levelsRead = 0;
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'depot', name: 'Depot' },
        { id: 'van-1', name: 'Van 1', parentId: 'depot' },
        { id: 'crate-a', name: 'Crate A', parentId: 'van-1', props: { cost: 1 } },
        { id: 'crate-b', name: 'Crate B', parentId: 'van-1', props: { cost: 2 } },
        { id: 'van-2', name: 'Van 2', parentId: 'depot', props: { cost: 3 } },
      ],
      fields: [{ key: 'cost', rollUp: 'totalOneLevel' }],
      aggregators: {
        totalOneLevel: (_parent, ctx) => {
          levelsRead += 1;
          return ctx.numericValues('cost').reduce((total, value) => total + value, 0);
        },
      },
    });

    expect(state.entries.get('van-1')!.read('cost')).toBe(3);
    expect(state.entries.get('depot')!.read('cost')).toBe(6);
    // Two parents, so the Aggregator ran twice — once per level, never once per descendant.
    expect(levelsRead).toBe(2);
  });
});
