// data/ — what a live `Entry` answers (ADR 0017). One row, one object, and every read goes back to
// the store, so a row read inside an open transaction answers the write set.
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import type { DatasetStateOptions } from './dataset-state.js';
import { MS } from '../time/index.js';
import type { Entry } from '../model/index.js';

/** Two dated rows, a parent and its child, plus whatever the case under test needs. */
function datasetOf(options: Partial<DatasetStateOptions> = {}): DatasetState {
  return new DatasetState({
    timeZone: 'UTC',
    entries: [
      { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-05' },
      { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-03' },
      { id: 'solo', name: 'Solo', start: '2026-01-01', end: '2026-01-02' },
    ],
    ...options,
  });
}

function rowOf(state: DatasetState, id: string): Entry {
  const entry = state.entries.get(id);
  if (entry === undefined) throw new Error(`no row called ${id}`);
  return entry;
}

describe('the live Entry — one row per id, and every read is live (ADR 0017)', () => {
  it('holds one Entry per id, and identity is stable across reads', () => {
    const state = datasetOf();

    expect(rowOf(state, 'p')).toBe(rowOf(state, 'p'));
    expect(rowOf(state, 'p').children()[0]).toBe(rowOf(state, 'c'));
    expect(rowOf(state, 'c').parent()).toBe(rowOf(state, 'p'));

    // The identity survives a commit, which is what lets a hover set hold rows across frames.
    const held = rowOf(state, 'p');
    state.entries.update('p', { name: 'Renamed' });
    expect(rowOf(state, 'p')).toBe(held);
    expect(held.name).toBe('Renamed');
  });

  it('reads the write set inside an open transaction, before any commit lands', () => {
    const state = datasetOf();
    const child = rowOf(state, 'c');

    state.transaction(() => {
      state.entries.update('c', { name: 'Staged' });
      expect(child.name).toBe('Staged');
    });

    expect(child.name).toBe('Staged');
  });

  // ADR 0017 rule 2: two questions hide in one word. *Which* rows exist is the
  // collection's question, and `all` answers it as of the last commit. *What a row is worth* is the
  // row's question, and every row answers it now.
  it('does not grow `all` inside an open transaction, and the rows `all` already holds read the write set', () => {
    const state = datasetOf();

    state.transaction(() => {
      state.entries.add({ id: 'fresh', name: 'Fresh' });
      state.entries.update('solo', { name: 'Staged' });

      expect(state.entries.all.map((entry) => String(entry.id))).toEqual(['p', 'c', 'solo']);
      expect(state.entries.all.find((entry) => String(entry.id) === 'solo')?.name).toBe('Staged');
      // Membership itself is live — `has`, `get` and `size` all follow the write set.
      expect(state.entries.has('fresh')).toBe(true);
    });

    expect(state.entries.all.map((entry) => String(entry.id))).toEqual(['p', 'c', 'solo', 'fresh']);
  });

  it("answers `read('parentId')` and `parent()?.id` with the same id, on a row whose parent changed mid-transaction", () => {
    const state = datasetOf();
    const solo = rowOf(state, 'solo');

    expect(solo.read('parentId')).toBeUndefined();
    expect(solo.parent()).toBeUndefined();

    state.transaction(() => {
      state.entries.update('solo', { parentId: 'p' });
      expect(solo.parent()?.id).toBe(rowOf(state, 'p').id);
      expect(solo.read('parentId')).toBe(solo.parent()?.id);
    });

    expect(solo.read('parentId')).toBe(solo.parent()?.id);
  });

  it('answers `hasChildren` with no allocation, and walks the tree once for `descendants()`', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'c', name: 'Child', parentId: 'p' },
        { id: 'g', name: 'Grandchild', parentId: 'c' },
      ],
    });
    const parent = rowOf(state, 'p');

    // A property, because it costs an index read — rule 4. Two reads hand back the same boolean and
    // build nothing, which `children()` cannot say: it allocates an array of rows.
    expect(parent.hasChildren).toBe(true);
    expect(parent.hasChildren).toBe(rowOf(state, 'p').hasChildren);
    expect(rowOf(state, 'g').hasChildren).toBe(false);

    const walked = parent.descendants();
    expect(walked.map((entry) => String(entry.id)).sort()).toEqual(['c', 'g']);
    // Each descendant appears once, so the walk visited each row once.
    expect(new Set(walked).size).toBe(walked.length);
  });

  it('answers a core key, a props key and a compute Field through the one value door', () => {
    const state = datasetOf({
      fields: [{ key: 'cost' }, { key: 'label', compute: (entry) => `${entry.name}!` }],
      entries: [{ id: 'solo', name: 'Solo', start: '2026-01-01', end: '2026-01-02', props: { cost: 40 } }],
    });
    const solo = rowOf(state, 'solo');

    expect(solo.read('name')).toBe('Solo');
    expect(solo.read('cost')).toBe(40);
    expect(solo.read('label')).toBe('Solo!');
  });

  it('keeps the last values it read for a removed id, and `has` answers false', () => {
    const state = datasetOf();
    const solo = rowOf(state, 'solo');

    state.entries.remove('solo');

    expect(state.entries.has('solo')).toBe(false);
    expect(state.entries.get('solo')).toBeUndefined();
    expect(solo.name).toBe('Solo');
  });
});

describe("read('duration') — the row's own span", () => {
  it('has no duration member: a caller reads the duration Field by key', () => {
    expect('duration' in rowOf(datasetOf(), 'solo')).toBe(false);
  });

  it('agrees on the value and the unit', () => {
    const solo = rowOf(datasetOf(), 'solo');

    // A date-only end always means through that day, so it names the whole of that day.
    expect(solo.read('duration')).toEqual({ value: 2 * MS.DAY, unit: 'millisecond' });
  });

  it('always answers the millisecond unit, whatever the span is', () => {
    const state = datasetOf({
      entries: [
        { id: 'hour', name: 'Hour', start: 0, end: MS.HOUR },
        { id: 'year', name: 'Year', start: 0, end: 365 * MS.DAY },
      ],
    });

    expect(rowOf(state, 'hour').read('duration')?.unit).toBe('millisecond');
    expect(rowOf(state, 'year').read('duration')?.unit).toBe('millisecond');
  });

  // ADR 0012: an Entry that does not span states no duration, and never a `NaN`.
  it('answers undefined when either date is absent, and never NaN', () => {
    const state = datasetOf({
      entries: [
        { id: 'neither', name: 'Neither' },
        { id: 'startOnly', name: 'Start only', start: '2026-01-01' },
        { id: 'endOnly', name: 'End only', end: '2026-01-02' },
      ],
    });

    for (const id of ['neither', 'startOnly', 'endOnly']) {
      expect(rowOf(state, id).read('duration')).toBeUndefined();
    }
  });

  const withGap: DatasetStateOptions['entries'] = [
    { id: 'gapped', name: 'Gapped', start: 0, end: 4 * MS.DAY },
    { id: 'c1', name: 'Child 1', parentId: 'gapped', start: 0, end: MS.DAY },
    { id: 'c2', name: 'Child 2', parentId: 'gapped', start: 3 * MS.DAY, end: 4 * MS.DAY },
  ];

  it('measures a parent from its own start to its own end, and counts the gap between its children', () => {
    const state = datasetOf({ entries: withGap });

    expect(rowOf(state, 'gapped').read('duration')).toEqual({ value: 4 * MS.DAY, unit: 'millisecond' });
  });
});

// #421: `entry.name` is the one accessor that normalizes. A consumer reads text and gets text,
// so nothing downstream writes `entry.name ?? ''` — the branch review found four harness sites and
// one in `extensions/features/tooltips.ts` doing exactly that. Storage and input stay sparse, and
// the Field door still answers `undefined`, so "unnamed" is still a question anyone can ask.
describe('an Entry with no name (#421 C5, F8)', () => {
  const unnamed = () =>
    rowOf(datasetOf({ entries: [{ id: 'u', start: '2026-01-01', end: '2026-01-02' }] }), 'u');

  it("reads '' — never undefined, never the string 'undefined'", () => {
    expect(unnamed().name).toBe('');
  });

  it("still answers undefined through read('name'), so 'unnamed' stays askable", () => {
    expect(unnamed().read('name')).toBeUndefined();
  });

  it('stays sparse in toInput: a round-trip never invents a name', () => {
    expect('name' in unnamed().toInput()).toBe(false);
  });

  it('reads back the authored name when there is one', () => {
    expect(rowOf(datasetOf(), 'p').name).toBe('Parent');
  });
});
