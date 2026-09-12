// F1 / P2-2 (2026-09-12 branch review): a tree that loops must never hang the library. Every walk
// over the tree carries a `seen` set, so it stops at the link that closes the loop — the guard
// `#depthOf` already had, now on `descendants()`, on the removal walk, and on the parent check.
//
// Each case bounds the walk with a step budget before it runs. A synchronous loop ignores a vitest
// timeout, so a regression here would wedge the whole run; the budget turns it into a fast red.
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import type { EntryStore } from './entry-store.js';
import { ParentCycleError } from '../model/index.js';

const STEP_BUDGET = 500;

/** Stops a runaway tree walk at `STEP_BUDGET` reads, so a regression fails fast instead of hanging
 *  the run. It shadows the two doors every walk in this file goes through. */
function boundTreeReads(store: EntryStore): void {
  let steps = 0;
  const countStep = (): void => {
    steps += 1;
    if (steps > STEP_BUDGET) throw new Error(`the tree walk passed ${STEP_BUDGET} reads: it loops`);
  };
  const readEntry = store.storedEntry.bind(store);
  const readChildren = store.storedChildrenOf.bind(store);
  Object.assign(store, {
    storedEntry: (id: Parameters<typeof readEntry>[0]) => {
      countStep();
      return readEntry(id);
    },
    storedChildrenOf: (id: Parameters<typeof readChildren>[0]) => {
      countStep();
      return readChildren(id);
    },
  });
}

/** The ADR's own plugin shape: the tree lives in a Field, and no `parentId` is written anywhere.
 *  Committed rows go through core's check; rows a transaction has edited do not, which is the door
 *  this describe block walks. */
function phaseSourced(): DatasetState {
  const state = new DatasetState({
    timeZone: 'UTC',
    entries: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    fields: [{ key: 'phaseId' }],
  });
  state.setHierarchySource(() => (entry) => (entry.props as { phaseId?: string }).phaseId);
  return state;
}

/** Writes the loop `a → b → a` into the open transaction's write set. */
function writeTheLoop(state: DatasetState): void {
  state.entries.update('a', { phaseId: 'b' });
  state.entries.update('b', { phaseId: 'a' });
}

describe('a hierarchy source that loops never hangs a walk (F1)', () => {
  it('descendants() answers each row once inside an open transaction', () => {
    const state = phaseSourced();
    boundTreeReads(state.entries);

    let ids: string[] = [];
    state.transaction(() => {
      writeTheLoop(state);
      ids = (state.entries.get('a')?.descendants() ?? []).map((entry) => String(entry.id));
    });

    expect(ids).toEqual(['b']);
  });

  it('remove() inside the loop stages every row below once and returns', () => {
    const state = phaseSourced();
    boundTreeReads(state.entries);

    state.transaction(() => {
      writeTheLoop(state);
      state.entries.remove('a');
    });

    expect(state.entries.has('a')).toBe(false);
    expect(state.entries.has('b')).toBe(false);
    expect(state.entries.has('c')).toBe(true);
  });
});

describe('an authored parentId that loops never hangs the parent check (P2-2)', () => {
  /** Ingest validates no authored `parentId`, so a consumer can construct this with no plugin. */
  function authoredLoop(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
        { id: 'c', name: 'C' },
      ],
    });
  }

  it('update(id, { parentId }) into the loop returns instead of walking forever', () => {
    const state = authoredLoop();
    boundTreeReads(state.entries);

    state.entries.update('c', { parentId: 'a' });

    expect(state.entries.get('c')?.read('parentId')).toBe('a');
  });

  it('the check still refuses an edit that makes a row its own ancestor', () => {
    const state = authoredLoop();
    boundTreeReads(state.entries);

    expect(() => state.entries.update('a', { parentId: 'a' })).toThrow(ParentCycleError);
  });
});
