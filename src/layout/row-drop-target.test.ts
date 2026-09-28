import { describe, expect, it } from 'vitest';
import { dropPlaceFor } from './row-drop-target.js';
import type { RowsForDrop } from './row-drop-target.js';
import type { RowDropZone } from './row-drop-zone.js';
import { entryDoubles } from './entry-double.js';
import { PLANNED_ROW_KIND } from './rows/row-source.js';
import type { PlannedRow } from './rows/row-source.js';
import { entryId, rowId } from '../model/index.js';
import type { Entry } from '../model/index.js';

// P1{a, b}, P2{c}, r — every row expanded, uniform 32px rows, in plan order:
//   0 P1  1 a  2 b  3 P2  4 c  5 r
const [P1, a, b, P2, c, r] = entryDoubles([
  { id: 'P1' },
  { id: 'a', parentId: 'P1' },
  { id: 'b', parentId: 'P1' },
  { id: 'P2' },
  { id: 'c', parentId: 'P2' },
  { id: 'r' },
]) as [Entry, Entry, Entry, Entry, Entry, Entry];

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

const ROWS: readonly PlannedRow[] = [
  entryRow(P1, 0, { index: 0 }),
  entryRow(a, 1, { index: 1 }),
  entryRow(b, 1, { index: 2 }),
  entryRow(P2, 0, { index: 3 }),
  entryRow(c, 1, { index: 4 }),
  entryRow(r, 0, { index: 5 }),
];

const ROW_HEIGHT = 32;

function rowsForDrop(rows: readonly PlannedRow[] = ROWS): RowsForDrop {
  const byId = new Map<string, Entry>([P1, a, b, P2, c, r].map((entry) => [String(entry.id), entry]));
  return {
    rows,
    rowTop: (index) => index * ROW_HEIGHT,
    rowHeightAt: () => ROW_HEIGHT,
    entryOf: (id) => byId.get(String(id)),
    rootEntries: () => [P1, P2, r],
  };
}

function rowZone(rowIndex: number, side: 'before' | 'into' | 'after'): Extract<RowDropZone, { kind: 'row' }> {
  return { kind: 'row', rowIndex, side };
}

describe('dropPlaceFor', () => {
  it('drops into a leaf, which becomes a parent with the leaf as its first child', () => {
    const place = dropPlaceFor(rowZone(4, 'into'), rowsForDrop());
    expect(place).toMatchObject({ parentId: c.id, index: 0, depth: 2, lineY: undefined });
  });

  it('drops before the first child of a group: same parent, rank 0', () => {
    const place = dropPlaceFor(rowZone(1, 'before'), rowsForDrop());
    expect(place).toMatchObject({ parentId: P1.id, index: 0, depth: 1 });
  });

  it('drops after the last child of a group: same parent, past its rank', () => {
    const place = dropPlaceFor(rowZone(2, 'after'), rowsForDrop());
    expect(place).toMatchObject({ parentId: P1.id, index: 2, depth: 1 });
  });

  it('drops before a root: root group, its own rank, at the same depth as the row above', () => {
    const before = dropPlaceFor(rowZone(3, 'before'), rowsForDrop());
    const after = dropPlaceFor(rowZone(2, 'after'), rowsForDrop());
    expect(before).toMatchObject({ parentId: undefined, index: 1, depth: 0 });
    // The bottom of a group's last child and the top of the row right after it paint the same
    // Insertion line, at two different indents — that is the owner's "make a child of the child"
    // boundary, expressed as one shared y and two depths.
    expect((before as { lineY: number }).lineY).toBe((after as { lineY: number }).lineY);
    expect((before as { depth: number }).depth).not.toBe((after as { depth: number }).depth);
  });

  it('drops after an expanded group: becomes its first child', () => {
    const place = dropPlaceFor(rowZone(0, 'after'), rowsForDrop());
    expect(place).toMatchObject({ parentId: P1.id, index: 0, depth: 1 });
  });

  it('drops after a collapsed group: becomes its next root sibling', () => {
    const collapsed = ROWS.map((row) => (row.id === rowId(P1.id) ? { ...row, expanded: false } : row));
    const place = dropPlaceFor(rowZone(0, 'after'), rowsForDrop(collapsed));
    expect(place).toMatchObject({ parentId: undefined, index: 1, depth: 0 });
  });

  it('a childrenAsSegments row resolves into, whatever side the zone names', () => {
    const segmented = ROWS.map((row) =>
      row.id === rowId(c.id) ? { ...row, childrenAsSegments: true } : row,
    );
    const place = dropPlaceFor(rowZone(4, 'before'), rowsForDrop(segmented));
    expect(place).toMatchObject({ parentId: c.id, index: 0, depth: 2 });
  });

  it('a header row refuses, on any side', () => {
    const withHeader: readonly PlannedRow[] = [
      {
        id: rowId(entryId('grp')),
        kind: PLANNED_ROW_KIND.header,
        index: 0,
        depth: 0,
        entryIds: [],
        expandable: false,
        expanded: false,
      },
      ...ROWS,
    ];
    const place = dropPlaceFor(rowZone(0, 'into'), rowsForDrop(withHeader));
    expect(place).toEqual({ refused: 'groupHeader', rowId: withHeader[0]!.id });
  });

  it('below the last row appends as the last root', () => {
    const place = dropPlaceFor({ kind: 'belowLastRow' }, rowsForDrop());
    expect(place).toMatchObject({ parentId: undefined, index: 3, depth: 0, rowId: undefined, side: 'end' });
    expect((place as { lineY: number }).lineY).toBe(ROWS.length * ROW_HEIGHT);
  });
});
