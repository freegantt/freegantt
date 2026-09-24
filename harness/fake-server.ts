// Stands in for a server's poll endpoint (#517): each call to `fetchRows()` returns the next
// scripted revision of the whole entry list — the shape `dataset.entries.sync()` takes. It only
// returns rows. It runs no diff and holds no order rule of its own; `sync()` does both.

import { addMs, instant, now, MS } from 'freegantt';
import type { EntryInput } from 'freegantt';

/** A leaf no other rule on the page reads — the buffer, risk and lock demos each name their own
 *  row, so renaming this one touches nothing else. */
export const SERVER_RENAMED_ENTRY_ID = 'entry-3';
export const SERVER_ADDED_ENTRY_ID = 'server-added-1';
export const SERVER_REMOVED_ENTRY_ID = 'entry-9';
const SERVER_REORDERED_ROOT_IDS: readonly [string, string] = ['ops-oncall', 'staff-training'];

export interface FakeServer<TProps> {
  /** The next scripted revision of the whole list, or the last one again once the script runs out —
   *  a poll that finds nothing new, the common case a real server sends most of the time. */
  fetchRows(): EntryInput<TProps>[];
}

type Revision<TProps> = (rows: EntryInput<TProps>[]) => EntryInput<TProps>[];

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
  let callCount = 0;

  return {
    fetchRows() {
      const revision = revisions[Math.min(callCount, revisions.length - 1)]!;
      rows = revision(rows);
      callCount += 1;
      return rows.map((row) => ({ ...row }));
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
