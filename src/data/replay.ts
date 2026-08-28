// data/ — `dataset.replay(changeSet)`: the write path `data/history.ts` already used internally,
// published (`plans/s2-data-core/s2b-undo-replay-seam.md`). Applies an already-complete `ChangeSet`
// exactly as given through `commitChangeSet` — no extension hook, no rollup (D-S2-14) — the same tail
// every commit shares. `history.ts` calls this too, so it imports nothing from `transaction.ts`
// directly and a consumer History can now be written against the public surface alone.

import type { ChangeSet } from '../model/index.js';
import { InvalidReplayOriginError } from '../model/index.js';
import { commitChangeSet } from './transaction.js';
import type { TransactionData } from './transaction.js';

export type { TransactionData };

/** Only `'undo'`/`'redo'` origins are legal here — `'user'` is `apply`'s door (D-S2-11), not open yet,
 *  and throws `InvalidReplayOriginError`. An empty changeset is a no-op: no event, no throw. `replay`
 *  mints a fresh `ChangeSetId` and ignores whatever `changeSet.id` carried in. */
export function replayChangeSet(data: TransactionData, changeSet: ChangeSet): void {
  if (changeSet.origin !== 'undo' && changeSet.origin !== 'redo') {
    throw new InvalidReplayOriginError(changeSet.origin);
  }
  if (changeSet.added.length === 0 && changeSet.removed.length === 0 && changeSet.updated.length === 0) {
    return;
  }
  commitChangeSet(data, { ...changeSet, id: data.nextChangeSetId() });
}
