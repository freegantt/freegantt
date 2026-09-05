import { describe, expect, it } from 'vitest';
import { identityExtender } from './edit-extension.js';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import type { Entry, EntryId } from '../model/index.js';
import type { EditExtender, EntryEdits, StoredEdit } from './edit-extension.js';

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

// D-S5-23: installing an extender composes rather than evicting. `data/` still holds one field and
// calls it at one site — what changes is only how a second plugin arrives.
describe('DatasetState.setExtender (D-S5-23)', () => {
  const request = { entries: new Map<EntryId, Entry>(), proposed: new Map() as EntryEdits };

  /** One wrapper that runs the current occupant, then adds a name of its own to the result. */
  function appends(name: string): (next: EditExtender) => EditExtender {
    return (next) => (call) => new Map([...next(call), [entryId(name), { name }]]);
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
