// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]). This is the
// gate box's whole point — the plugin only compiles because the public surface is enough.

import { addMs, diffMs, entryId, fieldRowsOf, mergeEntryEdits, moveEntryTo } from 'freegantt';
import type { DataPlugin, EditRequest, EntryEdit, EntryId, PluginStore } from 'freegantt';

/** What the store holds per locked entry. One key today; a real plugin's row grows without ever
 *  colliding with the application's own `props` — that is what a store is for (ADR 0002, D-S5-24). */
interface LockRow {
  readonly locked: true;
}

/** What the page holds after installing: the plugin itself, plus the three calls a Lock/Unlock menu
 *  item makes. `isLocked` reads the store the plugin owns, so no page keeps a `Set` of its own. */
export interface LockEntriesPlugin extends DataPlugin {
  isLocked(id: string): boolean;
  lock(id: string): void;
  unlock(id: string): void;
}

/**
 * Locks entries against every edit, and drags the locked ones along for the ride so a user sees what
 * a lock costs before the drop lands.
 *
 * ```ts
 * const locks = lockEntries(['t2']);
 * const dataset = new Dataset({ entries, plugins: [locks] });
 * ```
 *
 * Two seams, two jobs (D-S5-24's refusal note):
 * - the **extension hook** adds a cascade edit for every locked entry, on every call — a preview call
 *   and the real commit call carry the same `EditRequest`, so an extender can never tell them apart
 *   and must never refuse. This is what makes the locked bar ghost alongside the dragged one. The
 *   cascade is a `moveEntryTo` edit, which is the one shape that holds for an Entry of any Segment
 *   count (#241) — copy that call, not an envelope.
 * - **`beforeChange`** refuses the commit, once, on the finished changeset. Returning `false` throws
 *   `MutationCancelledError` — the ordinary veto every gesture already handles: no write, no undo
 *   entry, no new error type.
 *
 * The lock flags live in this plugin's own store, so locking is a real dataset write: it commits, it
 * raises `change`, and one undo unlocks (#156).
 */
export function lockEntries(initiallyLocked: readonly string[] = []): LockEntriesPlugin {
  let store: PluginStore<LockRow> | undefined;

  const lockedRows = (): ReadonlyMap<EntryId, LockRow> => store?.all ?? new Map();

  return {
    id: 'demo.lockEntries',

    data(ctx) {
      store = ctx.store.reserve<LockRow>();
      for (const id of initiallyLocked) store.set(id, { locked: true });

      // What does a locked entry do while a neighbour moves? It moves too, so the drag preview shows
      // the cost of the lock before the drop.
      ctx.edits.setExtender((next) => (request) => {
        const moved = movedBy(request);
        if (moved === undefined) return next(request);
        // `EntryEdit` is the write shape — the same object `dataset.entries.update(id, edit)` takes
        // (#209). A cascade names it; it never states a storage shape of its own.
        const mine = new Map<EntryId, EntryEdit>();
        for (const [id] of lockedRows()) {
          if (request.proposed.has(id)) continue;
          const entry = request.entries.get(id);
          // A locked entry with no dates has nothing to move (ADR 0012).
          if (entry === undefined || entry.start === undefined) continue;
          // `moveEntryTo`, never `{ start, end }` (D-S5-50). An Entry may draw several Segments, and
          // then an envelope alone names none of them, so core refuses that write rather than guess
          // which one to move (`SegmentsOutOfSyncError`, `'ambiguous'`, D-S5-44). This says the whole
          // Entry translates rigidly, one Segment at a time, and lets core derive the envelope back.
          mine.set(id, moveEntryTo(entry, addMs(entry.start, moved)));
        }
        // `mergeEntryEdits`, never a `Map` spread: another plugin may already have written one of
        // these entries, and a spread drops that write (#197).
        return mergeEntryEdits(next(request), mine);
      });

      // What refuses the drop? The finished changeset, once, at commit — never the extender above.
      // Why does the refusal say the entry id? `refuse(reason)` puts the plugin's own words on the
      // report core raises (#210), so the page needs no callback of its own to tell a user why.
      ctx.events.on('beforeChange', ({ changeSet, refuse }) => {
        const refused = fieldRowsOf(changeSet).find((row) => lockedRows().has(row.id));
        const removed = changeSet.removed.find((row) => lockedRows().has(row.entity.id));
        const id = refused?.id ?? removed?.entity.id;
        if (id === undefined) return undefined;
        return refuse(`${String(id)} is locked`);
      });
    },

    isLocked(id) {
      return lockedRows().has(entryId(id));
    },

    /** A store write on its own: it commits, raises `change`, and one undo reverses it (#156). */
    lock(id) {
      store?.set(id, { locked: true });
    },

    unlock(id) {
      store?.remove(id);
    },
  };
}

/** How far this request proposes to move an entry, or `undefined` when it moves none. `diffMs` is the
 *  public pair to `addMs`; subtracting two `Instant`s by hand is the arithmetic I10 exists to stop. */
function movedBy(request: EditRequest): number | undefined {
  for (const [id, edit] of request.proposed) {
    const before = request.entries.get(id);
    if (before === undefined || before.start === undefined || edit.start === undefined) continue;
    const moved = diffMs(edit.start, before.start);
    if (moved !== 0) return moved;
  }
  return undefined;
}
