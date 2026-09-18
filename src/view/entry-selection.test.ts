import { describe, expect, it, vi } from 'vitest';
import { EntrySelection } from './entry-selection.js';
import type { EntrySelectionPorts, EntrySelectionRow } from './entry-selection.js';
import { entryId, barId, rowId } from '../model/index.js';
import type { ChangeSet, EntryId, RowId, StoredEntry } from '../model/index.js';
import type { SelectionChange } from './event-bus.js';

// T1-7 (#246 S2-4), #421 ADR 0025: `EntrySelection` has no direct test — everything about it was
// covered only through `GanttShell`. `EntrySelectionPorts` is the seam this module was built to be
// tested against (#230 R4), so these tests drive that interface with literal fakes and never touch
// the shell.

interface PortsOptions {
  rows?: readonly EntrySelectionRow[];
  rowIdForEntry?: (id: EntryId) => RowId | undefined;
  canGesture?: (capability: 'select', id: EntryId) => boolean;
}

function buildPorts(options: PortsOptions = {}): {
  ports: EntrySelectionPorts;
  announced: SelectionChange[];
  painted: (readonly EntryId[])[];
} {
  const announced: SelectionChange[] = [];
  const painted: (readonly EntryId[])[] = [];
  const ports: EntrySelectionPorts = {
    plannedRows: () => options.rows ?? [],
    rowIdForEntry: options.rowIdForEntry ?? (() => undefined),
    canGesture: options.canGesture ?? (() => true),
    confirm: (_change, apply) => {
      apply();
      return true;
    },
    announce: (change) => {
      announced.push(change);
    },
    paint: (entryIds) => {
      painted.push(entryIds);
    },
  };
  return { ports, announced, painted };
}

// Retired (ADR 0026, #421): 'SegmentSelection ordering (#212, ADR 0010)' used to prove that
// `entryIds` re-sorted a proposed Selection by resolved row rank — it had to, because a proposal
// arrived as Segment ids and the getter derived Entries from them through `entryIdsOfSegments`,
// stable-sorted by row rank so two Entries picked out of order still read in row order. `propose()`
// now takes Entry ids directly and stores exactly the list it is given (`entry-selection.ts`); there
// is no Segment projection left to sort. Every caller that used to hand Segment ids in click order
// now hands Entry ids already in row order — `selectableEntriesOf`, `selectableEntriesInRowOrder`,
// and `step` all build row-ordered lists before they ever reach `propose`. So the question "does
// propose reorder what I hand it" no longer has a caller who needs "no" to be untrue, and the
// in-order contract those callers already rely on is exercised by the blocks below instead.

describe('EntrySelection.selectableEntriesOf, both hit kinds (#212, ADR 0010, ADR 0025)', () => {
  it('a row hit names every selectable Entry the row owns', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const rows: EntrySelectionRow[] = [{ id: rowId('packed'), kind: 'entry', entryIds: [e1, e2] }];
    const { ports } = buildPorts({ rows });
    const selection = new EntrySelection(ports);

    expect(selection.selectableEntriesOf({ kind: 'row', rowId: rowId('packed') })).toEqual([e1, e2]);
  });

  it('a row hit skips an Entry the row owns that refuses select (#185)', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const rows: EntrySelectionRow[] = [{ id: rowId('packed'), kind: 'entry', entryIds: [e1, e2] }];
    const { ports } = buildPorts({ rows, canGesture: (_c, id) => id !== e2 });
    const selection = new EntrySelection(ports);

    expect(selection.selectableEntriesOf({ kind: 'row', rowId: rowId('packed') })).toEqual([e1]);
  });

  it('a header row hit names nothing — a header row owns no Entry', () => {
    const rows: EntrySelectionRow[] = [{ id: rowId('h1'), kind: 'header', entryIds: [] }];
    const { ports } = buildPorts({ rows });
    const selection = new EntrySelection(ports);

    expect(selection.selectableEntriesOf({ kind: 'row', rowId: rowId('h1') })).toEqual([]);
  });

  it('a bar hit names its own Entry — whichever partIndex drew it — when it may be selected, and nothing when it may not (#421 ADR 0026)', () => {
    const e1 = entryId('e1');
    const bar = barId(e1, 1);
    const { ports: allowed } = buildPorts();
    expect(new EntrySelection(allowed).selectableEntriesOf({ kind: 'bar', barId: bar })).toEqual([e1]);

    const { ports: refused } = buildPorts({ canGesture: () => false });
    expect(new EntrySelection(refused).selectableEntriesOf({ kind: 'bar', barId: bar })).toEqual([]);
  });
});

describe('EntrySelection.selectableEntriesInRowOrder (#212, finding 10)', () => {
  it('lists each row in order, each row own Entries in row order', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const e3 = entryId('e3');
    const rows: EntrySelectionRow[] = [
      { id: rowId('r1'), kind: 'header', entryIds: [] },
      { id: rowId('r2'), kind: 'entry', entryIds: [e2, e3] },
      { id: rowId('r3'), kind: 'entry', entryIds: [e1] },
    ];
    const { ports } = buildPorts({ rows });
    const selection = new EntrySelection(ports);

    expect(selection.selectableEntriesInRowOrder()).toEqual([e2, e3, e1]);
  });
});

describe('EntrySelection.step (#212)', () => {
  // Retired (ADR 0026, #421): 'steps to the next Segment of the same Entry on the row it sits on'
  // used to prove that stepping walked a several-Segment Entry's own parts in place. A Segment is an
  // ordinary child Entry now, so a single Entry has no internal parts left to step through — only a
  // shared row of several Entries has anything to step across, which is the surviving test below
  // (#421 C3, spike Q9).

  it('does nothing when nothing is selected, or the row has nowhere to step', () => {
    const e1 = entryId('e1');
    const rows: EntrySelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1] }];
    const { ports } = buildPorts({ rows, rowIdForEntry: () => rowId('r1') });
    const selection = new EntrySelection(ports);

    selection.step(1); // nothing selected
    expect(selection.entryIds).toEqual([]);

    selection.propose([e1]);
    selection.step(1); // one entry on its row, nowhere to go
    expect(selection.entryIds).toEqual([e1]);
  });

  it('steps every selected Entry on a shared row, not only the first (#421 C3, spike Q9)', () => {
    // A segmented row draws three child Entries as its own bars. Selecting the first and the last and
    // stepping forward used to read `entryIds[0]` alone, move that one Entry, and drop the rest of
    // the Selection — the spike's own finding.
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const e3 = entryId('e3');
    const rows: EntrySelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1, e2, e3] }];
    const { ports } = buildPorts({ rows, rowIdForEntry: () => rowId('r1') });
    const selection = new EntrySelection(ports);
    selection.propose([e1, e3]);

    selection.step(1);

    // e1 steps forward to e2. e3 already sits at the row's end and stays — neither drops out.
    expect(selection.entryIds).toEqual([e2, e3]);
  });

  it('writes nothing when every selected Entry is already at its row end', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const rows: EntrySelectionRow[] = [{ id: rowId('r1'), kind: 'entry', entryIds: [e1, e2] }];
    const { ports, painted } = buildPorts({ rows, rowIdForEntry: () => rowId('r1') });
    const selection = new EntrySelection(ports);
    selection.propose([e2]); // already the row's last Entry
    painted.length = 0;

    selection.step(1);

    expect(selection.entryIds).toEqual([e2]);
    expect(painted).toEqual([]);
  });
});

describe('EntrySelection.forgetEntriesTheDatasetDropped (#212, finding 8)', () => {
  function storedEntry(id: EntryId): StoredEntry {
    return { id, props: {} };
  }

  function changeSetDropping(entryIds: readonly EntryId[]): ChangeSet {
    return {
      id: 'cs-1' as ChangeSet['id'],
      origin: 'user',
      added: [],
      removed: entryIds.map((id) => ({ store: 'entries', entity: storedEntry(id) })),
      updated: [],
    };
  }

  it('drops an Entry the Dataset removed, paints and announces the survivors, refuses nothing', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const { ports, announced, painted } = buildPorts();
    const selection = new EntrySelection(ports);
    selection.propose([e1, e2]);
    painted.length = 0; // the setup propose() above painted once; only the drop below is under test

    selection.forgetEntriesTheDatasetDropped(changeSetDropping([e1]));

    expect(selection.entryIds).toEqual([e2]);
    expect(painted).toEqual([[e2]]);
    expect(announced).toEqual([{ from: [e1, e2], to: [e2] }]);
  });

  it('does nothing when the dropped Entry was never selected', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const { ports, announced, painted } = buildPorts();
    const selection = new EntrySelection(ports);
    selection.propose([e2]);
    painted.length = 0;

    selection.forgetEntriesTheDatasetDropped(changeSetDropping([e1]));

    expect(selection.entryIds).toEqual([e2]);
    expect(painted).toEqual([]);
    expect(announced).toEqual([]);
  });

  it('does nothing when the Selection is already empty', () => {
    const e1 = entryId('e1');
    const { ports, announced, painted } = buildPorts();
    const selection = new EntrySelection(ports);

    selection.forgetEntriesTheDatasetDropped(changeSetDropping([e1]));

    expect(painted).toEqual([]);
    expect(announced).toEqual([]);
  });
});

describe('EntrySelection.soleEntry (#212, findings 6-7, ADR 0025)', () => {
  it('answers the sole selected Entry, or undefined across two Entries or none', () => {
    const e1 = entryId('e1');
    const e2 = entryId('e2');
    const { ports } = buildPorts();
    const selection = new EntrySelection(ports);

    selection.propose([e1]);
    expect(selection.soleEntry()).toBe(e1);

    selection.propose([e1, e2]);
    expect(selection.soleEntry()).toBeUndefined();

    selection.propose([]);
    expect(selection.soleEntry()).toBeUndefined();
  });
});

describe('EntrySelection.propose (D-S3-10)', () => {
  it('is a no-op when the proposed list is the same list already selected', () => {
    const e1 = entryId('e1');
    const { ports, announced, painted } = buildPorts();
    const selection = new EntrySelection(ports);
    selection.propose([e1]);

    selection.propose([e1]);

    expect(painted).toEqual([[e1]]); // only the first propose painted
    expect(announced).toEqual([]); // forgetEntriesTheDatasetDropped announces; propose does not
  });

  it('never applies when confirm refuses the change', () => {
    const e1 = entryId('e1');
    const confirm = vi.fn(() => false);
    const ports: EntrySelectionPorts = {
      plannedRows: () => [],
      rowIdForEntry: () => undefined,
      canGesture: () => true,
      confirm,
      announce: () => {},
      paint: () => {},
    };
    const selection = new EntrySelection(ports);

    selection.propose([e1]);

    expect(confirm).toHaveBeenCalledWith({ from: [], to: [e1] }, expect.any(Function));
    expect(selection.entryIds).toEqual([]);
  });
});
