import { describe, expect, it, vi } from 'vitest';
import { SegmentSelection } from './segment-selection.js';
import type { SegmentSelectionPorts, SegmentSelectionRow } from './segment-selection.js';
import { EntryStore } from '../data/entry-store.js';
import { entryId, itemId, rowId, segmentId } from '../model/index.js';
import type { ChangeSet, Entry, EntryId, Instant, ItemId, RowId, SegmentId } from '../model/index.js';
import type { SelectionChange } from './event-bus.js';

// T1-7 (#246 S2-4): `SegmentSelection` has no direct test — everything about it was covered only
// through `GanttShell`. `SegmentSelectionPorts` is the seam this module was built to be tested
// against (#230 R4), so these tests drive that interface with literal fakes and never touch the shell.

const timeZone = 'UTC';

function instant(ms: number): Instant {
  return ms as Instant;
}

function entry(id: string, segmentIds: readonly string[]): Entry {
  return {
    id: entryId(id),
    name: id,
    kind: 'span',
    start: instant(0),
    end: instant(segmentIds.length * 100),
    segments: segmentIds.map((sid, i) => ({
      id: segmentId(sid),
      start: instant(i * 100),
      end: instant((i + 1) * 100),
    })),
  };
}

let mintedCount = 0;

/** A real `EntryStore`, so `entryIdOfSegment`/`entryIdsOfSegments`/`segmentIdsOfEntries` answer with
 *  the library's own logic — only the row plan, capability and event plumbing around it are fakes. */
function entryStoreOf(entries: readonly Entry[]): EntryStore {
  return new EntryStore(entries, {
    timeZone,
    dateOnlyEnd: 'inclusive',
    referenceDate: instant(0),
    rollUpKinds: new Set(['group']),
    mintSegmentId: () => segmentId(`minted-${++mintedCount}`),
  });
}

interface PortsOptions {
  rows?: readonly SegmentSelectionRow[];
  rowIdForEntry?: (id: EntryId) => RowId | undefined;
  segmentIdsForItem?: (id: ItemId) => readonly SegmentId[];
  canGesture?: (capability: 'select', id: EntryId) => boolean;
}

function buildPorts(
  store: EntryStore,
  options: PortsOptions = {},
): { ports: SegmentSelectionPorts; announced: SelectionChange[]; painted: (readonly SegmentId[])[] } {
  const announced: SelectionChange[] = [];
  const painted: (readonly SegmentId[])[] = [];
  const ports: SegmentSelectionPorts = {
    entries: () => store,
    plannedRows: () => options.rows ?? [],
    rowIdForEntry: options.rowIdForEntry ?? (() => undefined),
    segmentIdsForItem: options.segmentIdsForItem ?? (() => []),
    canGesture: options.canGesture ?? (() => true),
    confirm: (_change, apply) => {
      apply();
      return true;
    },
    announce: (change) => {
      announced.push(change);
    },
    paint: (segmentIds) => {
      painted.push(segmentIds);
    },
  };
  return { ports, announced, painted };
}

describe('SegmentSelection ordering (#212, ADR 0010)', () => {
  it('orders entryIds by resolved row rank, not selection order', () => {
    const e1 = entry('e1', ['e1-1']);
    const e2 = entry('e2', ['e2-1']);
    const store = entryStoreOf([e1, e2]);
    const rows: SegmentSelectionRow[] = [
      { id: rowId('r1'), kind: 'entry', entryIds: [e2.id] },
      { id: rowId('r2'), kind: 'entry', entryIds: [e1.id] },
    ];
    const { ports } = buildPorts(store, { rows });
    const selection = new SegmentSelection(ports);

    // Selected in e1-then-e2 order; the row plan puts e2 first.
    selection.propose([segmentId('e1-1'), segmentId('e2-1')]);

    expect(selection.entryIds).toEqual([e2.id, e1.id]);
  });

  it('puts an Entry the row plan does not carry after every ranked Entry, stable among unranked ones', () => {
    const e1 = entry('e1', ['e1-1']);
    const e2 = entry('e2', ['e2-1']);
    const e3 = entry('e3', ['e3-1']);
    const store = entryStoreOf([e1, e2, e3]);
    // Only e1 is in the row plan (e2, e3 are collapsed behind it, say) — both keep the selection order.
    const rows: SegmentSelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1.id] }];
    const { ports } = buildPorts(store, { rows });
    const selection = new SegmentSelection(ports);

    selection.propose([segmentId('e2-1'), segmentId('e3-1'), segmentId('e1-1')]);

    expect(selection.entryIds).toEqual([e1.id, e2.id, e3.id]);
  });
});

describe('SegmentSelection.selectableSegmentsOf, both hit kinds (#212, ADR 0010)', () => {
  it('a row hit names every Segment of every selectable Entry the row owns', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const e2 = entry('e2', ['e2-1']);
    const store = entryStoreOf([e1, e2]);
    const rows: SegmentSelectionRow[] = [{ id: rowId('packed'), kind: 'entry', entryIds: [e1.id, e2.id] }];
    const { ports } = buildPorts(store, { rows });
    const selection = new SegmentSelection(ports);

    expect(selection.selectableSegmentsOf({ kind: 'row', rowId: rowId('packed') })).toEqual([
      segmentId('e1-1'),
      segmentId('e1-2'),
      segmentId('e2-1'),
    ]);
  });

  it('a row hit skips an Entry the row owns that refuses select (#185)', () => {
    const e1 = entry('e1', ['e1-1']);
    const e2 = entry('e2', ['e2-1']);
    const store = entryStoreOf([e1, e2]);
    const rows: SegmentSelectionRow[] = [{ id: rowId('packed'), kind: 'entry', entryIds: [e1.id, e2.id] }];
    const { ports } = buildPorts(store, { rows, canGesture: (_c, id) => id !== e2.id });
    const selection = new SegmentSelection(ports);

    expect(selection.selectableSegmentsOf({ kind: 'row', rowId: rowId('packed') })).toEqual([
      segmentId('e1-1'),
    ]);
  });

  it('a header row hit names nothing — a header row owns no Entry', () => {
    const store = entryStoreOf([]);
    const rows: SegmentSelectionRow[] = [{ id: rowId('h1'), kind: 'header', entryIds: [] }];
    const { ports } = buildPorts(store, { rows });
    const selection = new SegmentSelection(ports);

    expect(selection.selectableSegmentsOf({ kind: 'row', rowId: rowId('h1') })).toEqual([]);
  });

  it('a bar hit names its own Segment when the Entry may be selected, and nothing when it may not', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const store = entryStoreOf([e1]);
    const bar = itemId(e1.id, 1);
    const { ports: allowed } = buildPorts(store, {
      segmentIdsForItem: (id) => (id === bar ? [segmentId('e1-2')] : []),
    });
    expect(new SegmentSelection(allowed).selectableSegmentsOf({ kind: 'bar', itemId: bar })).toEqual([
      segmentId('e1-2'),
    ]);

    const { ports: refused } = buildPorts(store, {
      segmentIdsForItem: (id) => (id === bar ? [segmentId('e1-2')] : []),
      canGesture: () => false,
    });
    expect(new SegmentSelection(refused).selectableSegmentsOf({ kind: 'bar', itemId: bar })).toEqual([]);
  });
});

describe('SegmentSelection with mixed ownership across rows (#212, finding 10)', () => {
  it('selectableSegmentsInRowOrder lists each row in order, each Entry own Segments in Entry order', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const e2 = entry('e2', ['e2-1']);
    const e3 = entry('e3', ['e3-1']);
    const store = entryStoreOf([e1, e2, e3]);
    const rows: SegmentSelectionRow[] = [
      { id: rowId('r1'), kind: 'header', entryIds: [] },
      { id: rowId('r2'), kind: 'entry', entryIds: [e2.id, e3.id] },
      { id: rowId('r3'), kind: 'entry', entryIds: [e1.id] },
    ];
    const { ports } = buildPorts(store, { rows });
    const selection = new SegmentSelection(ports);

    expect(selection.selectableEntriesInRowOrder()).toEqual([e2.id, e3.id, e1.id]);
    expect(selection.selectableSegmentsInRowOrder()).toEqual([
      segmentId('e2-1'),
      segmentId('e3-1'),
      segmentId('e1-1'),
      segmentId('e1-2'),
    ]);
  });
});

describe('SegmentSelection.step (#212)', () => {
  it('steps to the next Segment of the same Entry on the row it sits on', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2', 'e1-3']);
    const store = entryStoreOf([e1]);
    const rows: SegmentSelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1.id] }];
    const { ports } = buildPorts(store, { rows, rowIdForEntry: () => rowId('r1') });
    const selection = new SegmentSelection(ports);
    selection.propose([segmentId('e1-1')]);

    selection.step(1);
    expect(selection.segmentIds).toEqual([segmentId('e1-2')]);

    selection.step(1);
    expect(selection.segmentIds).toEqual([segmentId('e1-3')]);

    // Clamped at the end — one more forward step writes nothing.
    selection.step(1);
    expect(selection.segmentIds).toEqual([segmentId('e1-3')]);

    selection.step(-1);
    expect(selection.segmentIds).toEqual([segmentId('e1-2')]);
  });

  it('does nothing when nothing is selected, or the row has nowhere to step', () => {
    const e1 = entry('e1', ['e1-1']);
    const store = entryStoreOf([e1]);
    const rows: SegmentSelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1.id] }];
    const { ports } = buildPorts(store, { rows, rowIdForEntry: () => rowId('r1') });
    const selection = new SegmentSelection(ports);

    selection.step(1); // nothing selected
    expect(selection.segmentIds).toEqual([]);

    selection.propose([segmentId('e1-1')]);
    selection.step(1); // one bar, nowhere to go
    expect(selection.segmentIds).toEqual([segmentId('e1-1')]);
  });
});

describe('SegmentSelection.forgetSegmentsTheDatasetDropped (#212, finding 8)', () => {
  function changeSetDropping(segmentIds: readonly SegmentId[]): ChangeSet {
    return {
      id: 'cs-1' as ChangeSet['id'],
      origin: 'user',
      added: [],
      removed: [],
      updated: [
        {
          store: 'entries',
          id: entryId('e1'),
          field: 'segments',
          from: segmentIds.map((id) => ({ id, start: instant(0), end: instant(100) })),
          to: [],
        },
      ],
    };
  }

  it('drops a Segment the Dataset removed, paints and announces the survivors, refuses nothing', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const store = entryStoreOf([e1]);
    const { ports, announced, painted } = buildPorts(store);
    const selection = new SegmentSelection(ports);
    selection.propose([segmentId('e1-1'), segmentId('e1-2')]);
    painted.length = 0; // the setup propose() above painted once; only the drop below is under test

    selection.forgetSegmentsTheDatasetDropped(changeSetDropping([segmentId('e1-1')]));

    expect(selection.segmentIds).toEqual([segmentId('e1-2')]);
    expect(painted).toEqual([[segmentId('e1-2')]]);
    expect(announced).toEqual([{ from: [segmentId('e1-1'), segmentId('e1-2')], to: [segmentId('e1-2')] }]);
  });

  it('does nothing when the dropped Segment was never selected', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const store = entryStoreOf([e1]);
    const { ports, announced, painted } = buildPorts(store);
    const selection = new SegmentSelection(ports);
    selection.propose([segmentId('e1-2')]);
    painted.length = 0;

    selection.forgetSegmentsTheDatasetDropped(changeSetDropping([segmentId('e1-1')]));

    expect(selection.segmentIds).toEqual([segmentId('e1-2')]);
    expect(painted).toEqual([]);
    expect(announced).toEqual([]);
  });

  it('does nothing when the Selection is already empty', () => {
    const store = entryStoreOf([]);
    const { ports, announced, painted } = buildPorts(store);
    const selection = new SegmentSelection(ports);

    selection.forgetSegmentsTheDatasetDropped(changeSetDropping([segmentId('e1-1')]));

    expect(painted).toEqual([]);
    expect(announced).toEqual([]);
  });
});

describe('SegmentSelection.soleEntry (#212, findings 6-7)', () => {
  it('answers the sole Entry and its selected Segment count, or undefined across two Entries', () => {
    const e1 = entry('e1', ['e1-1', 'e1-2']);
    const e2 = entry('e2', ['e2-1']);
    const store = entryStoreOf([e1, e2]);
    const { ports } = buildPorts(store);
    const selection = new SegmentSelection(ports);

    selection.propose([segmentId('e1-1'), segmentId('e1-2')]);
    expect(selection.soleEntry()).toEqual({ id: e1.id, segmentCount: 2 });

    selection.propose([segmentId('e1-1'), segmentId('e2-1')]);
    expect(selection.soleEntry()).toBeUndefined();

    selection.propose([]);
    expect(selection.soleEntry()).toBeUndefined();
  });
});

describe('SegmentSelection.propose (D-S3-10)', () => {
  it('is a no-op when the proposed list is the same list already selected', () => {
    const e1 = entry('e1', ['e1-1']);
    const store = entryStoreOf([e1]);
    const { ports, announced, painted } = buildPorts(store);
    const selection = new SegmentSelection(ports);
    selection.propose([segmentId('e1-1')]);

    selection.propose([segmentId('e1-1')]);

    expect(painted).toEqual([[segmentId('e1-1')]]); // only the first propose painted
    expect(announced).toEqual([]); // forgetSegmentsTheDatasetDropped announces; propose does not
  });

  it('never applies when confirm refuses the change', () => {
    const e1 = entry('e1', ['e1-1']);
    const store = entryStoreOf([e1]);
    const confirm = vi.fn(() => false);
    const ports: SegmentSelectionPorts = {
      entries: () => store,
      plannedRows: () => [],
      rowIdForEntry: () => undefined,
      segmentIdsForItem: () => [],
      canGesture: () => true,
      confirm,
      announce: () => {},
      paint: () => {},
    };
    const selection = new SegmentSelection(ports);

    selection.propose([segmentId('e1-1')]);

    expect(confirm).toHaveBeenCalledWith({ from: [], to: [segmentId('e1-1')] }, expect.any(Function));
    expect(selection.segmentIds).toEqual([]);
  });
});
