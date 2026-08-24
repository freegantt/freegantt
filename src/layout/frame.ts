// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type { RowId, ItemId, EntryId, EntryKind, Entry, Instant } from '../model/index.js';
import { itemId, rowId } from '../model/index.js';

export interface BarFlags {
  hasConflict?: boolean;
  inCycle?: boolean;
}

export interface LinkFlags {
  inactive?: boolean;
  inCycle?: boolean;
}

export interface FrameRow {
  id: RowId;
  index: number;
  top: number;
  height: number;
  laneCount: number;
  label: string;
}

export interface FrameBar {
  id: ItemId;
  entryId: EntryId;
  rowId: RowId;
  kind: EntryKind;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
  flags: BarFlags;
}

export interface GeometryFrame {
  revision: number;
  viewport: { x: number; y: number; width: number; height: number };
  rows: FrameRow[];
  contentHeight: number;
  bars: FrameBar[];
  links: [];
  decorations: [];
}

export interface LayoutInput {
  entries: readonly Entry[];
  /** Typically `TimeScale.xForInstant` (time/scale.ts), bound via a TimeScaleModel (plans/01 §8.2). */
  xForInstant: (instant: Instant) => number;
  rowHeight: number;
  revision: number;
}

/** S0 scope: flat row-per-entry, one bar per entry, fixed row height (plans/03 S0). */
export function computeFrame(input: LayoutInput): GeometryFrame {
  const { entries, xForInstant, rowHeight, revision } = input;
  const rows: FrameRow[] = [];
  const bars: FrameBar[] = [];

  entries.forEach((entry, index) => {
    const id = rowId(`row:${entry.id}`);
    const top = index * rowHeight;
    rows.push({ id, index, top, height: rowHeight, laneCount: 1, label: entry.name });

    const x = xForInstant(entry.start);
    const width = Math.max(0, xForInstant(entry.end) - x);
    bars.push({
      id: itemId(entry.id),
      entryId: entry.id,
      rowId: id,
      kind: entry.kind ?? 'span',
      x,
      y: top,
      width,
      height: rowHeight,
      lane: 0,
      flags: {},
    });
  });

  return {
    revision,
    viewport: { x: 0, y: 0, width: 0, height: rows.length * rowHeight },
    rows,
    contentHeight: rows.length * rowHeight,
    bars,
    links: [],
    decorations: [],
  };
}
