// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type { RowId, ItemId, TaskId, TaskKind, Task, Instant } from '../model/index.js';
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
  taskId: TaskId;
  rowId: RowId;
  kind: TaskKind;
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
  tasks: readonly Task[];
  /** Typically `TimeScale.xForInstant` (time/scale.ts), bound via a TimeScaleModel (plans/01 §8.2). */
  xForInstant: (instant: Instant) => number;
  rowHeight: number;
  revision: number;
}

/** S0 scope: flat row-per-task, one bar per task, fixed row height (plans/03 S0). */
export function computeFrame(input: LayoutInput): GeometryFrame {
  const { tasks, xForInstant, rowHeight, revision } = input;
  const rows: FrameRow[] = [];
  const bars: FrameBar[] = [];

  tasks.forEach((task, index) => {
    const id = rowId(`row:${task.id}`);
    const top = index * rowHeight;
    rows.push({ id, index, top, height: rowHeight, laneCount: 1, label: task.name });

    const x = xForInstant(task.start);
    const width = Math.max(0, xForInstant(task.end) - x);
    bars.push({
      id: itemId(task.id),
      taskId: task.id,
      rowId: id,
      kind: task.kind ?? 'task',
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
