// data/ — EntryStore, the view half (D-S2-2). No write set to consult in S2.1 — S2.2 introduces the
// transaction overlay (D-S2-21). Mutators land in S2.3, gated behind a TxToken only
// `data/transaction.ts` can mint, so they are unreachable until then (docs/02 §3.6, "types do half
// the work").

import type { Entry, EntryId, EntryStoreView } from '../model/index.js';
import { computed, signal } from './reactivity.js';

export class EntryStore implements EntryStoreView {
  #byId: Map<EntryId, Entry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #snapshot: () => readonly Entry[];
  #byParent: () => ReadonlyMap<EntryId | undefined, readonly Entry[]>;

  constructor(entries: readonly Entry[]) {
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
    // D-S2-3: rebuilt on commit, not on every read — one array identity per revision, so
    // `ScaleBinding`'s reference comparison and `BoundValue`'s equality half (D-S1.5-4) hold.
    this.#snapshot = computed(() => {
      this.#revision.get();
      return Array.from(this.#byId.values());
    });
    this.#byParent = computed(() => {
      const byParent = new Map<EntryId | undefined, Entry[]>();
      for (const entry of this.#snapshot()) {
        const siblings = byParent.get(entry.parentId);
        if (siblings) siblings.push(entry);
        else byParent.set(entry.parentId, [entry]);
      }
      return byParent;
    });
  }

  snapshot(): readonly Entry[] {
    return this.#snapshot();
  }

  get(id: EntryId): Entry | undefined {
    return this.#byId.get(id);
  }

  has(id: EntryId): boolean {
    return this.#byId.has(id);
  }

  get size(): number {
    return this.#byId.size;
  }

  /** Children of an entry, in insertion order. An entry with no children returns an empty array. */
  childrenOf(id: EntryId): readonly Entry[] {
    return this.#byParent().get(id) ?? [];
  }
}
