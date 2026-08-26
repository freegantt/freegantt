// plans/s1.11-close-the-gate/README.md §6: same seed twice is deep-equal; different seeds differ;
// `count` is honoured; no `Math.random` and no `now()` reachable from it.

import { describe, expect, it } from 'vitest';
import { seededEntryInputs } from './seeded-dataset.js';

describe('seededEntryInputs', () => {
  it('the same seed produces the same entries every time', () => {
    const a = seededEntryInputs({ count: 200, seed: 7 });
    const b = seededEntryInputs({ count: 200, seed: 7 });
    expect(a).toEqual(b);
  });

  it('different seeds produce different entries', () => {
    const a = seededEntryInputs({ count: 200, seed: 1 });
    const b = seededEntryInputs({ count: 200, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('honours count', () => {
    expect(seededEntryInputs({ count: 0 })).toHaveLength(0);
    expect(seededEntryInputs({ count: 5000 })).toHaveLength(5000);
  });

  it('every entry has a unique id and a start strictly before its end', () => {
    const entries = seededEntryInputs({ count: 500, seed: 3 });
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(entries.length);
    for (const entry of entries) {
      expect((entry.start as Date).getTime()).toBeLessThan((entry.end as Date).getTime());
    }
  });

  it('never calls Math.random', () => {
    const spy = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return spy();
    };
    try {
      seededEntryInputs({ count: 5000 });
      expect(called).toBe(false);
    } finally {
      Math.random = spy;
    }
  });

  it('never calls Date.now (drifts with nothing)', () => {
    const spy = Date.now;
    let called = false;
    Date.now = () => {
      called = true;
      return spy();
    };
    try {
      seededEntryInputs({ count: 5000 });
      expect(called).toBe(false);
    } finally {
      Date.now = spy;
    }
  });
});
