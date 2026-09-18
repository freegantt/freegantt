import { describe, expect, it } from 'vitest';
import { entryId, entryIdOfBar, barId, partIndexOfBar } from './ids.js';

describe('entryIdOfBar / partIndexOfBar', () => {
  it('round-trips with barId', () => {
    const id = entryId('t1');
    const item = barId(id, 2);
    expect(entryIdOfBar(item)).toBe(id);
    expect(partIndexOfBar(item)).toBe(2);
  });

  it('round-trips an EntryId that contains a colon', () => {
    const id = entryId('ns:t1');
    const item = barId(id, 3);
    expect(String(item)).toBe('ns:t1:3');
    expect(entryIdOfBar(item)).toBe(id);
    expect(partIndexOfBar(item)).toBe(3);
  });

  it('reads index 0 when barId omits partIndex', () => {
    const id = entryId('t1');
    const item = barId(id);
    expect(entryIdOfBar(item)).toBe(id);
    expect(partIndexOfBar(item)).toBe(0);
  });
});
