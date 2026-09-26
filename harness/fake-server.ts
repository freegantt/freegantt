// Stands in for a server's poll endpoint: `fetchRows()` returns the next scripted
// revision of the whole entry list, the shape `dataset.entries.syncAll()` takes; `fetchChanges()`
// returns the next scripted delta, the shape `dataset.entries.syncChanges()` takes. Both read and
// move the one `rows` state, each on its own call count, so a full-list poll after a delta poll
// sees what that delta changed. Neither diffs, merges or places a row — `syncAll()` and
// `syncChanges()` do that.

import { addMs, instant, now, MS } from 'freegantt';
import type { EntryDelta, EntryInput, FlatEntryInput } from 'freegantt';

/** A leaf no other rule on the page reads — the buffer, risk and lock demos each name their own
 *  row, so renaming this one touches nothing else. */
export const SERVER_RENAMED_ENTRY_ID = 'entry-3';
export const SERVER_ADDED_ENTRY_ID = 'server-added-1';
export const SERVER_REMOVED_ENTRY_ID = 'entry-9';
const SERVER_REORDERED_ROOT_IDS: readonly [string, string] = ['ops-oncall', 'staff-training'];

/** Leaves other demos on the page untouched, the same way the whole-list ids above do. */
export const SERVER_DELTA_RENAMED_ENTRY_ID = 'entry-6';
export const SERVER_DELTA_REMOVED_ENTRY_ID = 'entry-11';
export const SERVER_DELTA_ADDED_ENTRY_ID = 'server-delta-added-1';

export interface FakeServer<TProps> {
  /** The next scripted revision of the whole list, or the last one again once the script runs out —
   *  a poll that finds nothing new, the common case a real server sends most of the time. */
  fetchRows(): EntryInput<TProps>[];
  /** The next scripted delta, or `{}` once the script runs out — a poll that finds nothing new. */
  fetchChanges(): EntryDelta<TProps>;
}

type Revision<TProps> = (rows: EntryInput<TProps>[]) => EntryInput<TProps>[];

/** One scripted delta poll: the same hand-written change to `rows` a whole-list revision makes,
 *  paired with the delta literal that describes just that change. */
interface DeltaRevision<TProps> {
  readonly apply: Revision<TProps>;
  readonly delta: EntryDelta<TProps>;
}

/** Three scripted delta polls, built lazily so a date-bearing revision reads `now()` at the moment
 *  it plays, played once each in order, then held on the third (no change):
 *  1. a rename on `entry-6`, every other key untouched
 *  2. an added row under `entry-5`, and the removal of `entry-11`
 *  3. no change */
const deltaRevisionBuilders: readonly (<TProps>() => DeltaRevision<TProps>)[] = [
  renamedByDelta,
  addedAndRemovedByDelta,
  noChangeByDelta,
];

/** Four scripted revisions, played once each in order, then held on the fourth (no change):
 *  1. a rename and a date shift on `entry-3`
 *  2. an added row
 *  3. a reorder of the two root spans, and the removal of `entry-9`
 *  4. no change
 *
 *  `seedRows` is the page's own list at page load, so every revision starts from what the page
 *  actually shows. */
export function fakeServer<TProps>(seedRows: readonly EntryInput<TProps>[]): FakeServer<TProps> {
  const revisions: readonly Revision<TProps>[] = [
    renameAndReschedule,
    addRow,
    reorderRootsAndRemoveOne,
    (rows) => rows,
  ];
  let rows = seedRows.map((row) => ({ ...row }));
  let fetchRowsCallCount = 0;
  let fetchChangesCallCount = 0;

  return {
    fetchRows() {
      const revision = revisions[Math.min(fetchRowsCallCount, revisions.length - 1)]!;
      rows = revision(rows);
      fetchRowsCallCount += 1;
      return rows.map((row) => ({ ...row }));
    },
    fetchChanges() {
      const build = deltaRevisionBuilders[Math.min(fetchChangesCallCount, deltaRevisionBuilders.length - 1)]!;
      const revision = build<TProps>();
      rows = revision.apply(rows);
      fetchChangesCallCount += 1;
      return revision.delta;
    },
  };
}

function renameAndReschedule<TProps>(rows: EntryInput<TProps>[]): EntryInput<TProps>[] {
  return rows.map((row) =>
    row.id === SERVER_RENAMED_ENTRY_ID
      ? {
          ...row,
          name: 'Renamed by the server',
          start: row.start === undefined ? undefined : addMs(instant(row.start), MS.DAY),
          end: row.end === undefined ? undefined : addMs(instant(row.end), MS.DAY),
        }
      : row,
  );
}

function addRow<TProps>(rows: EntryInput<TProps>[]): EntryInput<TProps>[] {
  const start = now();
  return [
    ...rows,
    { id: SERVER_ADDED_ENTRY_ID, name: 'Added by the server', start, end: addMs(start, MS.DAY) },
  ];
}

function reorderRootsAndRemoveOne<TProps>(rows: EntryInput<TProps>[]): EntryInput<TProps>[] {
  const [firstId, secondId] = SERVER_REORDERED_ROOT_IDS;
  const reordered = [...rows];
  const firstIndex = reordered.findIndex((row) => row.id === firstId);
  const secondIndex = reordered.findIndex((row) => row.id === secondId);
  if (firstIndex !== -1 && secondIndex !== -1) {
    [reordered[firstIndex], reordered[secondIndex]] = [reordered[secondIndex]!, reordered[firstIndex]!];
  }
  return reordered.filter((row) => row.id !== SERVER_REMOVED_ENTRY_ID);
}

function renamedByDelta<TProps>(): DeltaRevision<TProps> {
  const renamed = { id: SERVER_DELTA_RENAMED_ENTRY_ID, name: 'Renamed by a server delta' };
  return {
    apply: (rows) =>
      rows.map((row) => (row.id === SERVER_DELTA_RENAMED_ENTRY_ID ? { ...row, ...renamed } : row)),
    // `FlatEntryInput<TProps>` resolves its shape from a concrete `TProps` (see its own comment,
    // `src/model/stored-entry.ts`); an unresolved generic here can only assert into it, not infer it.
    delta: { upsert: [renamed as FlatEntryInput<TProps>] },
  };
}

function addedAndRemovedByDelta<TProps>(): DeltaRevision<TProps> {
  const start = now();
  const end = addMs(start, MS.DAY);
  const added = {
    id: SERVER_DELTA_ADDED_ENTRY_ID,
    parentId: 'entry-5',
    name: 'Added by a server delta',
    start,
    end,
  };
  return {
    apply: (rows) => [...rows.filter((row) => row.id !== SERVER_DELTA_REMOVED_ENTRY_ID), added],
    delta: { upsert: [added as FlatEntryInput<TProps>], remove: [SERVER_DELTA_REMOVED_ENTRY_ID] },
  };
}

function noChangeByDelta<TProps>(): DeltaRevision<TProps> {
  return { apply: (rows) => rows, delta: {} };
}
