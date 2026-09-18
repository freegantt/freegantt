import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdit, EntryEdits } from './edit-extension.js';

// data/build-commit-change-set.ts, guardExtensionHookDoesNotOverwriteBody (#232, I4): the extension
// hook may not propose a Field the transaction body already proposed on the same Entry. `start`/`end`
// are ordinary Fields (ADR 0026 retired the Segment that used to make them a derived pair), so a body
// write and an extender write to the same field on the same Entry is refused outright — there is no
// merge to reconcile any more.

describe('the extension hook may not propose a field the body already proposed on the same entry (I4)', () => {
  it('refuses the commit, and leaves no trace behind', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-10' }],
      timeZone: 'UTC',
      // The extender always answers with its own start, on the same entry the body's write targets.
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, EntryEdit>([
          [entryId('t1'), { start: toInstant('UTC', '2026-01-05') }],
        ]),
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });
    const revisionBefore = state.datasetRevision;

    expect(() => state.entries.update('t1', { start: toInstant('UTC', '2026-01-01') })).toThrow(
      /extension hook proposed field "start" on entry "t1", which the transaction body already proposed/,
    );

    expect(committed).toHaveLength(0);
    expect(state.datasetRevision).toBe(revisionBefore);
    const entry = state.entries.get('t1')!;
    expect(entry.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(entry.end).toBe(toEndInstant('UTC', '2026-01-10', 'inclusive'));
  });
});
