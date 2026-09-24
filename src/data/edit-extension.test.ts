import { describe, expect, it } from 'vitest';
import { identityExtender } from './edit-extension.js';
import { createEditRequest } from './edit-request.js';
import { storedParentSource } from './hierarchy-source.js';
import { identityFieldLockRule } from './write-rule.js';
import { DatasetState } from './dataset-state.js';
import { runTransaction } from './transaction.js';
import { entryId } from '../model/index.js';
import type { ErrorReport, StoredEntry, EntryEdit, EntryId, Instant, WriteTarget } from '../model/index.js';
import { mergeEntryEdits } from './edit-extension.js';
import { proposedKeysOf } from './fields/field-access.js';
import type { EditExtender, EntryEdits, ProposedEdit, ProposedEdits } from './edit-extension.js';

/** No Field lookup is under test here — every request below asks nothing that reads one. */
const noFields = { get: () => undefined };

function entry(id: string): StoredEntry {
  return {
    id: entryId(id),
    siblingIndex: 0,
    name: id,
    start: 0 as Instant,
    end: 1 as Instant,
    props: {},
  };
}

function proposedEdit(patch: Record<string, unknown>): ProposedEdit {
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(Object.keys(patch)), ...patch };
}

describe('identityExtender', () => {
  it('returns an empty EntryEdits map — no cascade, ever', () => {
    const t1 = entry('t1');
    const proposed = new Map<EntryId, ProposedEdit>([[t1.id, proposedEdit({ name: 'Framing' })]]);
    const entries = new Map([[t1.id, t1]]);
    const result = identityExtender(
      createEditRequest({
        entries,
        proposed,
        added: [],
        removed: [],
        hierarchySource: storedParentSource,
        committedChildIds: new Map(),
        fields: noFields,
        lockRule: identityFieldLockRule,
      }),
    );
    expect(result.size).toBe(0);
  });
});

// D-S5-23: installing an extender composes rather than evicting. `data/` still holds one field and
// calls it at one site — what changes is only how a second plugin arrives.
describe('DatasetState.setExtender (D-S5-23)', () => {
  const requestEntries = new Map<EntryId, StoredEntry>();
  const request = createEditRequest({
    entries: requestEntries,
    proposed: new Map() as ProposedEdits,
    added: [],
    removed: [],
    hierarchySource: storedParentSource,
    committedChildIds: new Map(),
    fields: noFields,
    lockRule: identityFieldLockRule,
  });

  /** One wrapper that runs the current occupant, then adds a name of its own to the result. */
  function appends(name: string): (next: EditExtender) => EditExtender {
    return (next) => (call) => mergeEntryEdits(next(call), new Map([[entryId(name), { name }]]));
  }

  it('leaves identityExtender in the hook when no plugin claims it', () => {
    expect(new DatasetState({ entries: [], timeZone: 'UTC' }).editExtender).toBe(identityExtender);
  });

  it('hands the current occupant to the wrapper, so a second plugin adds to the first cascade', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    state.setExtender(appends('first'));
    state.setExtender(appends('second'));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('first'), entryId('second')]);
  });

  it('lets a wrapper that ignores next replace the occupant outright', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    state.setExtender(appends('first'));
    state.setExtender(() => () => new Map([[entryId('only'), { name: 'only' }]]));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('only')]);
  });

  it('composes onto an extender the constructor already installed', () => {
    const seeded: EditExtender = () => new Map([[entryId('seeded'), { name: 'seeded' }]]);
    const state = new DatasetState({ entries: [], timeZone: 'UTC', editExtender: seeded });
    state.setExtender(appends('wrapper'));

    expect([...state.editExtender(request).keys()]).toEqual([entryId('seeded'), entryId('wrapper')]);
  });
});

// #197: the law two extenders on one Entry have to obey. Every example in the contract used to compose
// with a `Map` spread, and every test stayed green because each wrapper wrote a different Entry id.
// S7 is the first slice with a second occupant on the hook, and a cascade that moves an entry is the
// colliding case, so the merge is pinned here rather than discovered there.
//
// Both extenders write the loose shape now (#209 C3) — the same object `entries.update()` takes. The
// law splits in two, and both halves are pinned below: `mergeEntryEdits` keeps every key of both
// edits, and core derives the proposed keys once, when it reads the composed result.
describe('composing two extenders that write one Entry (#197)', () => {
  const target = entryId('t1');

  function datasetWithTarget(): DatasetState {
    return new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 10 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
  }

  /** Writes a props-addressed Field by its own name — the author states no `proposedKeys` any more. */
  const proposesCost: EditExtender = () => new Map([[target, { cost: 500 }]]);

  /** Moves the same entry, the way an S7 cascade does — loose dates, read by core. */
  const movesTarget: EditExtender = () => new Map([[target, { start: '2026-01-05', end: '2026-01-07' }]]);

  function composed(inner: EditExtender, outer: EditExtender): { loose: EntryEdits; stored: ProposedEdits } {
    const state = datasetWithTarget();
    state.setExtender(() => inner);
    state.setExtender((next) => (call) => mergeEntryEdits(next(call), outer(call)));
    // `EditRequest.entries` is the pre-transaction snapshot, so it carries stored values and never
    // a live row (D-S5-45, ADR 0017).
    const entries = new Map([[target, state.entries.storedValues.get(target)!]]);
    const request = createEditRequest({
      entries,
      proposed: new Map() as ProposedEdits,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map(),
      fields: noFields,
      lockRule: identityFieldLockRule,
    });
    return { loose: state.editExtender(request), stored: state.extraEditsFor(request) };
  }

  it('keeps both writes, whichever extender wrapped the other', () => {
    for (const { loose } of [composed(proposesCost, movesTarget), composed(movesTarget, proposesCost)]) {
      const edit = loose.get(target);
      expect(edit?.['cost']).toBe(500);
      expect(edit?.start).toBe('2026-01-05');
      expect(edit?.end).toBe('2026-01-07');
    }
  });

  it('core derives every proposed key from the composed edit, so the props-addressed Field is recognized', () => {
    for (const { stored } of [composed(proposesCost, movesTarget), composed(movesTarget, proposesCost)]) {
      const keys = [...proposedKeysOf(stored.get(target))].sort();
      // `start`/`end` are ordinary Fields now (ADR 0026 retired the Segment that used to pair with
      // them), so the composed edit's proposed keys are exactly what the two extenders wrote.
      expect(keys).toEqual(['cost', 'end', 'start']);
      expect(stored.get(target)?.props).toEqual({ cost: 500 });
    }
  });

  it('the outer extender wins on a Field both wrote', () => {
    const shiftsFurther: EditExtender = () => new Map([[target, { start: '2026-01-06' }]]);
    const { loose } = composed(movesTarget, shiftsFurther);
    expect(loose.get(target)?.start).toBe('2026-01-06');
    expect(loose.get(target)?.end).toBe('2026-01-07');
  });
});

// #238: the law at depth three. Two extenders on one Entry obeyed it; a third dropped both earlier
// plugins' writes, because a merge of two edits that state no `proposedKeys` used to stamp an empty
// set, and an empty set reads as "the author stated nothing at all" nowhere — `keysWrittenBy` falls
// back to the raw keys only when `proposedKeys` is absent. The third merge then carried `[]` as the
// base's stated keys, `diffEdit` took its authored branch, and only the last plugin got a row.
//
// The fixture writes `name`, `tag` (a consumer prop) and `parentId` — non-date Fields on purpose.
// Date Fields (`start`/`end`) on one Entry hit the envelope-companion collision in `toEditReading`
// (#232), which is a different defect.
describe('composing three extenders that write one Entry (#238)', () => {
  const target = entryId('t2');

  /** One wrapper, exactly as `api/dataset-plugin.ts` documents composition. */
  function writes(edit: EntryEdit): (next: EditExtender) => EditExtender {
    return (next) => (call) => mergeEntryEdits(next(call), new Map([[target, edit]]));
  }

  function datasetWithThreePlugins(): DatasetState {
    const state = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: 0, end: 10 },
        { id: 't2', name: 't2', start: 0, end: 10 },
      ],
      timeZone: 'UTC',
      fields: [{ key: 'tag' }],
    });
    state.setExtender(writes({ name: 'A' }));
    state.setExtender(writes({ tag: 'milestone' }));
    state.setExtender(writes({ parentId: entryId('t1') }));
    return state;
  }

  it('lands every plugin write in the store, not the last one alone', () => {
    const state = datasetWithThreePlugins();
    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), proposedEdit({ name: 'a' })),
      'user',
    );

    const committed = state.entries.get(target);
    expect(committed?.name).toBe('A');
    expect(committed?.read('tag')).toBe('milestone');
    expect(committed?.parent()?.id).toBe(entryId('t1'));
  });

  it('emits a changeset row for every plugin write, so undo restores all three', () => {
    const state = datasetWithThreePlugins();
    let captured: readonly { id: EntryId; field: string }[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated as readonly { id: EntryId; field: string }[];
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), proposedEdit({ name: 'a' })),
      'user',
    );

    const onTarget = captured
      .filter((row) => row.id === target)
      .map((row) => row.field)
      .sort();
    expect(onTarget).toEqual(['name', 'parentId', 'siblingIndex', 'tag']);
  });
});

// #466 case 1. Before this, an extender could only guess where its write would land. It wrote, and
// core either took the value or dropped it and raised `derived-values-dropped` — a warning the plugin
// author could read but not prevent. `writeTarget` is what turns that warning into a question the
// extender can ask first, and the two tests below are the before and the after.
describe('an extender asks where its write lands before it writes (#466 case 1)', () => {
  /** `Depot` holds the leaf `Van 1`; `cost` rolls up, and `spare` does not. */
  function depotDataset(extender: EditExtender): { state: DatasetState; reports: ErrorReport[] } {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'depot', name: 'Depot', start: 0, end: 1 },
        { id: 'van-1', name: 'Van 1', parentId: 'depot', start: 0, end: 1, props: { cost: 10 } },
      ],
      fields: [
        { key: 'cost', rollUp: 'sum' },
        { key: 'spare', rollUp: 'none' },
      ],
      editExtender: extender,
    });
    const reports: ErrorReport[] = [];
    state.on('error', (report) => {
      reports.push(report);
    });
    return { state, reports };
  }

  it('answers refused on a rolling-up parent, entry on a leaf, and entry for rollUp: none', () => {
    const seen = new Map<string, WriteTarget>();
    const { state } = depotDataset((request) => {
      seen.set('depot.cost', request.writeTarget('depot', 'cost'));
      seen.set('van-1.cost', request.writeTarget('van-1', 'cost'));
      seen.set('depot.spare', request.writeTarget('depot', 'spare'));
      // `start` is an ordinary rolling-up Field now (ADR 0026), so the parent's own cell is the
      // Rollup's there too — a plugin author reads one rule, not one rule plus a core exception.
      seen.set('depot.start', request.writeTarget('depot', 'start'));
      return new Map();
    });

    state.entries.update('van-1', { name: 'Van One' });

    expect([...seen]).toEqual([
      ['depot.cost', 'refused'],
      ['van-1.cost', 'entry'],
      ['depot.spare', 'entry'],
      ['depot.start', 'refused'],
    ]);
  });

  it('a blind write to a rolling-up parent cell is dropped, and raises one report', () => {
    const { state, reports } = depotDataset(() => new Map([[entryId('depot'), { cost: 999 }]]));

    state.entries.update('van-1', { name: 'Van One' });

    expect(state.entries.get('depot')?.read('cost')).toBe(10); // the Rollup's answer, not 999
    expect(reports).toHaveLength(1);
    expect(reports[0]?.code).toBe('derived-values-dropped');
  });

  it('an extender that asks first writes the child instead, and raises no report at all', () => {
    const { state, reports } = depotDataset((request) => {
      // The same cascade, now aimed by the answer rather than by a guess.
      if (request.writeTarget('depot', 'cost') === 'entry') {
        return new Map([[entryId('depot'), { cost: 999 }]]);
      }
      return new Map([[entryId('van-1'), { cost: 999 }]]);
    });

    state.entries.update('van-1', { name: 'Van One' });

    expect(state.entries.get('van-1')?.read('cost')).toBe(999);
    expect(state.entries.get('depot')?.read('cost')).toBe(999); // rolled up, not authored
    expect(reports).toEqual([]);
  });

  it('sees an add that promotes a row to a parent inside the same transaction', () => {
    // The add and the cascade share one transaction, so the extender must read the tree this commit
    // leaves behind: `Van 1` gains a child here, and its `cost` cell becomes the Rollup's mid-flight.
    const seen: WriteTarget[] = [];
    const { state, reports } = depotDataset((request) => {
      seen.push(request.writeTarget('van-1', 'cost'));
      expect(request.hasChildren('van-1')).toBe(true);
      return new Map();
    });

    state.transaction(() => {
      state.entries.add({ id: 'crate-a', name: 'Crate A', parentId: 'van-1', props: { cost: 4 } });
    });

    expect(seen).toEqual(['refused']);
    expect(reports).toEqual([]);
  });
});
