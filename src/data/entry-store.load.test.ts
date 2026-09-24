// data/ — entries.load() (#496): a full fresh start. Exercised through DatasetState the way a
// consumer would reach it (`dataset.entries.load(...)`), the same posture entry-store.mutation.test.ts
// takes for add/update/remove.

import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import {
  DuplicateEntryIdError,
  EntryNotFoundError,
  MutationCancelledError,
  MutationDuringExtensionHookError,
  MutationDuringNotificationError,
  ParentCycleError,
  TransactionAlreadyOpenError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, EntryEdits, EntryInput, ErrorReport, FlatEntryInput } from '../model/index.js';
import {
  assertEntryBatchIsSound,
  assertNoOpenTransaction,
  assertNoRunningExtensionHook,
  assertNotNotifying,
  readEntryBatch,
} from './entry-batch.js';
import { toEntries } from './entry-reader.js';
import { storedParentSource } from './hierarchy-source.js';
import { FieldRegistry } from './fields/field-registry.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
  });
}

function changeSets(state: DatasetState): ChangeSet[] {
  const seen: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    seen.push(changeSet);
  });
  return seen;
}

describe('entry-batch.ts — the shared functions load and sync (#517) both reuse', () => {
  const registry = new FieldRegistry();
  const context = { timeZone: 'UTC', dateOnlyEnd: 'inclusive' as const };
  const read = (inputs: readonly Seed[]) =>
    toEntries(
      inputs.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
      context,
      registry,
      'test',
    );

  it('assertEntryBatchIsSound throws for a duplicate id, an unknown parent, or a loop — and passes a sound batch', () => {
    expect(() => assertEntryBatchIsSound(read([{ id: 'a' }, { id: 'a' }]), 'test')).toThrow(
      DuplicateEntryIdError,
    );
    expect(() => assertEntryBatchIsSound(read([{ id: 'a', parentId: 'ghost' }]), 'test')).toThrow(
      EntryNotFoundError,
    );
    expect(() =>
      assertEntryBatchIsSound(
        read([
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: 'a' },
        ]),
        'test',
      ),
    ).toThrow(ParentCycleError);
    expect(() =>
      assertEntryBatchIsSound(read([{ id: 'a' }, { id: 'b', parentId: 'a' }]), 'test'),
    ).not.toThrow();
  });

  it('a deep parent chain that loops at the far end still throws ParentCycleError, naming the earliest listed member', () => {
    const depth = 2000;
    const chain = Array.from({ length: depth }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? `n${depth - 1}` : `n${i - 1}`,
    }));

    expect(() => assertEntryBatchIsSound(read(chain), 'test')).toThrow(ParentCycleError);
    try {
      assertEntryBatchIsSound(read(chain), 'test');
    } catch (error) {
      expect((error as ParentCycleError).entryId).toBe(entryId('n0'));
    }
  });

  it("a load batch's duplicate id names the door the caller used, not entries.add's advice", () => {
    expect(() => assertEntryBatchIsSound(read([{ id: 'a' }, { id: 'a' }]), 'entries.load')).toThrow(
      'entries.load: the list names id "a" twice. Give each entry its own id.',
    );
  });

  it('readEntryBatch ranks siblings by list order, not the order ids were typed', () => {
    const { entries } = readEntryBatch(
      [
        { id: 'c', name: 'c', start: 0, end: 1, props: {} },
        { id: 'a', name: 'a', start: 0, end: 1, props: {} },
        { id: 'b', name: 'b', start: 0, end: 1, props: {} },
      ],
      context,
      registry,
      storedParentSource,
      'test',
    );
    const rankById = new Map(entries.map((entry) => [entry.id, entry.siblingIndex]));
    expect(rankById.get(entryId('c'))).toBe(0);
    expect(rankById.get(entryId('a'))).toBe(1);
    expect(rankById.get(entryId('b'))).toBe(2);
  });

  it('assertNoOpenTransaction is silent at 0 and throws above it', () => {
    expect(() => assertNoOpenTransaction(0, 'test')).not.toThrow();
    expect(() => assertNoOpenTransaction(1, 'test')).toThrow(TransactionAlreadyOpenError);
  });

  it('assertNoRunningExtensionHook is silent when false and throws when true', () => {
    expect(() => assertNoRunningExtensionHook(false, 'test')).not.toThrow();
    expect(() => assertNoRunningExtensionHook(true, 'test')).toThrow(MutationDuringExtensionHookError);
  });

  it('assertNotNotifying is silent when false and throws when true', () => {
    expect(() => assertNotNotifying(false, 'test')).not.toThrow();
    expect(() => assertNotNotifying(true, 'test')).toThrow(MutationDuringNotificationError);
  });
});

describe('entries.load', () => {
  it('a child listed before its parent lands, and entries.all walks the tree depth-first (Q1)', () => {
    const state = dataset();
    state.entries.load([
      { id: 'c', parentId: 'a', name: 'Child', start: 0, end: 1 },
      { id: 'a', name: 'Parent', start: 0, end: 1 },
      { id: 'b', name: 'Sibling', start: 0, end: 1 },
    ]);

    // Root order comes from list position among roots ('a' before 'b'), and 'a' carries its own
    // child right after it — depth-first, not the flat list order the input named them in.
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('a'), entryId('c'), entryId('b')]);
    expect(state.entries.get('c')!.parent()?.id).toBe(entryId('a'));
  });

  it('matches new Dataset({ entries }) for the same valid input (Q1 oracle)', () => {
    const rows = [
      { id: 'a', name: 'Parent', start: 0, end: 1 },
      { id: 'b', name: 'Child', parentId: 'a', start: 0, end: 1 },
    ];
    const fresh = new DatasetState({ entries: rows, timeZone: 'UTC' });
    const state = dataset([{ id: 'stale' }]);
    state.entries.load(rows);

    expect(state.entries.all.map((e) => e.toInput())).toEqual(fresh.entries.all.map((e) => e.toInput()));
  });

  it('an id both the old data and the input list name lands at its input-list position, not its old one', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    state.entries.load([
      { id: 'x', name: 'New first', start: 0, end: 1 },
      { id: 'b', name: 'Kept, now last', start: 0, end: 1 },
    ]);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('x'), entryId('b')]);
    expect(state.entries.get('b')!.name).toBe('Kept, now last');
  });

  it('a duplicate id, an unknown parent, or a loop throws and leaves the store and History untouched', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });

    expect(() => state.entries.load([{ id: 'a' }, { id: 'a' }])).toThrow(DuplicateEntryIdError);
    expect(() => state.entries.load([{ id: 'a', parentId: 'ghost' }])).toThrow(EntryNotFoundError);
    expect(() =>
      state.entries.load([
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
      ]),
    ).toThrow(ParentCycleError);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.entries.get('old')!.name).toBe('Edited');
    expect(state.canUndo).toBe(true);
  });

  // load() under a plugin hierarchy source (ADR 0020 J54): a refused source answer is a Fault, never
  // a throw. Load's pre-stage check reads raw `parentId` only, the same way `update()`'s
  // `#assertParentValid` does — a plugin source's own key goes through the Fault path instead.
  describe('load() under a plugin hierarchy source (ADR 0020 J54)', () => {
    function phaseSourced(entries: { id: string; parentId?: string }[] = []): DatasetState {
      return new DatasetState({
        timeZone: 'UTC',
        entries: entries.map((e) => ({ ...e, name: e.id, start: 0, end: 1 })),
        fields: [{ key: 'phaseId' }],
        hierarchySourceWrappers: [() => (entry) => (entry.props as { phaseId?: string }).phaseId],
      });
    }

    it('a cycle only in the plugin key does not throw — it commits, and the commit reports a "hierarchy-cycle" Fault', () => {
      const state = phaseSourced();
      const reports: ErrorReport[] = [];
      state.on('error', (report) => {
        reports.push(report);
      });

      const inputs: FlatEntryInput<{ phaseId: string }>[] = [
        { id: 'a', name: 'A', start: 0, end: 1, phaseId: 'b' },
        { id: 'b', name: 'B', start: 0, end: 1, phaseId: 'a' },
      ];
      expect(() => state.entries.load(inputs)).not.toThrow();

      // The cycle breaks at 'b': its own answer is the one dropped, so 'b' reads as a root and 'a'
      // keeps its answer of "'b' is my parent" — `all` walks that surviving tree depth-first.
      expect(state.entries.all.map((e) => e.id)).toEqual([entryId('b'), entryId('a')]);
      expect(reports.map((report) => [report.code, report.by])).toContainEqual(['hierarchy-cycle', 'plugin']);
    });

    it('an unknown parent only in the plugin key does not throw — it commits, and the commit reports an "unknown-parent" Fault', () => {
      const state = phaseSourced();
      const reports: ErrorReport[] = [];
      state.on('error', (report) => {
        reports.push(report);
      });

      const inputs: FlatEntryInput<{ phaseId: string }>[] = [
        { id: 'a', name: 'A', start: 0, end: 1, phaseId: 'ghost' },
      ];
      expect(() => state.entries.load(inputs)).not.toThrow();

      expect(state.entries.all.map((e) => e.id)).toEqual([entryId('a')]);
      expect(reports.map((report) => [report.code, report.by])).toContainEqual(['unknown-parent', 'plugin']);
      expect(state.entries.get('a')?.parent()).toBeUndefined();
    });

    it("a raw parentId cycle still throws ParentCycleError under a plugin source — load's pre-stage check reads parentId, the same as update()'s #assertParentValid", () => {
      const state = phaseSourced();

      expect(() =>
        state.entries.load([
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: 'a' },
        ]),
      ).toThrow(ParentCycleError);
      expect(state.entries.all).toEqual([]);
    });
  });

  it('commits one change with origin "load", and canUndo/canRedo both read false after it', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    expect(state.canUndo).toBe(true);

    const seen = changeSets(state);
    state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.origin).toBe('load');
    expect(seen[0]!.removed.map((row) => row.entity.id)).toEqual([entryId('old')]);
    expect(seen[0]!.added.map((row) => row.entity.id)).toEqual([entryId('new')]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it('an empty load into an empty Dataset still commits and still clears History (Q9)', () => {
    const state = dataset();
    const seen = changeSets(state);

    state.entries.load([]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ id: seen[0]!.id, origin: 'load', added: [], removed: [], updated: [] });
    expect(state.canUndo).toBe(false);
  });

  it('after a load, a later user edit is the only undo step', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);

    state.entries.update('new', { name: 'Renamed' });
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.entries.get('new')!.name).toBe('New');
    expect(state.canUndo).toBe(false);
  });

  it('a beforeChange veto throws MutationCancelledError, and leaves the store and History as they were', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    state.on('beforeChange', ({ refuse }) => {
      refuse('no loads today');
      return false;
    });

    expect(() => state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }])).toThrow(
      MutationCancelledError,
    );
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.canUndo).toBe(true);
  });

  it('called inside dataset.transaction(), it refuses with TransactionAlreadyOpenError', () => {
    const state = dataset([{ id: 'old' }]);
    expect(() =>
      state.transaction(() => {
        state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);
      }),
    ).toThrow(TransactionAlreadyOpenError);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
  });

  it('an EditExtender that calls entries.load() throws MutationDuringExtensionHookError, and the user edit is not saved either (#323)', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);
        return new Map();
      },
    });
    let changeCount = 0;
    state.on('change', () => {
      changeCount += 1;
    });

    expect(() => state.entries.update(entryId('t1'), { name: 'a' })).toThrow(
      MutationDuringExtensionHookError,
    );
    expect(changeCount).toBe(0);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('t1')]);
  });

  it('load called inside a change handler throws MutationDuringNotificationError, naming entries.load', () => {
    const state = dataset([{ id: 'old' }]);
    state.on('change', () => {
      state.entries.load([{ id: 'second', name: 'Second', start: 0, end: 1 }]);
    });

    expect(() => state.entries.load([{ id: 'first', name: 'First', start: 0, end: 1 }])).toThrow(
      'entries.load: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.',
    );
  });

  it('an id in both lists keeps no old plugin-store row, selection or other per-entry state (L1)', () => {
    const state = dataset([{ id: 'kept' }]);
    state.pluginStores.reserve<{ locked: true }>('demo.lock').set('kept', { locked: true });
    expect(state.pluginStores.read<{ locked: true }>('demo.lock')!.get('kept')).toEqual({ locked: true });

    state.entries.load([{ id: 'kept', name: 'Fresh kept', start: 0, end: 1 }]);

    expect(state.pluginStores.read<{ locked: true }>('demo.lock')!.get('kept')).toBeUndefined();
    expect(state.entries.get('kept')!.name).toBe('Fresh kept');
  });

  it("a plugin's declared Field value loads (Q6), through toInput() the same as any other key", () => {
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'phaseId', type: 'text', editable: 'api' }],
    });

    const inputs: FlatEntryInput<{ phaseId: string }>[] = [
      { id: 't1', name: 'Task', start: 0, end: 1, phaseId: 'ph-1' },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('t1')!.read('phaseId')).toBe('ph-1');
  });

  it('a derived parent cell re-rolls on load, the same as construction (Q3)', () => {
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
    });

    const inputs: FlatEntryInput<{ cost: number }>[] = [
      { id: 'p1', name: 'Parent', cost: 999 },
      { id: 'c1', name: 'Child', parentId: 'p1', cost: 100 },
      { id: 'c2', name: 'Child', parentId: 'p1', cost: 200 },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('p1')!.read('cost')).toBe(300);
  });

  it('a load that authors a value on a parent whose only child has none drops it and reports "derived-values-dropped", the same as construction (ADR 0013 decision 5, Q3)', () => {
    const reports: ErrorReport[] = [];
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
    });
    state.on('error', (report) => {
      reports.push(report);
    });

    const inputs: FlatEntryInput<{ cost: number }>[] = [
      { id: 'p1', name: 'Parent', cost: 999 },
      { id: 'c1', name: 'Child', parentId: 'p1' },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('p1')!.read('cost')).toBeUndefined();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.code).toBe('derived-values-dropped');
    expect(reports[0]?.message).toContain('"cost"');
    expect(reports[0]?.message).toContain('"p1"');
  });

  describe('a load that authors a siblingIndex diverging from list position (D9)', () => {
    it('with an error subscriber, gives exactly one report that lists only the ids whose value differed', () => {
      const state = dataset();
      const reports: ErrorReport[] = [];
      state.on('error', (report) => {
        reports.push(report);
      });

      state.entries.load([
        { id: 'a', name: 'a', siblingIndex: 9 },
        { id: 'b', name: 'b' },
      ]);

      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('sibling-index-dropped');
      expect(reports[0]?.message).toContain('"a"');
      expect(reports[0]?.message).not.toContain('"b"');
    });

    it('with no error subscriber, warns once on console.warn instead of dropping the report silently', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const state = dataset();
      state.entries.load([
        { id: 'a', name: 'a', siblingIndex: 9 },
        { id: 'b', name: 'b' },
      ]);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('"a"');

      warn.mockRestore();
    });

    it('an authored value equal to its list position gives no report and no console.warn', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state = dataset();
      const reports: ErrorReport[] = [];
      state.on('error', (report) => {
        reports.push(report);
      });

      state.entries.load([
        { id: 'a', name: 'a', siblingIndex: 0 },
        { id: 'b', name: 'b', siblingIndex: 1 },
      ]);

      expect(reports).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });
  });
});
