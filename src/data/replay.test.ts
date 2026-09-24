// data/ — `replayChangeSet`'s own no-op guard (#517 review): an already-empty recorded step answers
// the same no-op `changesToReplay` would, without paying for the pass underneath it. Exercised
// through `state.replay(changeSet)` — `replayChangeSet` itself is not a public export.

import { describe, expect, it, vi } from 'vitest';
import { changeSetId } from '../model/index.js';
import { DatasetState } from './dataset-state.js';
import * as replayChangesModule from './replay-changes.js';

function dataset(): DatasetState {
  return new DatasetState({ entries: [{ id: 'a', name: 'A', start: 0, end: 1 }], timeZone: 'UTC' });
}

describe('replayChangeSet on an already-empty step', () => {
  it('never calls changesToReplay — nothing there could answer anything but the same no-op', () => {
    const state = dataset();
    const spy = vi.spyOn(replayChangesModule, 'changesToReplay');

    state.replay({ id: changeSetId(0), origin: 'undo', added: [], removed: [], updated: [] });

    expect(spy).not.toHaveBeenCalled();
  });

  it('a non-empty step still reaches changesToReplay', () => {
    const state = dataset();
    const spy = vi.spyOn(replayChangesModule, 'changesToReplay');

    state.replay({
      id: changeSetId(0),
      origin: 'undo',
      added: [],
      removed: [],
      updated: [{ store: 'entries', id: state.entries.get('a')!.id, field: 'name', from: 'A', to: 'Old' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
