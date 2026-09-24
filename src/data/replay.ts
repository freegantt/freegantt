// data/ — `dataset.replay(changeSet)`: the write path `data/history.ts` already used internally,
// published (`plans/s2-data-core/s2b-undo-replay-seam.md`). No extension hook — an engine whose
// behaviour changes between library versions cannot rewrite History. `changesToReplay` (#517
// amendment, ADR 0035) writes the given rows onto the store's current values rather than blind:
// `history.ts` calls this too, so it imports nothing from `transaction.ts` directly and a consumer
// History can now be written against the public surface alone.

import type { ChangeSet } from '../model/index.js';
import { InvalidReplayOriginError } from '../model/index.js';
import { changesToReplay } from './replay-changes.js';
import { commitChangeSet } from './transaction.js';
import type { TransactionData } from './transaction.js';

export type { TransactionData };

/** Only `'undo'`/`'redo'` origins are legal here — `'user'` is `apply`'s door (D-S2-11), not open yet,
 *  and throws `InvalidReplayOriginError`. `changesToReplay` answers `undefined` when nothing is left
 *  to write — a step a sync has fully settled, the same as an empty recorded changeset — and this is
 *  a no-op then too: no `beforeChange`, no `change`. */
export function replayChangeSet(data: TransactionData, changeSet: ChangeSet): void {
  if (changeSet.origin !== 'undo' && changeSet.origin !== 'redo') {
    throw new InvalidReplayOriginError(changeSet.origin);
  }
  const replayed = changesToReplay(data, changeSet);
  if (replayed) commitChangeSet(data, replayed);
}
