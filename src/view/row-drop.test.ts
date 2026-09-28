import { describe, expect, it } from 'vitest';
import { resolveRowDrop } from './row-drop.js';
import type { RowDropInput } from './row-drop.js';
import type { RowsForDrop } from '../layout/row-drop-target.js';
import type { RowDropZone } from '../layout/row-drop-zone.js';
import { PLANNED_ROW_KIND } from '../layout/rows/row-source.js';
import type { PlannedRow } from '../layout/rows/row-source.js';
import { entryDoubles } from '../layout/entry-double.js';
import { rowId } from '../model/index.js';
import type { Entry, EntryId } from '../model/index.js';

// P1{a, b}, P2{c}, r, g — every row expanded, `g` a childrenAsSegments row with no rows of its own
// children. Root order: P1, P2, r, g.
const [P1, a, b, P2, c, r, g] = entryDoubles([
  { id: 'P1', props: { siblingIndex: 0 } },
  { id: 'a', parentId: 'P1', props: { siblingIndex: 0 } },
  { id: 'b', parentId: 'P1', props: { siblingIndex: 1 } },
  { id: 'P2', props: { siblingIndex: 1 } },
  { id: 'c', parentId: 'P2', props: { siblingIndex: 0 } },
  { id: 'r', props: { siblingIndex: 2 } },
  { id: 'g', props: { siblingIndex: 3 } },
]) as [Entry, Entry, Entry, Entry, Entry, Entry, Entry];

function entryRow(entry: Entry, depth: number, overrides: Partial<PlannedRow> = {}): PlannedRow {
  return {
    id: rowId(entry.id),
    kind: PLANNED_ROW_KIND.entry,
    index: 0,
    depth,
    entryIds: [entry.id],
    expandable: entry.hasChildren,
    expanded: entry.hasChildren,
    ...overrides,
  };
}

const HEADER_ROW: PlannedRow = {
  id: rowId('header'),
  kind: PLANNED_ROW_KIND.header,
  index: 6,
  depth: 0,
  entryIds: [],
  expandable: false,
  expanded: false,
  headerLabel: 'Group',
};

const ROWS: readonly PlannedRow[] = [
  entryRow(P1, 0, { index: 0 }),
  entryRow(a, 1, { index: 1 }),
  entryRow(b, 1, { index: 2 }),
  entryRow(P2, 0, { index: 3 }),
  entryRow(c, 1, { index: 4 }),
  entryRow(r, 0, { index: 5 }),
  HEADER_ROW,
  entryRow(g, 0, { index: 7, childrenAsSegments: true }),
];

const ROW_HEIGHT = 32;

function rowsForDrop(): RowsForDrop {
  const byId = new Map<string, Entry>([P1, a, b, P2, c, r, g].map((entry) => [String(entry.id), entry]));
  return {
    rows: ROWS,
    rowTop: (index) => index * ROW_HEIGHT,
    rowHeightAt: () => ROW_HEIGHT,
    entryOf: (id) => byId.get(String(id)),
    rootEntries: () => [P1, P2, r, g],
  };
}

function rowZone(rowIndex: number, side: 'before' | 'into' | 'after'): Extract<RowDropZone, { kind: 'row' }> {
  return { kind: 'row', rowIndex, side };
}

/** Every reorder rule open, every write open — the default a drop needs to land. */
const ALWAYS_CAN_PLACE = (): boolean => true;

/** `reorder` itself refused: no parent, no matter which, ever lets the Entry land. */
const REORDER_REFUSED = (): boolean => false;

/** `parentId` locked to `'api'`: a same-parent drop still lands, a cross-parent drop never does. */
function parentLocked(entry: Entry): (candidate: Entry, parentId: EntryId | undefined) => boolean {
  return (candidate, parentId) => candidate.id !== entry.id || parentId === candidate.parent()?.id;
}

function input(overrides: Partial<RowDropInput> = {}): RowDropInput {
  return {
    zone: rowZone(3, 'before'),
    movedTopMost: [a],
    rows: rowsForDrop(),
    canPlace: ALWAYS_CAN_PLACE,
    verticalDropOffered: true,
    ...overrides,
  };
}

describe('resolveRowDrop', () => {
  it('the pointer over the source row is always a time-only move', () => {
    const drop = resolveRowDrop(input({ zone: { kind: 'sourceRow' } }));
    expect(drop).toEqual({ kind: 'timeOnly' });
  });

  it('a row source with no vertical drop resolves every plain row to a time-only move', () => {
    const drop = resolveRowDrop(input({ verticalDropOffered: false, zone: rowZone(3, 'before') }));
    expect(drop).toEqual({ kind: 'timeOnly' });
  });

  it('a childrenAsSegments row still places even when the row source offers no vertical drop', () => {
    const drop = resolveRowDrop(
      input({ verticalDropOffered: false, movedTopMost: [a], zone: rowZone(7, 'into') }),
    );
    expect(drop.kind).toBe('place');
  });

  it('a group header row refuses with groupHeader', () => {
    const drop = resolveRowDrop(input({ zone: rowZone(6, 'before') }));
    expect(drop).toEqual({ kind: 'refused', rowId: HEADER_ROW.id, reason: 'groupHeader' });
  });

  it('dropping a parent onto its own child refuses with ownDescendant', () => {
    const drop = resolveRowDrop(input({ movedTopMost: [P1], zone: rowZone(1, 'into') }));
    expect(drop).toEqual({ kind: 'refused', rowId: rowId('a'), reason: 'ownDescendant' });
  });

  it('dropping a parent onto a grandchild also refuses with ownDescendant', () => {
    const [gp, mid, leaf] = entryDoubles([
      { id: 'gp', props: { siblingIndex: 0 } },
      { id: 'mid', parentId: 'gp', props: { siblingIndex: 0 } },
      { id: 'leaf', parentId: 'mid', props: { siblingIndex: 0 } },
    ]) as [Entry, Entry, Entry];
    const rows: readonly PlannedRow[] = [
      entryRow(gp, 0, { index: 0 }),
      entryRow(mid, 1, { index: 1 }),
      entryRow(leaf, 2, { index: 2 }),
    ];
    const byId = new Map([gp, mid, leaf].map((entry) => [String(entry.id), entry]));
    const rowsForDrop: RowsForDrop = {
      rows,
      rowTop: (index) => index * ROW_HEIGHT,
      rowHeightAt: () => ROW_HEIGHT,
      entryOf: (id) => byId.get(String(id)),
      rootEntries: () => [gp],
    };
    const drop = resolveRowDrop(input({ rows: rowsForDrop, movedTopMost: [gp], zone: rowZone(2, 'into') }));
    expect(drop).toEqual({ kind: 'refused', rowId: rowId('leaf'), reason: 'ownDescendant' });
  });

  it('a moved Entry whose reorder capability refuses reports capability, same parent included', () => {
    const drop = resolveRowDrop(input({ canPlace: REORDER_REFUSED, zone: rowZone(2, 'after') }));
    expect(drop).toEqual({ kind: 'refused', rowId: rowId('b'), reason: 'capability' });
  });

  it('a parentId locked to api refuses a cross-parent drop with parentLocked', () => {
    const drop = resolveRowDrop(input({ canPlace: parentLocked(a), zone: rowZone(3, 'before') }));
    expect(drop).toEqual({
      kind: 'refused',
      rowId: P2.id,
      reason: 'parentLocked',
    });
  });

  it('a parentId locked to api still lets a same-parent reorder land', () => {
    const drop = resolveRowDrop(input({ canPlace: parentLocked(a), zone: rowZone(2, 'after') }));
    expect(drop.kind).toBe('place');
  });

  it('places a leaf before its own sibling, in its own group', () => {
    const drop = resolveRowDrop(input({ movedTopMost: [b], zone: rowZone(1, 'before') }));
    expect(drop.kind).toBe('place');
    if (drop.kind !== 'place') throw new Error('expected a place');
    expect(drop.moves).toEqual([
      {
        id: b.id,
        parentId: P1.id,
        at: 0,
        place: { parentId: P1.id, siblingIndex: 0 },
        currentPlace: { parentId: P1.id, siblingIndex: 1 },
      },
    ]);
  });

  it('places a multi-selection before a root, grabbed first, with contiguous final ranks', () => {
    const drop = resolveRowDrop(input({ movedTopMost: [a, c], zone: rowZone(5, 'before') }));
    expect(drop.kind).toBe('place');
    if (drop.kind !== 'place') throw new Error('expected a place');
    expect(drop.moves.map((move) => move.id)).toEqual([a.id, c.id]);
    expect(drop.moves.map((move) => move.place.siblingIndex)).toEqual([2, 3]);
    expect(drop.moves.every((move) => move.place.parentId === undefined)).toBe(true);
  });

  it('a selected child of a selected parent never appears in moves on its own', () => {
    const drop = resolveRowDrop(input({ movedTopMost: [P1], zone: rowZone(5, 'before') }));
    expect(drop.kind).toBe('place');
    if (drop.kind !== 'place') throw new Error('expected a place');
    expect(drop.moves).toHaveLength(1);
    expect(drop.moves[0]!.id).toBe(P1.id);
  });
});
