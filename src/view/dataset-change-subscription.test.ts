import { describe, expect, it } from 'vitest';
import { subscribeToDatasetChanges } from './dataset-change-subscription.js';
import type { ChangeSet, Dataset } from '../model/index.js';
import { changeSetId } from '../model/index.js';

/** A minimal fake — `on`/`off` are the only members this file is allowed to touch on a Dataset;
 *  `entries`/`timeZone` are unused stubs, present only to satisfy the `Dataset` contract. */
function fakeDataset(): { dataset: Dataset; emit: (changeSet: ChangeSet) => void } {
  const handlers = new Set<(payload: { changeSet: ChangeSet }) => void | false>();
  const dataset: Dataset = {
    entries: undefined as unknown as Dataset['entries'],
    timeZone: 'UTC',
    isRollUpKind: () => false,
    fields: { all: [] },
    on: (_name, handler) => {
      handlers.add(handler);
    },
    off: (_name, handler) => {
      handlers.delete(handler);
    },
  };
  return {
    dataset,
    emit: (changeSet) => {
      for (const handler of handlers) handler({ changeSet });
    },
  };
}

const aChangeSet: ChangeSet = {
  id: changeSetId(1),
  origin: 'user',
  added: [],
  removed: [],
  updated: [],
};

describe('subscribeToDatasetChanges (D-S2-20)', () => {
  it('forwards the committed changeset', () => {
    const { dataset, emit } = fakeDataset();
    const seen: ChangeSet[] = [];
    subscribeToDatasetChanges(dataset, (changeSet) => seen.push(changeSet));

    emit(aChangeSet);

    expect(seen).toEqual([aChangeSet]);
  });

  it('unsubscribe() stops forwarding', () => {
    const { dataset, emit } = fakeDataset();
    const seen: ChangeSet[] = [];
    const subscription = subscribeToDatasetChanges(dataset, (changeSet) => seen.push(changeSet));

    subscription.unsubscribe();
    emit(aChangeSet);

    expect(seen).toHaveLength(0);
  });
});
