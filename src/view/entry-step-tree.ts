// view/ — the Tree as a run of keyboard steps leaves it. A multi-selection steps its Entries one after
// the other, and the Dataset does not write until the last step. So each step after the first cannot
// read `Entry.parent()` or `Entry.children()`: they still show the Tree before any step. This file
// holds the moves made so far and answers the two questions a step asks, which are the parent of an
// Entry and the ordered children of a parent. It never writes to the Dataset.

import type { Entry, EntryId } from '../model/index.js';
import type { RowsForDrop } from '../layout/row-drop-target.js';
import type { PlacedEntry } from './row-drop.js';

/** The key of the root group. A root Entry has no parent id to key its group by. */
const ROOT_GROUP = Symbol('root group');
type GroupKey = EntryId | typeof ROOT_GROUP;

export class EntryStepTree {
  readonly #rows: RowsForDrop;
  /** The parent of each Entry a step moved. An Entry that no step moved reads its own parent. */
  readonly #movedParentIds = new Map<EntryId, EntryId | undefined>();
  /** The child ids of each group a step changed. A group that no step changed reads the Dataset. */
  readonly #changedGroups = new Map<GroupKey, EntryId[]>();

  constructor(rows: RowsForDrop) {
    this.#rows = rows;
  }

  parentOf(entry: Entry): Entry | undefined {
    if (!this.#movedParentIds.has(entry.id)) return entry.parent();
    const parentId = this.#movedParentIds.get(entry.id);
    return parentId === undefined ? undefined : this.#rows.entryOf(parentId);
  }

  /** The children of `parent` in order, or the root Entries for `undefined`. */
  childrenOf(parent: Entry | undefined): readonly Entry[] {
    return this.#idsOf(keyOf(parent?.id)).flatMap((id) => this.#rows.entryOf(id) ?? []);
  }

  siblingsOf(entry: Entry): readonly Entry[] {
    return this.childrenOf(this.parentOf(entry));
  }

  /** Records a step that lands. `move.at` counts among the target group with the moved Entry left out. */
  place(move: PlacedEntry): void {
    const leftGroup = this.#idsOf(keyOf(this.#parentIdOf(move.id)));
    leftGroup.splice(leftGroup.indexOf(move.id), 1);
    this.#idsOf(keyOf(move.parentId)).splice(move.at, 0, move.id);
    this.#movedParentIds.set(move.id, move.parentId);
  }

  #parentIdOf(id: EntryId): EntryId | undefined {
    if (this.#movedParentIds.has(id)) return this.#movedParentIds.get(id);
    return this.#rows.entryOf(id)?.parent()?.id;
  }

  /** The group's own list. The first read copies it from the Dataset, so a later write has a list to change. */
  #idsOf(key: GroupKey): EntryId[] {
    let ids = this.#changedGroups.get(key);
    if (ids === undefined) {
      const live =
        key === ROOT_GROUP ? this.#rows.rootEntries() : (this.#rows.entryOf(key)?.children() ?? []);
      ids = live.map((entry) => entry.id);
      this.#changedGroups.set(key, ids);
    }
    return ids;
  }
}

function keyOf(parentId: EntryId | undefined): GroupKey {
  return parentId ?? ROOT_GROUP;
}
