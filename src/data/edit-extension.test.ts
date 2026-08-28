import { describe, expect, it } from 'vitest';
import { identityExtender } from './edit-extension.js';
import { entryId } from '../model/index.js';
import type { Entry, EntryId } from '../model/index.js';
import type { StoredEdit } from './edit-extension.js';

function entry(id: string): Entry {
  return { id: entryId(id), name: id, start: 0 as Entry['start'], end: 1 as Entry['end'], kind: 'span' };
}

describe('identityExtender', () => {
  it('returns an empty EntryEdits map — no cascade, ever', () => {
    const t1 = entry('t1');
    const proposed = new Map<EntryId, StoredEdit>([[t1.id, { name: 'Framing' }]]);
    const result = identityExtender({ entries: new Map([[t1.id, t1]]), proposed });
    expect(result.size).toBe(0);
  });
});
