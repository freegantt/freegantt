import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { SegmentsOutOfSyncError, entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';

// data/build-commit-change-set.ts, reconcileSharedEnvelope (#232, D-S5-49): a body author and an
// extender author each name their own envelope key on the same Entry, and the two disagree. Neither
// side's write is a mistake on its own — `entries.update()`'s `segments` and the extender's `start`
// each pass `reconcileEnvelope` alone. Only merging them exposes the conflict, so this refusal fires
// once, on the merged patch, not on either side's edit read in isolation.

describe('a body-authored segments write and an extender-authored start write that disagree (D-S5-49)', () => {
  it('refuses the commit with SegmentsOutOfSyncError, and leaves no trace behind', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-10' }],
      timeZone: 'UTC',
      // The extender always answers with a start the body's segments write cannot agree with.
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([
          [entryId('t1'), { start: toInstant('UTC', '2026-01-05') }],
        ]),
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });
    const revisionBefore = state.datasetRevision;

    expect(() =>
      state.entries.update('t1', {
        segments: [
          { start: toInstant('UTC', '2026-01-01'), end: toEndInstant('UTC', '2026-01-08', 'inclusive') },
        ],
      }),
    ).toThrow(SegmentsOutOfSyncError);

    expect(committed).toHaveLength(0);
    expect(state.datasetRevision).toBe(revisionBefore);
    const entry = state.entries.get('t1')!;
    expect(entry.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(entry.end).toBe(toEndInstant('UTC', '2026-01-10', 'inclusive'));
  });
});
