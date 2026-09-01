// layout/ — how one row's items stack into lanes (D-S4-19). S4.8 replaces this with overlap packing.

import type { ItemId } from '../../model/index.js';
import type { Item } from '../items/produce-items.js';

export interface LanePacking {
  laneByItem: ReadonlyMap<ItemId, number>;
  laneCount: number;
}

export function packRow(items: readonly Item[]): LanePacking {
  const laneByItem = new Map<ItemId, number>();
  for (const item of items) laneByItem.set(item.id, 0);
  return { laneByItem, laneCount: 1 };
}
