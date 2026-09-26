// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import type { DataPlugin, FieldKey, FieldLockQuery, PluginStore } from 'freegantt';

/** What the store holds: one row per Entry whose subtree is open. The row is about that one Entry,
 *  so it keys by the Entry's own id — removing the Entry closes its subtree, and an undo opens it
 *  again. The row's presence is the whole answer: a store row must be an object, so `open` marks
 *  it, and no code reads the flag. */
interface OpenSubtreeRow {
  readonly open: true;
}

/** What the page holds after installing: the plugin itself, plus the three calls a checkbox makes. */
export interface SubtreeUnlockPlugin extends DataPlugin {
  openSubtree(rootId: string): void;
  closeSubtree(rootId: string): void;
  isOpen(rootId: string): boolean;
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
  let store: PluginStore<OpenSubtreeRow> | undefined;

  const isInOpenSubtree = (query: FieldLockQuery): boolean => {
    for (const rootId of store?.all.keys() ?? []) {
      if (query.id === rootId || query.isDescendantOf(rootId)) return true;
    }
    return false;
  };

  return {
    id: 'demo.subtreeUnlock',

    data(ctx) {
      store = ctx.store.reserve<OpenSubtreeRow>();

      ctx.edits.setLockRule(
        (next) => (query, key) => (key === field && isInOpenSubtree(query) ? 'anywhere' : next(query, key)),
      );
    },

    /** A store write on its own: it commits, raises `change`, and one undo closes it again. */
    openSubtree(rootId) {
      store?.set(rootId, { open: true });
    },

    closeSubtree(rootId) {
      store?.remove(rootId);
    },

    isOpen(rootId) {
      return store?.get(rootId) !== undefined;
    },
  };
}
