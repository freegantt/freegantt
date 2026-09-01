// layout/ — how one row's items stack into lanes (D-S4-19, D-S4-26). Greedy first-fit: each Item
// takes the first lane whose last occupant does not overlap it. Storage is half-open, so
// `a.end === b.start` shares a lane.

import type { ItemId, Instant } from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import type { Item } from '../items/produce-items.js';

/** Fallback for `--fg-lane-gap` when the stylesheet token is unset. */
export const DEFAULT_LANE_GAP_PX = 2;

export interface LanePacking {
  laneByItem: ReadonlyMap<ItemId, number>;
  laneCount: number;
}

export interface PackedRow {
  items: readonly Item[];
  packing: LanePacking;
}

/** Call: `packedRowHeight(packing.laneCount, rowHeight, laneGap)`. An empty row still occupies
 *  one lane so the grid line does not collapse (D-S4-27). */
export function packedRowHeight(laneCount: number, rowHeight: number, laneGap: number): number {
  const lanes = Math.max(1, laneCount);
  return lanes * rowHeight + (lanes - 1) * laneGap;
}

/** Call: `yForLane(row.top, bar.lane, rowHeight, laneGap)`. */
export function yForLane(rowTop: number, lane: number, rowHeight: number, laneGap: number): number {
  return rowTop + lane * (rowHeight + laneGap);
}

export function packRow(items: readonly Item[]): LanePacking {
  const laneByItem = new Map<ItemId, number>();
  if (items.length === 0) return { laneByItem, laneCount: 1 };

  const ordered = items.slice().sort(comparePackOrder);
  const laneEnd: Instant[] = [];
  for (const item of ordered) {
    let lane = laneEnd.findIndex((end) => diffMs(item.start, end) >= 0);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(item.end);
    } else {
      laneEnd[lane] = item.end;
    }
    laneByItem.set(item.id, lane);
  }
  return { laneByItem, laneCount: Math.max(1, laneEnd.length) };
}

function comparePackOrder(a: Item, b: Item): number {
  const startOrder = diffMs(a.start, b.start);
  if (startOrder !== 0) return startOrder;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
