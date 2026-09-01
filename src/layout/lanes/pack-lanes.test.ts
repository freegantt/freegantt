import { describe, expect, it } from 'vitest';
import { entryId, itemId } from '../../model/index.js';
import type { Instant } from '../../model/index.js';
import type { Item } from '../items/produce-items.js';
import { packRow } from './pack-lanes.js';

function asInstant(ms: number): Instant {
  return ms as Instant;
}

function item(id: string, start: number, end: number, segment = 0): Item {
  return {
    id: itemId(entryId(id), segment),
    entryId: entryId(id),
    kind: 'span',
    label: id,
    start: asInstant(start),
    end: asInstant(end),
  };
}

describe('packRow', () => {
  it('puts non-overlapping Items in lane 0', () => {
    const packing = packRow([item('a', 0, 10), item('b', 10, 20), item('c', 20, 30)]);
    expect(packing.laneCount).toBe(1);
    expect(packing.laneByItem.get(itemId(entryId('a'), 0))).toBe(0);
    expect(packing.laneByItem.get(itemId(entryId('b'), 0))).toBe(0);
    expect(packing.laneByItem.get(itemId(entryId('c'), 0))).toBe(0);
  });

  it('touching spans share a lane because storage is half-open', () => {
    const packing = packRow([item('a', 0, 10), item('b', 10, 20)]);
    expect(packing.laneCount).toBe(1);
    expect(packing.laneByItem.get(itemId(entryId('a'), 0))).toBe(0);
    expect(packing.laneByItem.get(itemId(entryId('b'), 0))).toBe(0);
  });

  it('gives three mutually overlapping Items lanes 0, 1, and 2', () => {
    const packing = packRow([item('a', 0, 30), item('b', 5, 25), item('c', 10, 20)]);
    expect(packing.laneCount).toBe(3);
    expect(packing.laneByItem.get(itemId(entryId('a'), 0))).toBe(0);
    expect(packing.laneByItem.get(itemId(entryId('b'), 0))).toBe(1);
    expect(packing.laneByItem.get(itemId(entryId('c'), 0))).toBe(2);
  });

  it('breaks equal starts by Item.id so the order is deterministic', () => {
    const first = packRow([item('z', 0, 10), item('a', 0, 10)]);
    const second = packRow([item('a', 0, 10), item('z', 0, 10)]);
    expect([...first.laneByItem.entries()]).toEqual([...second.laneByItem.entries()]);
    expect(first.laneByItem.get(itemId(entryId('a'), 0))).toBe(0);
    expect(first.laneByItem.get(itemId(entryId('z'), 0))).toBe(1);
  });

  it('keeps one lane for an empty row', () => {
    expect(packRow([]).laneCount).toBe(1);
  });
});
