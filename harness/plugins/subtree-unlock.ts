// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { entryId } from 'freegantt';
import type { DataPlugin, EntryId, FieldKey, PluginStore } from 'freegantt';

/** What the store holds: the one subtree root currently open, or none. This is not per-entry data —
 *  it names which subtree is open, not a fact about one Entry — so it stays in the plugin's own
 *  store rather than a Field (#496 Q8, ADR 0002, D-S5-24). */
interface UnlockRow {
  readonly rootId: EntryId;
}

const ROOT_KEY = 'root';

/** What the page holds after installing: the plugin itself, plus the two calls a checkbox makes. */
export interface SubtreeUnlockPlugin extends DataPlugin {
  openSubtree(rootId: string): void;
  closeSubtree(): void;
  isOpen(): boolean;
}

/**
 * Opens one locked `field` for a whole subtree, sharper than `Field.editable` alone (#473).
 *
 * ```ts
 * const notes = subtreeUnlock('note');
 * const dataset = new Dataset({ entries, fields: [{ key: 'note', editable: false }], plugins: [notes] });
 * notes.openSubtree('program');
 * ```
 *
 * `field` stays locked (`editable: false`) everywhere else. `ctx.edits.setLockRule` is the one
 * seam every write door reads before it falls back to the Field's own `editable` (I14) — the
 * grid's cell editor, `entries.update()`, and an `EditExtender` cascade all agree with the
 * checkbox below, because all three read this same rule.
 */
export function subtreeUnlock(field: FieldKey): SubtreeUnlockPlugin {
  let store: PluginStore<UnlockRow> | undefined;

  const openRoot = (): EntryId | undefined => store?.get(ROOT_KEY)?.rootId;

  return {
    id: 'demo.subtreeUnlock',

    data(ctx) {
      store = ctx.store.reserve<UnlockRow>();

      ctx.edits.setLockRule((next) => (query, key) => {
        const rootId = openRoot();
        if (rootId === undefined || key !== field) return next(query, key);
        return query.id === rootId || query.isDescendantOf(rootId) ? 'anywhere' : next(query, key);
      });
    },

    /** A store write on its own: it commits, raises `change`, and one undo closes it again (#156). */
    openSubtree(rootId) {
      store?.set(ROOT_KEY, { rootId: entryId(rootId) });
    },

    closeSubtree() {
      store?.remove(ROOT_KEY);
    },

    isOpen() {
      return openRoot() !== undefined;
    },
  };
}
