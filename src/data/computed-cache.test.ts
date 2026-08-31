import { describe, expect, it } from 'vitest';
import { ComputedFieldCache } from './computed-cache.js';
import { entryId } from '../model/index.js';

describe('ComputedFieldCache (D-S4-10)', () => {
  it('recomputes after the dataset revision bumps', () => {
    const cache = new ComputedFieldCache();
    let calls = 0;
    const read = (): number => {
      calls += 1;
      return calls;
    };

    expect(cache.read(entryId('t1'), 'duration', 0, read)).toBe(1);
    expect(cache.read(entryId('t1'), 'duration', 0, read)).toBe(1);

    expect(cache.read(entryId('t1'), 'duration', 1, read)).toBe(2);
    expect(cache.read(entryId('t1'), 'duration', 1, read)).toBe(2);
  });
});
