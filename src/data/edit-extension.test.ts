import { describe, expect, it } from 'vitest';
import { identityExtender } from './edit-extension.js';
import { DatasetState } from './dataset-state.js';
import { runTransaction } from './transaction.js';
import { entryId, segmentId } from '../model/index.js';
import type { Entry, EntryId } from '../model/index.js';
import { mergeEntryEdits, proposedKeysOf } from './fields/field-access.js';
import type { EditExtender, EntryEdits, StoredEdit } from './edit-extension.js';

function entry(id: string): Entry {
  return {
    id: entryId(id),
    name: id,
    start: 0 as Entry['start'],
    end: 1 as Entry['end'],
    kind: 'span',
    segments: [{ id: segmentId(`${id}-seg`), start: 0 as Entry['start'], end: 1 as Entry['end'] }],
  };
}

describe('identityExtender', () => {
  it('returns an empty EntryEdits map — no cascade, ever', () => {
    const t1 = entry('t1');
    const proposed = new Map<EntryId, StoredEdit>([[t1.id, { name: 'Framing' }]]);
    const entries = new Map([[t1.id, t1]]);
    const result = identityExtender({ entries, proposed, entryAfterEdits: (id) => entries.get(id) });
    expect(result.size).toBe(0);
  });
});

// D-S5-23: installing an extender composes rather than evicting. `data/` still holds one field and
// calls it at one site — what changes is only how a second plugin arrives.
describe('DatasetState.setExtender (D-S5-23)', () => {
  const requestEntries = new Map<EntryId, Entry>();
  const request = {
    entries: requestEntries,
    proposed: new Map() as EntryEdits,
    entryAfterEdits: (id: EntryId) => requestEntries.get(id),
  };

  /** One wrapper that runs the current occupant, then adds a name of its own to the result. */
  function appends(name: string): (next: EditExtender) => EditExtender {
    return (next) => (call) => mergeEntryEdits(next(call), new Map([[entryId(name), { name }]]));
  }

  it('leaves identityExtender in the hook when no plugin claims it', () => {
    expect(new DatasetState({ entries: [], timeZone: 'UTC' }).editExtender).toBe(identityExtender);
  });

  it('hands the current occupant to the wrapper, so a second plugin adds to the first cascade', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    state.setExtender(appends('first'));
    state.setExtender(appends('second'));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('first'), entryId('second')]);
  });

  it('lets a wrapper that ignores next replace the occupant outright', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    state.setExtender(appends('first'));
    state.setExtender(() => () => new Map([[entryId('only'), { name: 'only' }]]));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('only')]);
  });

  it('composes onto an extender the constructor already installed', () => {
    const seeded: EditExtender = () => new Map([[entryId('seeded'), { name: 'seeded' }]]);
    const state = new DatasetState({ entries: [], timeZone: 'UTC', editExtender: seeded });
    state.setExtender(appends('wrapper'));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('seeded'), entryId('wrapper')]);
  });
});

// #197: the law two extenders on one Entry have to obey. Every example in the contract used to compose
// with a `Map` spread, and every test stayed green because each wrapper wrote a different Entry id.
// S7 is the first slice with a second occupant on the hook, and a cascade that moves an entry is the
// colliding case, so the merge is pinned here rather than discovered there.
describe('composing two extenders that write one Entry (#197)', () => {
  const target = entryId('t1');
  const requestEntries = new Map<EntryId, Entry>();
  const request = {
    entries: requestEntries,
    proposed: new Map() as EntryEdits,
    entryAfterEdits: (id: EntryId) => requestEntries.get(id),
  };

  /** Proposes a `meta`-sourced Field — `proposedKeys` is how such a write is recognized. */
  const proposesCost: EditExtender = () =>
    new Map([[target, { meta: { cost: 500 }, proposedKeys: new Set(['cost']) }]]);

  /** Moves the same entry, the way an S7 cascade does. */
  const movesTarget: EditExtender = () =>
    new Map([[target, { start: 10 as Entry['start'], end: 20 as Entry['end'] }]]);

  function composed(inner: EditExtender, outer: EditExtender): EntryEdits {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    state.setExtender(() => inner);
    state.setExtender((next) => (call) => mergeEntryEdits(next(call), outer(call)));
    return state.editExtender(request);
  }

  it('keeps both writes, whichever extender wrapped the other', () => {
    for (const edits of [composed(proposesCost, movesTarget), composed(movesTarget, proposesCost)]) {
      const edit = edits.get(target);
      expect(edit?.meta).toEqual({ cost: 500 });
      expect(edit?.start).toBe(10);
      expect(edit?.end).toBe(20);
    }
  });

  it('keeps every proposed key, so the meta-sourced Field is still recognized', () => {
    for (const edits of [composed(proposesCost, movesTarget), composed(movesTarget, proposesCost)]) {
      const keys = [...proposedKeysOf(edits.get(target))].sort();
      expect(keys).toEqual(['cost', 'end', 'start']);
    }
  });

  it('the outer extender wins on a Field both wrote', () => {
    const shiftsFurther: EditExtender = () => new Map([[target, { start: 99 as Entry['start'] }]]);
    expect(composed(movesTarget, shiftsFurther).get(target)?.start).toBe(99);
    expect(composed(movesTarget, shiftsFurther).get(target)?.end).toBe(20);
  });
});

// #238: the law at depth three. Two extenders on one Entry obeyed it; a third dropped both earlier
// plugins' writes, because a merge of two edits that state no `proposedKeys` used to stamp an empty
// set, and an empty set reads as "the author stated nothing at all" nowhere — `keysWrittenBy` falls
// back to the raw keys only when `proposedKeys` is absent. The third merge then carried `[]` as the
// base's stated keys, `diffEdit` took its authored branch, and only the last plugin got a row.
//
// The fixture writes `name`, `kind` and `parentId` — non-date Fields on purpose. Date Fields
// (`start`/`end`) on one Entry hit the envelope-companion collision in `readEdit` (#232), which is a
// different defect. A `meta` write as the last plugin would mask this one through `diffEdit`'s
// `authored.has('meta')` escape, so none of the three uses `meta` either.
describe('composing three extenders that write one Entry (#238)', () => {
  const target = entryId('t2');

  /** One wrapper, exactly as `api/dataset-plugin.ts` documents composition. */
  function writes(edit: StoredEdit): (next: EditExtender) => EditExtender {
    return (next) => (call) => mergeEntryEdits(next(call), new Map([[target, edit]]));
  }

  function datasetWithThreePlugins(): DatasetState {
    const state = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: 0, end: 10 },
        { id: 't2', name: 't2', start: 0, end: 10 },
      ],
      timeZone: 'UTC',
    });
    state.setExtender(writes({ name: 'A' }));
    state.setExtender(writes({ kind: 'milestone' }));
    state.setExtender(writes({ parentId: entryId('t1') }));
    return state;
  }

  it('lands every plugin write in the store, not the last one alone', () => {
    const state = datasetWithThreePlugins();
    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    const committed = state.entries.get(target);
    expect(committed?.name).toBe('A');
    expect(committed?.kind).toBe('milestone');
    expect(committed?.parentId).toBe(entryId('t1'));
  });

  it('emits a changeset row for every plugin write, so undo restores all three', () => {
    const state = datasetWithThreePlugins();
    let captured: readonly { id: EntryId; field: string }[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated as readonly { id: EntryId; field: string }[];
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    const onTarget = captured
      .filter((row) => row.id === target)
      .map((row) => row.field)
      .sort();
    expect(onTarget).toEqual(['kind', 'name', 'parentId']);
  });
});
