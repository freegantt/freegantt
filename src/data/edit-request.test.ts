import { describe, expect, it } from 'vitest';
import { createEditRequest } from './edit-request.js';
import { storedParentSource } from './hierarchy-source.js';
import { entryId } from '../model/index.js';
import type { Instant, ProposedEdit, ProposedEdits, StoredEntry } from '../model/index.js';

/** No Field lookup is under test here — every request below asks nothing that reads one. */
const noFields = { get: () => undefined };

function entry(id: string, start: number, end: number): StoredEntry {
  return { id: entryId(id), name: id, start: start as Instant, end: end as Instant, props: {} };
}

function proposedEdit(patch: Record<string, unknown>): ProposedEdit {
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(Object.keys(patch)), ...patch };
}

describe('createEditRequest', () => {
  it('answers entryAfterEdits with one .get, never a walk of the committed entries (D-S5-45)', () => {
    // D-S5-45: a hook reads `entryAfterEdits` on every preview frame to see this transaction's own
    // body edit — that read must cost one lookup, not a copy or a walk of the roster, whether or not
    // this row has a proposed edit at all (`gesture-pipeline.test.ts` pins the other half of this
    // idea: wiring a hook at all must not force a roster copy).
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    const proposed: ProposedEdits = new Map([[entryId('a'), proposedEdit({ start: 10 })]]);
    const request = createEditRequest({
      entries: roster,
      proposed,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map(),
      fields: noFields,
    });

    const seen = request.entryAfterEdits(entryId('a'));

    expect(walks).toBe(0);
    expect(seen?.start).toBe(10);
  });

  it('answers entryAfterEdits for a row with no proposed edit at the same one-lookup cost', () => {
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    const request = createEditRequest({
      entries: roster,
      proposed: new Map() as ProposedEdits,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map(),
      fields: noFields,
    });

    const seen = request.entryAfterEdits(entryId('a'));

    expect(walks).toBe(0);
    expect(seen?.start).toBe(0);
  });
});
