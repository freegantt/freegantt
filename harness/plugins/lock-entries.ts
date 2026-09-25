// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]). This is the
// gate box's whole point — the plugin only compiles because the public surface is enough.

import { addMs, diffMs, fieldRowsOf, mergeEntryEdits, moveEntryTo } from 'freegantt';
import type { Dataset, DataPlugin, EditRequest, EntryEdit, EntryId } from 'freegantt';

/** The lock flag, an ordinary Field, not a plugin store row (#496 Q8): per-entry data a consumer
 *  must export and load back has to sit where `toInput()` and `entries.load()` both read it, and
 *  neither reads a plugin store. `editable: 'api'` keeps the cell dead in every grid; declaring no
 *  `column` means no grid ever draws one. `lock()`/`unlock()` below are the one door that writes it. */
const LOCKED_FIELD_KEY = 'locked';

/** The one key this plugin declares. A consumer that wants a typed `entry.read('locked')` on its own
 *  Dataset adds it to its own props, e.g. `Dataset<TaskProps & LockProps>`. */
export interface LockProps {
  locked?: boolean;
}

/** What the page holds after installing: the plugin itself, plus the three calls a Lock/Unlock menu
 *  item makes. `isLocked` reads the `locked` Field this plugin declares, so no page keeps a `Set` of
 *  its own. */
export interface LockEntriesPlugin extends DataPlugin<LockProps> {
  isLocked(id: string): boolean;
  lock(id: string): void;
  unlock(id: string): void;
}

/**
 * Locks entries against every edit, and drags the locked ones along for the ride so a user sees what
 * a lock costs before the drop lands.
 *
 * ```ts
 * const locks = lockEntries();
 * const dataset = new Dataset({ entries: entries.map((e) => (e.id === 't2' ? { ...e, locked: true } : e)), plugins: [locks] });
 * ```
 *
 * A consumer seeds a starting lock the same way any other Field starts populated: by writing
 * `locked: true` on the entry it hands the constructor, or `entries.load()`. The plugin takes no
 * `initiallyLocked` list of its own — `data()` runs on the finished Dataset (ADR 0031), so it reads
 * every entry's `locked` Field straight off `ctx.dataset.entries` instead of staging one.
 *
 * Two seams, two jobs (D-S5-24's refusal note):
 * - the **extension hook** adds a cascade edit for every locked entry, on every call — a preview call
 *   and the real commit call carry the same `EditRequest`, so an extender can never tell them apart
 *   and must never refuse. This is what makes the locked bar ghost alongside the dragged one. The
 *   cascade is a `moveEntryTo` edit, which is the one shape that holds for an Entry of any Segment
 *   count (#241) — copy that call, not an envelope.
 * - **`beforeChange`** refuses the commit, once, on the finished changeset — any write that touches a
 *   locked entry, except a write to `locked` itself, so `unlock()` can still open it. Returning
 *   `false` throws `MutationCancelledError` — the ordinary veto every gesture already handles: no
 *   write, no undo entry, no new error type. A `'load'` changeset steps around this refusal (#496
 *   L1): `load` is a full fresh start that removes every old entry regardless of its lock, and the
 *   `locked` Field on the rows it loads is what the lock reads back once the load lands. A `'sync'`
 *   changeset steps around it too (#517): the list it diffs against carries `locked` the same way a
 *   `load` list does, so the server's own list is what the lock reads back once the sync lands. An
 *   `'undo'` or a `'redo'` changeset steps around it as well: the lock guards a new edit, not the
 *   reversal of a step the user already made, so a lock set after the step still lets the undo
 *   through.
 *
 * The lock flag is a Field, so locking is a real dataset write: it commits, it raises `change`, and
 * one undo unlocks (#156).
 */
export function lockEntries(): LockEntriesPlugin {
  let dataset: Dataset<LockProps> | undefined;

  const isLockedEntry = (id: string): boolean => dataset?.entries.get(id)?.read(LOCKED_FIELD_KEY) === true;

  // Which ids are locked right now — seeded in `data()` below, then kept current by the `change`
  // listener, so the extender (run on every drag-preview frame) walks only the locked entries, never
  // the whole request.
  const lockedIds = new Set<EntryId>();

  return {
    id: 'demo.lockEntries',

    fields: [{ key: LOCKED_FIELD_KEY, type: 'boolean', editable: 'api' }],

    data(ctx) {
      dataset = ctx.dataset;

      // Walks every entry once, so a row locked purely by construction-time `locked: true` — never
      // touched by a commit of its own — joins `lockedIds` before the first drag preview reads it.
      // The Dataset is finished by the time `data()` runs (ADR 0031), so `ctx.dataset.entries` is
      // readable here.
      for (const entry of ctx.dataset.entries.all) {
        if (isLockedEntry(String(entry.id))) lockedIds.add(entry.id);
      }

      // Every id a commit touched — added, removed, or field-written — re-read once, after the
      // commit lands, so `lockedIds` never drifts from the Field it mirrors.
      ctx.events.on('change', ({ changeSet }) => {
        const touched = new Set<EntryId>();
        for (const row of changeSet.added) touched.add(row.entity.id);
        for (const row of changeSet.removed) touched.add(row.entity.id);
        for (const row of fieldRowsOf(changeSet)) touched.add(row.id);
        for (const id of touched) {
          if (isLockedEntry(String(id))) lockedIds.add(id);
          else lockedIds.delete(id);
        }
      });

      // What does a locked entry do while a neighbour moves? It moves too, so the drag preview shows
      // the cost of the lock before the drop lands.
      ctx.edits.setExtender((next) => (request) => {
        const moved = movedBy(request);
        if (moved === undefined) return next(request);
        // `EntryEdit` is the write shape — the same object `dataset.entries.update(id, edit)` takes
        // (#209). A cascade names it; it never states a storage shape of its own.
        const mine = new Map<EntryId, EntryEdit>();
        for (const id of lockedIds) {
          if (request.proposed.has(id)) continue;
          const entry = request.entries.get(id);
          // A locked entry outside this request, or with no dates, has nothing to move (ADR 0012).
          if (entry === undefined || entry.start === undefined) continue;
          // `moveEntryTo`, never `{ start, end }` written by hand: it is the one place that computes
          // the rigid translate (`end - start` held fixed), so a cascade never re-derives that math
          // (ADR 0026 retired the several-Segment case this comment used to guard against — a Bar is
          // one child Entry by default now, and `moveEntryTo` answers with a plain `{ start, end }`
          // edit, same shape `dataset.entries.update()` takes).
          mine.set(id, moveEntryTo(entry, addMs(entry.start, moved)));
        }
        // `mergeEntryEdits`, never a `Map` spread: another plugin may already have written one of
        // these entries, and a spread drops that write (#197).
        return mergeEntryEdits(next(request), mine);
      });

      // What refuses the drop? The finished changeset, once, at commit — never the extender above. A
      // load replaces the whole dataset (#496 L1), and a sync's list carries `locked` the way a
      // load's does (#517), so this refusal steps aside for both. An undo or a redo reverses a step
      // the user already made, and the lock guards only a new edit, so the refusal steps aside for
      // those too. Why does the refusal say the entry id? `refuse(reason)` puts the plugin's own
      // words on the report core raises (#210), so the page needs no callback of its own to tell a
      // user why.
      ctx.events.on('beforeChange', ({ changeSet, refuse }) => {
        if (
          changeSet.origin === 'load' ||
          changeSet.origin === 'sync' ||
          changeSet.origin === 'undo' ||
          changeSet.origin === 'redo'
        ) {
          return undefined;
        }
        const refused = fieldRowsOf(changeSet).find(
          (row) => row.field !== LOCKED_FIELD_KEY && isLockedEntry(String(row.id)),
        );
        const removed = changeSet.removed.find((row) => isLockedEntry(String(row.entity.id)));
        const id = refused?.id ?? removed?.entity.id;
        if (id === undefined) return undefined;
        return refuse(`${String(id)} is locked`);
      });
    },

    isLocked(id) {
      return isLockedEntry(id);
    },

    /** A Field write on its own: it commits, raises `change`, and one undo unlocks (#156). Writes the
     *  one key this plugin declares, typed by `LockProps` — no cast. */
    lock(id) {
      dataset?.entries.update(id, { [LOCKED_FIELD_KEY]: true });
    },

    /** Clears the key rather than writing `false`: an unlocked entry never carried `locked` before
     *  this plugin composed in, and `toInput()` must read the same after an unlock as it did then —
     *  not `locked: false` (every declared consumer key is removable without exception, ADR 0011). */
    unlock(id) {
      dataset?.entries.update(id, { [LOCKED_FIELD_KEY]: undefined });
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
