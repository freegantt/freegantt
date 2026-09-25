// data/ — the pure diff behind `entries.sync()` (#517): the rows that turn one batch of committed
// entries into another. Reads two batches and hands back a ChangeSet's own three lists; it opens no
// transaction, touches no store, and commits nothing — `entry-store.ts` is the one caller that does.

import type { EntityAdded, EntityRemoved, EntryId, FieldUpdated, StoredEntry } from '../model/index.js';
import { isNoOpFieldWrite } from './change-set.js';
import { readField } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

/** What `changesToMatchBatch` hands back: `ChangeSet`'s own three lists, with no `id` or `origin` —
 *  the caller mints those when it commits. */
export interface EntryBatchChanges {
  readonly added: readonly EntityAdded[];
  readonly removed: readonly EntityRemoved[];
  readonly updated: readonly FieldUpdated[];
}

/**
 * The changes that turn `committed` into `target` (#517): an id in `target` but not `committed` is
 * added, an id in `committed` but not `target` is removed, and a kept id gets one `FieldUpdated` row
 * per Field whose value moved. A Field writes a row unless `isNoOpFieldWrite` answers true, the
 * question every commit and replay asks — so a Field with its own `equals` suppresses a row the same
 * way here as it does anywhere else.
 *
 * A `compute` Field has no stored home, so it is never read here — comparing it would compare a
 * derivation against itself. Every other declared Field is read straight off the two `StoredEntry`s
 * with `readField`, never through a live store, so this stays pure over the two batches a caller
 * hands in: neither reads the other, and nothing here mutates either one.
 *
 * Call: `changesToMatchBatch(this.#byId, target, registry, access)` — "the changes to match the
 * batch."
 */
export function changesToMatchBatch(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  target: readonly StoredEntry[],
  registry: FieldRegistry,
  access: FieldAccess,
): EntryBatchChanges {
  const targetIds = new Set(target.map((entry) => entry.id));
  const removed: EntityRemoved[] = [];
  for (const entity of committed.values()) {
    if (!targetIds.has(entity.id)) removed.push({ store: 'entries', entity });
  }

  const storedFields = registry.all.filter((field) => !('compute' in field));
  const added: EntityAdded[] = [];
  const updated: FieldUpdated[] = [];
  for (const entity of target) {
    const current = committed.get(entity.id);
    if (!current) {
      added.push({ store: 'entries', entity });
      continue;
    }
    for (const field of storedFields) {
      const from = readField(current, field, access);
      const to = readField(entity, field, access);
      if (isNoOpFieldWrite(field.key, from, to, registry)) continue;
      updated.push({ store: 'entries', id: entity.id, field: field.key, from, to });
    }
  }

  return { added, removed, updated };
}
