// data/ — `isDescendantOf`'s own contract: an Entry is never its own ancestor (#473), even when the
// chain it walks loops back on itself before core has had a revision to break the cycle.

import { describe, expect, it } from 'vitest';
import { isDescendantOf } from './hierarchy-source.js';
import { entryId } from '../model/index.js';
import type { StoredEntry } from '../model/index.js';

describe('isDescendantOf (#473)', () => {
  it('answers false for an Entry asked about itself, through a raw cycle an open transaction has not broken yet', () => {
    const id = entryId('id');
    const a = entryId('A');
    const entries = new Map<typeof id, StoredEntry>([
      [id, { id, parentId: a, props: {} }],
      [a, { id: a, parentId: id, props: {} }],
    ]);
    const entryFor = (lookupId: typeof id): StoredEntry | undefined => entries.get(lookupId);
    const parentIdOf = (entry: StoredEntry): typeof id | undefined => entry.parentId;

    expect(isDescendantOf(id, id, entryFor, parentIdOf)).toBe(false);
  });
});
