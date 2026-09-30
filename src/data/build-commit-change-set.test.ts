import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap, ErrorReport, ProposedEdit, ProposedEdits } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdit, EntryEdits } from './edit-extension.js';

/** A `ProposedEdits` fixture: fills the required brand/`props`/`proposedKeys` a raw envelope patch
 *  no longer carries (ADR 0011). */
function draftOf(id: string, patch: Record<string, unknown>): ProposedEdits {
  const edit: ProposedEdit = {
    __brand: 'ProposedEdit',
    props: {},
    proposedKeys: new Set(Object.keys(patch)),
    ...patch,
  };
  return new Map([[entryId(id), edit]]);
}

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
          [entryId('t1'), { start: toInstant('UTC', '2026-01-05', 'test') }],
        ]),
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });
    const revisionBefore = state.datasetRevision;

    expect(() => state.entries.update('t1', { start: toInstant('UTC', '2026-01-01', 'test') })).toThrow(
      /extension hook proposed field "start" on entry "t1", which the transaction body already proposed/,
    );

    expect(committed).toHaveLength(0);
    expect(state.datasetRevision).toBe(revisionBefore);
    const entry = state.entries.get('t1')!;
    expect(entry.start).toBe(toInstant('UTC', '2026-01-01', 'test'));
    expect(entry.end).toBe(toEndInstant('UTC', '2026-01-10', 'test'));
  });
});

describe('a commit carries one row per Field, even when the Rollup rewrites what the body just wrote', () => {
  it('the last child leaving and the body writing that same field in one transaction merge to one row', () => {
    const state = new DatasetState({
      entries: [
        { id: 'parent', name: 'parent' },
        { id: 'child', parentId: 'parent', name: 'child', start: 0, end: 100 },
      ],
      timeZone: 'UTC',
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });

    // The body writes `end` on `parent`; removing its last child in the same transaction leaves
    // `parent` with no children left to roll up, so the Rollup writes `end` on `parent` too.
    state.transaction(() => {
      state.entries.remove('child');
      state.entries.update('parent', { end: 101 });
    });

    const endRows = committed[0]!.updated.filter(
      (row) => row.store === 'entries' && row.id === entryId('parent') && row.field === 'end',
    );
    expect(endRows).toHaveLength(1);
  });
});

describe('an added entity carries its rolled-up values, not a row (#517)', () => {
  it('adding an entry and reparenting a child onto it in one transaction rolls up the entity, not a row', () => {
    const state = new DatasetState({
      entries: [{ id: 'a', name: 'a', start: 0, end: 100 }],
      timeZone: 'UTC',
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });

    // n1 starts life with its own span. Reparenting `a` onto it, in the same transaction, gives n1 a
    // child, so the Rollup overwrites the span n1 was just given.
    state.transaction(() => {
      state.entries.add({ id: 'n1', name: 'n1', start: 500, end: 900 });
      state.entries.update('a', { parentId: 'n1' });
    });

    const n1 = committed[0]!.added.find((row) => row.entity.id === entryId('n1'))!.entity;
    expect(n1.start).toBe(0);
    expect(n1.end).toBe(100);

    const n1UpdatedRows = committed[0]!.updated.filter((row) => row.id === entryId('n1'));
    expect(n1UpdatedRows).toEqual([]);
  });

  it('a rolled-up value an added entry has nothing to roll up to is dropped from the entity, and reports once', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });

    const reports: ErrorReport[] = [];
    state.on('error', (report) => {
      reports.push(report);
    });
    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });

    // `parent` is added as a parent from the start (`add` with a `parentId` an already-added row
    // carries), so it never gets a span of its own to roll up from its (nonexistent) children.
    state.transaction(() => {
      state.entries.add({ id: 'parent', name: 'parent', start: 0, end: 1 });
      state.entries.add({ id: 'child', parentId: 'parent', name: 'child' });
    });

    const parent = committed[0]!.added.find((row) => row.entity.id === entryId('parent'))!.entity;
    expect(parent.start).toBeUndefined();
    expect(parent.end).toBeUndefined();
    expect('start' in parent).toBe(false);
    expect('end' in parent).toBe(false);

    expect(reports).toHaveLength(1);
    expect(reports[0]?.code).toBe('derived-values-dropped');
  });
});

describe('an explicit undefined clears parentId and name (#542)', () => {
  it('update(id, { parentId: undefined }) makes the entry a root with one change row', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p' },
        { id: 'c', parentId: 'p', name: 'c', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });

    state.entries.update('c', { parentId: undefined });

    expect(state.entries.get('c')!.read('parentId')).toBeUndefined();
    const parentIdRows = committed[0]!.updated.filter(
      (row) => row.store === 'entries' && row.id === entryId('c') && row.field === 'parentId',
    );
    expect(parentIdRows).toEqual([
      { store: 'entries', id: entryId('c'), field: 'parentId', from: entryId('p'), to: undefined },
    ]);
  });

  it('update(id, { name: undefined }) clears the name', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 'Design', start: 0, end: 1 }],
      timeZone: 'UTC',
    });

    const committed: ChangeSet[] = [];
    state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
      committed.push(changeSet);
    });

    state.entries.update('t1', { name: undefined });

    expect(state.entries.get('t1')!.read('name')).toBeUndefined();
    const nameRows = committed[0]!.updated.filter(
      (row) => row.store === 'entries' && row.id === entryId('t1') && row.field === 'name',
    );
    expect(nameRows).toEqual([
      { store: 'entries', id: entryId('t1'), field: 'name', from: 'Design', to: undefined },
    ]);
  });
});

describe("rolledUpEditsFor previews the Rollup a place drop's commit would settle on (#425)", () => {
  it("a draft moving a child under a leaf returns an edit for the leaf with the child's span", () => {
    const state = new DatasetState({
      entries: [
        { id: 'leaf', name: 'leaf' },
        { id: 'child', name: 'child', start: 100, end: 200 },
      ],
      timeZone: 'UTC',
    });

    const draft = draftOf('child', { parentId: entryId('leaf') });
    const rolledUp = state.rolledUpEditsFor(draft);

    const leafEdit = rolledUp.get(entryId('leaf'));
    expect(leafEdit?.start).toBe(100);
    expect(leafEdit?.end).toBe(200);
  });

  it('a draft with no reparenting rolls nothing up — an unchanged tree has nothing to recompute', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 100 }],
      timeZone: 'UTC',
    });

    const draft = draftOf('t1', { name: 'renamed' });
    expect(state.rolledUpEditsFor(draft).size).toBe(0);
  });

  it("a time-only draft — no reparenting — still returns the parent's rolled-up row (#610)", () => {
    // #610: a child's own time drag can move its parent's rolled-up dates too, the same as a
    // reparenting drop does. `rolledUpEditsFor` must answer this for a time-only draft, not just
    // one that moves an entry under a new parent — the gesture pipeline's refusal check reads it.
    const state = new DatasetState({
      entries: [
        { id: 'parent', name: 'parent' },
        { id: 'child', name: 'child', start: 100, end: 200 },
      ],
      timeZone: 'UTC',
    });
    state.entries.update('child', { parentId: entryId('parent') });

    const draft = draftOf('child', { end: 300 });
    const rolledUp = state.rolledUpEditsFor(draft);

    const parentEdit = rolledUp.get(entryId('parent'));
    expect(parentEdit?.end).toBe(300);
  });

  it('a second frame that repeats the same drop does not copy the committed map again (I5)', () => {
    // `#writesWithPlace` (`view/gesture-pipeline.ts`) builds a fresh `ProposedEdit` on every rAF
    // frame, and a row-axis drag holds its own dates still (`dxPx` pinned to 0) — so a drag that
    // sits over one drop target asks this the same question, with a new object, many frames running.
    // Answering it by copying the whole committed map every time is what made a `place` drag pay
    // O(dataset) per frame (review finding 1).
    const state = new DatasetState({
      entries: [
        { id: 'leaf', name: 'leaf' },
        { id: 'child', name: 'child', start: 100, end: 200 },
      ],
      timeZone: 'UTC',
    });

    const committed = state.entries.committedById() as Map<ReturnType<typeof entryId>, unknown>;
    let walks = 0;
    const iterate = committed[Symbol.iterator].bind(committed);
    committed[Symbol.iterator] = () => {
      walks += 1;
      return iterate();
    };

    state.rolledUpEditsFor(draftOf('child', { parentId: entryId('leaf') }));
    const walksAfterFirstFrame = walks;
    expect(walksAfterFirstFrame).toBeGreaterThan(0);

    state.rolledUpEditsFor(draftOf('child', { parentId: entryId('leaf') }));
    expect(walks).toBe(walksAfterFirstFrame);
  });
});
