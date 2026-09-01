import { describe, expect, it } from 'vitest';
import { entryId, entryIdOfItem, itemId, segmentIndexOfItem } from './ids.js';

describe('entryIdOfItem / segmentIndexOfItem', () => {
  it('round-trips with itemId', () => {
    const id = entryId('t1');
    const item = itemId(id, 2);
    expect(entryIdOfItem(item)).toBe(id);
    expect(segmentIndexOfItem(item)).toBe(2);
  });

  it('round-trips an EntryId that contains a colon', () => {
    const id = entryId('ns:t1');
    const item = itemId(id, 3);
    expect(String(item)).toBe('ns:t1:3');
    expect(entryIdOfItem(item)).toBe(id);
    expect(segmentIndexOfItem(item)).toBe(3);
  });

  it('reads index 0 when itemId omits the segment', () => {
    const id = entryId('t1');
    const item = itemId(id);
    expect(entryIdOfItem(item)).toBe(id);
    expect(segmentIndexOfItem(item)).toBe(0);
  });
});
