// data/ — the public mutation API (S2.3 §2): dataset.entries.add/update/remove, exercised through
// DatasetState the way a consumer would reach them (`dataset.entries.add(...)`), not through the
// TxToken-gated staging methods `transaction.test.ts` uses directly.

import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf, invertChangeSet } from './change-set.js';
import { identityExtender } from './edit-extension.js';
import * as fieldAccess from './fields/field-access.js';
import {
  ComputedFieldCannotBeWrittenError,
  DerivedFieldNotWritableError,
  DuplicateEntryIdError,
  DuplicateSegmentIdError,
  EmptySegmentsError,
  EntryNotFoundError,
  FieldNotEditableError,
  ParentCycleError,
  SegmentNotFoundError,
  UnknownFieldError,
  entryId,
  segmentId,
} from '../model/index.js';
import type { ChangeSet, EntryInput, Field } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
  });
}

function changeSets(state: DatasetState): ChangeSet[] {
  const seen: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    seen.push(changeSet);
  });
  return seen;
}

describe('entries.add', () => {
  it('returns the stored entry, and a second add with the same id throws while the store keeps one', () => {
    const state = dataset();
    const stored = state.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });

    expect(stored.id).toBe(entryId('t9'));
    expect(stored.name).toBe('Roofing');
    expect(state.entries.size).toBe(1);

    expect(() => state.entries.add({ id: 't9', name: 'Roofing again', start: 0, end: 1 })).toThrow(
      DuplicateEntryIdError,
    );
    expect(state.entries.size).toBe(1);
    expect(state.entries.get('t9')?.name).toBe('Roofing');
  });

  it('the changeset carries one added row', () => {
    const state = dataset();
    const seen = changeSets(state);

    state.entries.add({ id: 't9', name: 'Roofing', start: 0, end: 1 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.added).toHaveLength(1);
    expect(seen[0]?.added[0]?.entity.id).toBe(entryId('t9'));
  });

  it('add({}) stores no dates and no Segments (ADR 0012 Gate)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't9', name: 'Roofing' });

    expect(entry.start).toBeUndefined();
    expect(entry.end).toBeUndefined();
    expect(entry.segments).toHaveLength(0);
  });

  it('add({ start }) stores one date and mints no Segment (ADR 0012 Gate)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't9', name: 'Roofing', start: 0 });

    expect(entry.start).toBe(toInstant('UTC', 0));
    expect(entry.end).toBeUndefined();
    expect(entry.segments).toHaveLength(0);
  });
});

describe('entries.update', () => {
  it('records one updated row per changed field, with from and to; a no-op update commits nothing', () => {
    const state = dataset([{ id: 't1', name: 'Framing' }]);
    const seen = changeSets(state);

    const updated = state.entries.update('t1', { name: 'Framing — north wing', end: 5 });

    expect(updated.name).toBe('Framing — north wing');
    expect(updated.end).toBe(5);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.updated).toEqual(
      expect.arrayContaining([
        { store: 'entries', id: entryId('t1'), field: 'name', from: 'Framing', to: 'Framing — north wing' },
        { store: 'entries', id: entryId('t1'), field: 'end', from: 1, to: 5 },
      ]),
    );

    state.entries.update('t1', { name: 'Framing — north wing' });
    expect(seen).toHaveLength(1); // the no-op update commits nothing, so no second changeset
  });

  it('update(id, { start: undefined, end: undefined }) clears both dates and the Segments (ADR 0012 Gate)', () => {
    const state = dataset([{ id: 't1', name: 'Framing', start: '2026-01-01', end: '2026-01-05' }]);

    const cleared = state.entries.update('t1', { start: undefined, end: undefined });

    expect(cleared.start).toBeUndefined();
    expect(cleared.end).toBeUndefined();
    expect(cleared.segments).toHaveLength(0);
  });

  it('update(id, { segments: [] }) still throws EmptySegmentsError (ADR 0012 Gate)', () => {
    const state = dataset([{ id: 't1', name: 'Framing', start: '2026-01-01', end: '2026-01-05' }]);

    expect(() => state.entries.update('t1', { segments: [] })).toThrow(EmptySegmentsError);
    expect(state.entries.get('t1')?.segments).toHaveLength(1);
  });

  it('an envelope write on a one-segment entry moves that segment, and the changeset says so', () => {
    // A one-Segment Entry draws its own envelope, so `start` alone moves both. The changeset must
    // carry the segments row: the store applies rows, so a write nobody names never lands (#212).
    const state = dataset([{ id: 't1', name: 'Framing', start: '2026-01-01', end: '2026-01-05' }]);
    const before = state.entries.get('t1')!.segments[0]!.id;
    const seen = changeSets(state);

    state.entries.update('t1', { start: '2026-01-02' });

    const after = state.entries.get('t1')!;
    expect(after.segments).toHaveLength(1);
    expect(after.segments[0]!.start).toBe(after.start);
    expect(after.segments[0]!.id).toBe(before);
    expect(seen).toHaveLength(1);
    const fields = seen[0]!.updated.flatMap((row) => ('field' in row ? [String(row.field)] : []));
    expect(fields).toContain('segments');
  });

  it("loose dates on update resolve through the dataset zone the way construction's do", () => {
    const fromConstruction = dataset([{ id: 't1', start: '2026-09-08', end: '2026-09-09' }]);
    const fromUpdate = dataset([{ id: 't1' }]);

    const updated = fromUpdate.entries.update('t1', { start: '2026-09-08', end: '2026-09-09' });
    const constructed = fromConstruction.entries.get('t1')!;

    expect(updated.start).toBe(constructed.start);
    expect(updated.end).toBe(constructed.end);
    expect(updated.start).toBe(toInstant('UTC', '2026-09-08'));
    expect(updated.end).toBe(toEndInstant('UTC', '2026-09-09', 'inclusive'));
  });

  it('an unknown id throws EntryNotFoundError', () => {
    const state = dataset();
    expect(() => state.entries.update('missing', { name: 'x' })).toThrow(EntryNotFoundError);
  });

  it('an edit naming a key that is not a field throws UnknownFieldError', () => {
    const state = dataset([{ id: 't1' }]);
    expect(() => state.entries.update('t1', { notAField: true })).toThrow(UnknownFieldError);
    expect(state.entries.get('t1')?.name).toBe('t1');
  });

  it('[S4-A2] an unregistered key throws and stages nothing', () => {
    const state = dataset([{ id: 't1' }]);
    const seen = changeSets(state);
    expect(() => state.entries.update('t1', { cost: 500 })).toThrow(UnknownFieldError);
    expect(seen).toHaveLength(0);
    expect(state.entries.get('t1')?.toInput().props).toEqual({});
  });
});

describe('entries.remove', () => {
  it('removes a parent and its whole subtree in one changeset, regardless of removal order', () => {
    const state = dataset([
      { id: 'root' },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'root' },
      { id: 'other' },
    ]);
    const seen = changeSets(state);

    state.entries.remove('root');

    expect(seen).toHaveLength(1);
    const removedIds = seen[0]?.removed.map((row) => row.entity.id).sort();
    expect(removedIds).toEqual([entryId('a'), entryId('b'), entryId('c'), entryId('root')].sort());
    expect(state.entries.has('other')).toBe(true);
    expect(state.entries.size).toBe(1);
  });

  it('an unknown id throws EntryNotFoundError', () => {
    const state = dataset();
    expect(() => state.entries.remove('missing')).toThrow(EntryNotFoundError);
  });
});

describe('entries.removeSegments (#212, ADR 0010)', () => {
  it('removes one Segment of three, leaves the Entry, and recomputes the envelope over the two that remain', () => {
    const state = dataset([
      {
        id: 't1',
        start: 0,
        end: 30,
        segments: [
          { id: 'sg1', start: 0, end: 10 },
          { id: 'sg2', start: 10, end: 20 },
          { id: 'sg3', start: 20, end: 30 },
        ],
      },
    ]);

    state.entries.removeSegments(['sg2']);

    const entry = state.entries.get('t1');
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.segments.map((segment) => segment.id)).toEqual([segmentId('sg1'), segmentId('sg3')]);
    expect(entry?.start).toBe(toInstant('UTC', 0));
    expect(entry?.end).toBe(toInstant('UTC', 30));
  });

  it('removes Segments of two different Entries in one call, and the result is one changeset', () => {
    const state = dataset([
      {
        id: 't1',
        start: 0,
        end: 20,
        segments: [
          { id: 'a1', start: 0, end: 10 },
          { id: 'a2', start: 10, end: 20 },
        ],
      },
      {
        id: 't2',
        start: 0,
        end: 20,
        segments: [
          { id: 'b1', start: 0, end: 10 },
          { id: 'b2', start: 10, end: 20 },
        ],
      },
    ]);
    const seen = changeSets(state);

    state.entries.removeSegments(['a2', 'b2']);

    expect(seen).toHaveLength(1);
    expect(state.entries.get('t1')?.segments.map((segment) => segment.id)).toEqual([segmentId('a1')]);
    expect(state.entries.get('t2')?.segments.map((segment) => segment.id)).toEqual([segmentId('b1')]);
  });

  it("removing an Entry's last Segment keeps the Entry and clears both dates (ADR 0012)", () => {
    const state = dataset([
      { id: 't1', start: 0, end: 10, segments: [{ id: 'sole', start: 0, end: 10 }] },
      { id: 'other' },
    ]);

    state.entries.removeSegments(['sole']);

    const entry = state.entries.get('t1');
    expect(entry).toBeDefined();
    expect(entry?.start).toBeUndefined();
    expect(entry?.end).toBeUndefined();
    expect(entry?.segments).toHaveLength(0);
    expect(state.entries.has('other')).toBe(true);
  });

  it('undo after a last-Segment removal restores the dates and the Segment with the same id', () => {
    const state = dataset([{ id: 't1', start: 0, end: 10, segments: [{ id: 'sole', start: 0, end: 10 }] }]);

    state.entries.removeSegments(['sole']);
    state.undo();

    const restored = state.entries.get('t1');
    expect(restored?.id).toBe(entryId('t1'));
    expect(restored?.segments.map((segment) => segment.id)).toEqual([segmentId('sole')]);
  });

  it("a last-Segment removal never touches the Entry's descendants (ADR 0012: the Entry survives, unlike the old #212 removal)", () => {
    const state = dataset([
      { id: 'ps', start: 0, end: 10, segments: [{ id: 'sole', start: 0, end: 10 }] },
      { id: 'child', parentId: 'ps', start: 100, end: 200 },
    ]);

    state.entries.removeSegments(['sole']);

    expect(state.entries.has('ps')).toBe(true);
    expect(state.entries.get('child')?.parent()?.id).toBe(entryId('ps'));

    // `ps` has a child, so its dates are the Rollup's (ADR 0013), and they still read off `child`
    // after the Segment goes. This assertion is new (N8, BUILD-LOG): the comment that stood here
    // claimed the Rollup "redraws its span from `child` right away", and it did not — the internal
    // clear proposed `{ start: undefined, end: undefined }` in the transaction body, the Rollup
    // yielded to that proposal (decision 5), and `ps` committed dateless over a dated child. The
    // clear now runs only where the Entry owns its own dates. Nothing asserted this, which is why
    // it went unnoticed.
    expect(state.entries.get('ps')?.start).toBe(100);
    expect(state.entries.get('ps')?.end).toBe(200);
  });

  it('an unknown segment id throws SegmentNotFoundError, and stages nothing', () => {
    const state = dataset([{ id: 't1', start: 0, end: 20, segments: [{ id: 'a1', start: 0, end: 20 }] }]);
    const seen = changeSets(state);

    expect(() => state.entries.removeSegments(['missing'])).toThrow(SegmentNotFoundError);

    expect(seen).toHaveLength(0);
    expect(state.entries.get('t1')?.segments).toHaveLength(1);
  });
});

describe('Segment identity (#212, ADR 0010, fix plan R1)', () => {
  it('two Entries authoring the same SegmentId at construction throw DuplicateSegmentIdError', () => {
    expect(() =>
      dataset([
        { id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] },
        { id: 'b', segments: [{ id: 'sg1', start: 0, end: 1 }] },
      ]),
    ).toThrow(DuplicateSegmentIdError);
  });

  it('entries.add with a SegmentId another Entry already draws throws, and stages nothing', () => {
    const state = dataset([{ id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    expect(() =>
      state.entries.add({
        id: 'b',
        name: 'b',
        start: 0,
        end: 1,
        segments: [{ id: 'sg1', start: 0, end: 1 }],
      }),
    ).toThrow(DuplicateSegmentIdError);
    expect(state.entries.has('b')).toBe(false);
  });

  it('entries.update with a SegmentId another Entry already draws throws, and leaves the store unchanged', () => {
    const state = dataset([
      { id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] },
      { id: 'b', segments: [{ id: 'sg2', start: 0, end: 1 }] },
    ]);

    expect(() => state.entries.update('b', { segments: [{ id: 'sg1', start: 0, end: 1 }] })).toThrow(
      DuplicateSegmentIdError,
    );
    expect(state.entries.get('b')?.segments.map((segment) => segment.id)).toEqual([segmentId('sg2')]);
  });

  it('a move (entries.update naming no id) keeps the Segment id — positional match, not a new mint', () => {
    const state = dataset([{ id: 't1', start: 0, end: 10, segments: [{ id: 'sole', start: 0, end: 10 }] }]);

    const moved = state.entries.update('t1', { segments: [{ start: 5, end: 15 }] });

    expect(moved.segments).toHaveLength(1);
    expect(moved.segments[0]!.id).toBe(segmentId('sole'));
    expect(moved.segments[0]!.start).toBe(toInstant('UTC', 5));
  });

  it('an id-only write reaches the changeset and is undoable — segmentsEqual compares id', () => {
    const state = dataset([{ id: 't1', segments: [{ id: 'sg1', start: 0, end: 10 }] }]);
    const seen = changeSets(state);

    state.entries.update('t1', { segments: [{ id: 'renamed', start: 0, end: 10 }] });

    expect(seen).toHaveLength(1);
    expect(state.entries.get('t1')?.segments.map((segment) => segment.id)).toEqual([segmentId('renamed')]);

    state.undo();
    expect(state.entries.get('t1')?.segments.map((segment) => segment.id)).toEqual([segmentId('sg1')]);
  });
});

describe('entryIdOfSegment / entryIdsOfSegments (#212, ADR 0010, fix plan R4)', () => {
  it('finds the Entry a construction-time Segment belongs to, and answers undefined for an unknown id', () => {
    const state = dataset([{ id: 't1', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    expect(state.entries.entryIdOfSegment('sg1')).toBe(entryId('t1'));
    expect(state.entries.entryIdOfSegment('missing')).toBeUndefined();
  });

  it('follows a committed add, so a Segment minted after construction is findable too', () => {
    const state = dataset();

    const added = state.entries.add({
      id: 't1',
      name: 't1',
      start: 0,
      end: 1,
      segments: [{ id: 'sg1', start: 0, end: 1 }],
    });

    expect(state.entries.entryIdOfSegment('sg1')).toBe(added.id);
  });

  it('follows a committed removeSegments, undo included: the index moves with the Entry, not just its ids', () => {
    const state = dataset([
      {
        id: 't1',
        start: 0,
        end: 20,
        segments: [
          { id: 'a1', start: 0, end: 10 },
          { id: 'a2', start: 10, end: 20 },
        ],
      },
    ]);

    state.entries.removeSegments(['a2']);
    expect(state.entries.entryIdOfSegment('a2')).toBeUndefined();
    expect(state.entries.entryIdOfSegment('a1')).toBe(entryId('t1'));

    state.undo();
    expect(state.entries.entryIdOfSegment('a2')).toBe(entryId('t1'));
  });

  it('follows a committed entries.remove: the removed Entry’s Segment stops resolving', () => {
    const state = dataset([{ id: 't1', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    state.entries.remove('t1');

    expect(state.entries.entryIdOfSegment('sg1')).toBeUndefined();
  });

  it('follows a Segment moved from one Entry to another by entries.update, without a stale second owner', () => {
    const state = dataset([
      { id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] },
      { id: 'b', segments: [{ id: 'sg2', start: 0, end: 1 }] },
    ]);

    state.entries.update('a', { segments: [{ id: 'sg3', start: 0, end: 1 }] });

    expect(state.entries.entryIdOfSegment('sg1')).toBeUndefined();
    expect(state.entries.entryIdOfSegment('sg3')).toBe(entryId('a'));
    expect(state.entries.entryIdOfSegment('sg2')).toBe(entryId('b'));
  });

  it('inside an open transaction, sees its own uncommitted add before commit (read-your-own-writes)', () => {
    const state = dataset();

    state.transaction(() => {
      state.entries.add({
        id: 't1',
        name: 't1',
        start: 0,
        end: 1,
        segments: [{ id: 'sg1', start: 0, end: 1 }],
      });
      expect(state.entries.entryIdOfSegment('sg1')).toBe(entryId('t1'));
    });
    expect(state.entries.entryIdOfSegment('sg1')).toBe(entryId('t1'));
  });

  it('inside an open transaction, an edit that drops a Segment stops resolving it before commit, with no stale fallthrough', () => {
    const state = dataset([{ id: 't1', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    state.transaction(() => {
      state.entries.update('t1', { segments: [{ id: 'sg2', start: 0, end: 1 }] });
      expect(state.entries.entryIdOfSegment('sg1')).toBeUndefined();
      expect(state.entries.entryIdOfSegment('sg2')).toBe(entryId('t1'));
    });
  });

  it('inside an open transaction, a removed Entry’s Segment stops resolving before commit', () => {
    const state = dataset([{ id: 't1', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    state.transaction(() => {
      state.entries.remove('t1');
      expect(state.entries.entryIdOfSegment('sg1')).toBeUndefined();
    });
  });

  it('entryIdsOfSegments dedupes to the owning Entry and skips an id nothing draws, in first-named order', () => {
    const state = dataset([
      {
        id: 'a',
        segments: [
          { id: 'sg1', start: 0, end: 1 },
          { id: 'sg2', start: 0, end: 1 },
        ],
      },
      { id: 'b', segments: [{ id: 'sg3', start: 0, end: 1 }] },
    ]);

    expect(state.entries.entryIdsOfSegments(['sg3', 'sg1', 'missing', 'sg2'])).toEqual([
      entryId('b'),
      entryId('a'),
    ]);
  });

  it('segmentIdsOfEntries names every Segment of each Entry, in Entry order, and skips an id nothing owns (#212, fix plan R6)', () => {
    const state = dataset([
      {
        id: 'a',
        segments: [
          { id: 'sg1', start: 0, end: 1 },
          { id: 'sg2', start: 0, end: 1 },
        ],
      },
      { id: 'b', segments: [{ id: 'sg3', start: 0, end: 1 }] },
    ]);

    expect(state.entries.segmentIdsOfEntries(['b', 'missing', 'a'])).toEqual([
      segmentId('sg3'),
      segmentId('sg1'),
      segmentId('sg2'),
    ]);
  });

  // #212 R2 fix-plan review, finding E: `entryIdsOfSegments` already dedupes a repeated id; its
  // documented pair did not, so a caller naming one Entry twice wrote duplicate ids into a Selection.
  it('segmentIdsOfEntries dedupes a repeated Entry id, naming it once in first-named order', () => {
    const state = dataset([
      {
        id: 'a',
        segments: [
          { id: 'sg1', start: 0, end: 1 },
          { id: 'sg2', start: 0, end: 1 },
        ],
      },
      { id: 'b', segments: [{ id: 'sg3', start: 0, end: 1 }] },
    ]);

    expect(state.entries.segmentIdsOfEntries(['a', 'b', 'a'])).toEqual([
      segmentId('sg1'),
      segmentId('sg2'),
      segmentId('sg3'),
    ]);
  });
});

describe('Segment→Entry index review fixes (#212, 2026-09-05 review)', () => {
  it('B2: a remove-then-re-add of one EntryId in one transaction forgets the replaced object’s Segments', () => {
    const state = dataset([{ id: 't9', segments: [{ id: 'old', start: 0, end: 1 }] }]);

    state.transaction(() => {
      state.entries.remove('t9');
      state.entries.add({
        id: 't9',
        name: 't9',
        start: 0,
        end: 1,
        segments: [{ id: 'new', start: 0, end: 1 }],
      });
    });

    expect(state.entries.entryIdOfSegment('old')).toBeUndefined();
    expect(state.entries.entryIdOfSegment('new')).toBe(entryId('t9'));
    expect(() => state.entries.removeSegments(['old'])).toThrow(SegmentNotFoundError);
  });

  it('B3: a Segment handed from one Entry to another in one transaction resolves to the new owner, regardless of edit order', () => {
    const state = dataset([
      { id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] },
      { id: 'b', segments: [{ id: 'sg3', start: 0, end: 1 }] },
    ]);

    state.transaction(() => {
      state.entries.update('b', { name: 'b2' }); // 'b' enters the edits map first
      state.entries.update('a', { segments: [{ id: 'sg2', start: 0, end: 1 }] }); // 'a' frees sg1
      state.entries.update('b', {
        segments: [
          { id: 'sg3', start: 0, end: 1 },
          { id: 'sg1', start: 0, end: 1 },
        ],
      }); // 'b' takes sg1
    });

    expect(state.entries.entryIdOfSegment('sg1')).toBe(entryId('b'));
    expect(state.entries.entryIdOfSegment('sg2')).toBe(entryId('a'));
  });

  it('B4: replacing an Entry wholesale and reusing its old SegmentId on a different Entry, in one transaction, does not throw', () => {
    const state = dataset([{ id: 'a', segments: [{ id: 'sg1', start: 0, end: 1 }] }]);

    expect(() => {
      state.transaction(() => {
        state.entries.remove('a');
        state.entries.add({
          id: 'a',
          name: 'a',
          start: 0,
          end: 1,
          segments: [{ id: 'sgX', start: 0, end: 1 }],
        });
        state.entries.add({
          id: 'b',
          name: 'b',
          start: 0,
          end: 1,
          segments: [{ id: 'sg1', start: 0, end: 1 }],
        });
      });
    }).not.toThrow();

    expect(state.entries.entryIdOfSegment('sgX')).toBe(entryId('a'));
    expect(state.entries.entryIdOfSegment('sg1')).toBe(entryId('b'));
  });

  /** A multi-select Delete: one Segment removed from every Entry of `entryCount`, all in one
   *  transaction — the shape a `removeSegments` call takes from a keyboard delete on a large
   *  selection. Returns how many times `entryAfterEdit` ran rebuilding an overlay Entry, the
   *  cost the old `#liveSegmentOwner` paid once per already-edited id for every Segment id it
   *  checked (quadratic in `entryCount`). */
  function overlayCallsForMultiSegmentDelete(entryCount: number): number {
    const overlaySpy = vi.spyOn(fieldAccess, 'entryAfterEdit');
    const state = dataset(
      Array.from({ length: entryCount }, (_, index) => ({
        id: `e${index}`,
        start: 0,
        end: 2,
        segments: [
          { id: `e${index}-a`, start: 0, end: 1 },
          { id: `e${index}-b`, start: 1, end: 2 },
        ],
      })),
    );
    overlaySpy.mockClear();

    state.entries.removeSegments(Array.from({ length: entryCount }, (_, index) => `e${index}-a`));

    const calls = overlaySpy.mock.calls.length;
    overlaySpy.mockRestore();
    return calls;
  }

  it("S1: checking a transaction's Segment ids for uniqueness scales with entryCount, not entryCount²", () => {
    const small = overlayCallsForMultiSegmentDelete(100);
    const large = overlayCallsForMultiSegmentDelete(400);

    // The fix reads Segment ownership straight off `WriteSet.segmentOwner` — one map lookup per
    // id — so a 4x larger transaction costs at most a small multiple more overlay rebuilds, the
    // ones `get()`/`toEditReading` already pay once per Entry regardless of this fix. Before the fix,
    // the same 4x grew the call count roughly 16x (quadratic): each Entry's uniqueness check
    // rebuilt an overlay for every id already staged ahead of it.
    expect(large).toBeLessThan(small * 4 + 50);
  });
});

describe('parentId cycle rejection', () => {
  it('a chain (a -> b -> a) and self-parenting (a -> a) both throw, and leave the store unchanged', () => {
    const state = dataset([{ id: 'a' }, { id: 'b', parentId: 'a' }]);

    expect(() => state.entries.update('a', { parentId: 'b' })).toThrow(ParentCycleError);
    expect(() => state.entries.update('a', { parentId: 'a' })).toThrow(ParentCycleError);

    expect(state.entries.get('a')?.parent()?.id).toBeUndefined();
    expect(state.entries.get('b')?.parent()?.id).toBe(entryId('a'));
  });

  it('a parentId naming an entry the store has no entry for throws EntryNotFoundError', () => {
    const state = dataset([{ id: 'a' }]);
    expect(() => state.entries.update('a', { parentId: 'ghost' })).toThrow(EntryNotFoundError);
  });
});

describe('auto-wrap (D-S2-8)', () => {
  it('three standalone mutators produce three changesets; the same three in one transaction produce one', () => {
    const state = dataset([{ id: 't1' }, { id: 't2' }]);
    const seenStandalone = changeSets(state);

    state.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
    state.entries.update('t1', { name: 'a' });
    state.entries.remove('t2');
    expect(seenStandalone).toHaveLength(3);

    const other = dataset([{ id: 't1' }, { id: 't2' }]);
    const seenBatched = changeSets(other);

    other.transaction(() => {
      other.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
      other.entries.update('t1', { name: 'a' });
      other.entries.remove('t2');
    });
    expect(seenBatched).toHaveLength(1);
  });
});

describe('roll-up (§1.5)', () => {
  // ADR 0013: rollup is structural now (any Entry with children rolls up), so a childless Entry
  // and a leaf Entry are the same case — one date, or none, is not an error either way.
  it('an Entry with no dates and no children is legal, and stays dateless (ADR 0012)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't1', name: 'Roofing' });
    expect(entry.start).toBeUndefined();
    expect(entry.end).toBeUndefined();
  });
});

describe('read-your-own-writes validation (§1.3)', () => {
  it("add('t9') twice in one body throws on the second call", () => {
    const state = dataset();
    expect(() =>
      state.transaction(() => {
        state.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
        state.entries.add({ id: 't9', name: 't9-again', start: 0, end: 1 });
      }),
    ).toThrow(DuplicateEntryIdError);
    expect(state.entries.has('t9')).toBe(false);
  });

  it("remove('t9'); add('t9') in one body throws nothing and commits one net change", () => {
    const state = dataset([{ id: 't9', name: 'original' }]);
    const seen = changeSets(state);

    state.transaction(() => {
      state.entries.remove('t9');
      state.entries.add({ id: 't9', name: 'reborn', start: 0, end: 1 });
    });

    expect(state.entries.get('t9')?.name).toBe('reborn');
    expect(seen).toHaveLength(1);
  });
});

describe('rollup (§1.5)', () => {
  it('moving a child moves its parent, in one changeset — reverting both fields restores both', () => {
    const state = dataset([
      { id: 'p1' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);
    // One `Entry` per id, every read live (ADR 0017): a "before" reading is a value held, never a
    // row held.
    const startBefore = state.entries.get('p1')!.start;
    const endBefore = state.entries.get('p1')!.end;
    const seen = changeSets(state);

    state.entries.update('c1', { start: '2026-02-01', end: '2026-02-15' });

    expect(seen).toHaveLength(1);
    const parentRows = fieldRowsOf(seen[0]!).filter((row) => row.id === entryId('p1'));
    // `segments` rides along (#212 B1 fix): p1 draws one Segment, and the Rollup keeps it paired
    // with the envelope it just rolled up, the same way `toEditReading` pairs a direct `update(id, {
    // start })`.
    expect(parentRows.map((row) => row.field).sort()).toEqual(['end', 'segments', 'start']);
    const after = state.entries.get('p1')!;
    expect(after.start).not.toBe(startBefore);
    expect(after.end).not.toBe(endBefore);

    // "one undo restores both": `entries.update()` now refuses a direct write to a rolled-up field
    // on a parent that still has children (`DerivedFieldNotWritableError`, this build's own decision
    // 6) — so undo goes through `replay(invertChangeSet(...))`, the same door
    // `api/dataset.test.ts`'s "a consumer History..." test uses, not a manual per-field `update()`.
    state.replay(invertChangeSet(seen[0]!));
    expect(state.entries.get('p1')?.start).toBe(startBefore);
    expect(state.entries.get('p1')?.end).toBe(endBefore);
  });

  it('a two-level tree rolls up in one pass', () => {
    const state = dataset([
      { id: 'root' },
      { id: 'mid', parentId: 'root' },
      { id: 'leaf', parentId: 'mid', start: '2026-03-01', end: '2026-03-05' },
    ]);

    state.entries.update('leaf', { start: '2026-04-01', end: '2026-04-10' });

    const mid = state.entries.get('mid')!;
    const root = state.entries.get('root')!;
    expect(mid.start).toBe(toInstant('UTC', '2026-04-01'));
    expect(mid.end).toBe(toEndInstant('UTC', '2026-04-10', 'inclusive'));
    expect(root.start).toBe(mid.start);
    expect(root.end).toBe(mid.end);
  });

  it('a parent with children declared in the same construction array has a real span from the start', () => {
    const state = dataset([
      { id: 'p1' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-01-10', 'inclusive'));
  });

  it('an Entry written as a leaf keeps the proposed span when the same transaction gives it a child', () => {
    // Decision 5: the Rollup yields to a field the caller proposed in the same transaction. This
    // test used to seed `p1` with a child already in place and write `p1`'s span through the
    // consumer door. The ADR 0013 amendment (2026-09-11) refuses that write from every direction,
    // so the case moved to the structure that makes it honest: `x` is a **leaf** when the write is
    // proposed, so the write is legal, and it gains a child in the same transaction. The claim is
    // unchanged — the proposal wins over the cascade — and the write is one the door still allows.
    const state = dataset([{ id: 'x', start: '2026-01-01', end: '2026-01-05' }]);

    state.transaction(() => {
      state.entries.update('x', { start: '2026-09-01', end: '2026-09-02' });
      state.entries.add({ id: 'c1', name: 'c1', parentId: 'x', start: '2026-12-01', end: '2026-12-02' });
    });

    const x = state.entries.get('x')!;
    expect(x.start).toBe(toInstant('UTC', '2026-09-01'));
    expect(x.end).toBe(toEndInstant('UTC', '2026-09-02', 'inclusive'));
  });
});

describe('a derived cell is read-only until the Field says what a write means (ADR 0013 amendment)', () => {
  /** A Dataset with one rolling-up consumer Field. `distribute`, when given, is what a write to a
   *  rolling-up parent's `cost` cell means. */
  function costDataset(distribute?: Field<number>['distribute']): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'p1', start: 0, end: 1 },
        { id: 'c1', name: 'c1', parentId: 'p1', start: 0, end: 1, props: { cost: 10 } },
        { id: 'c2', name: 'c2', parentId: 'p1', start: 0, end: 1, props: { cost: 20 } },
      ],
      fields: [{ key: 'cost', rollUp: 'sum', editable: true, ...(distribute ? { distribute } : {}) }],
    });
  }

  it('a parent cell with no distribute is refused standalone, and refused inside a transaction', () => {
    // The point of the exercise (Q7): permission follows the thing written, never the call that
    // wrapped it. `dataset.transaction()` is public, so a bypass here is a bypass for everyone.
    const standalone = costDataset();
    expect(() => standalone.entries.update('p1', { cost: 500 })).toThrow(DerivedFieldNotWritableError);
    expect(standalone.entries.get('p1')?.read('cost')).toBe(30);

    const batched = costDataset();
    expect(() =>
      batched.transaction(() => {
        batched.entries.update('p1', { cost: 500 });
      }),
    ).toThrow(DerivedFieldNotWritableError);
    expect(batched.entries.get('p1')?.read('cost')).toBe(30);

    const batchedWithCompany = costDataset();
    expect(() =>
      batchedWithCompany.transaction(() => {
        batchedWithCompany.entries.update('c1', { cost: 11 });
        batchedWithCompany.entries.update('p1', { cost: 500 });
      }),
    ).toThrow(DerivedFieldNotWritableError);
    expect(batchedWithCompany.entries.get('c1')?.read('cost')).toBe(10);
    expect(batchedWithCompany.entries.get('p1')?.read('cost')).toBe(30);
  });

  it('a Field that declares distribute writes the children, and the Rollup reads the cell back', () => {
    const state = costDataset((total, _parent, ctx) => {
      const children = ctx.children();
      const share = (total as number) / children.length;
      return new Map(children.map((child) => [child.id, { cost: share }]));
    });

    state.entries.update('p1', { cost: 900 });

    expect(state.entries.get('c1')?.read('cost')).toBe(450);
    expect(state.entries.get('c2')?.read('cost')).toBe(450);
    expect(state.entries.get('p1')?.read('cost')).toBe(900);
  });

  it('the distributed writes and their rolled-up parent land in one changeset, and one undo step', () => {
    const state = costDataset(
      (total, _parent, ctx) =>
        new Map(
          ctx.children().map((child) => [child.id, { cost: (total as number) / ctx.children().length }]),
        ),
    );
    const seen = changeSets(state);

    state.entries.update('p1', { cost: 900 });

    expect(seen).toHaveLength(1);
    const rows = fieldRowsOf(seen[0]!).map(
      (row) => `${row.id}.${row.field}: ${String(row.from)} → ${String(row.to)}`,
    );
    expect(rows).toEqual(
      expect.arrayContaining(['c1.cost: 10 → 450', 'c2.cost: 20 → 450', 'p1.cost: 30 → 900']),
    );
  });

  it('a distribute that declines refuses the write, with the same error an absent one gives', () => {
    const state = costDataset(() => undefined);
    expect(() => state.entries.update('p1', { cost: 900 })).toThrow(DerivedFieldNotWritableError);
    expect(state.entries.get('p1')?.read('cost')).toBe(30);

    const empty = costDataset(() => new Map());
    expect(() => empty.entries.update('p1', { cost: 900 })).toThrow(DerivedFieldNotWritableError);
    expect(empty.entries.get('p1')?.read('cost')).toBe(30);
  });

  it('a distribute that writes back to the parent is refused — that cell is the Rollup’s', () => {
    const state = costDataset(() => new Map([[entryId('p1'), { cost: 900 }]]));
    expect(() => state.entries.update('p1', { cost: 900 })).toThrow(DerivedFieldNotWritableError);
    expect(state.entries.get('p1')?.read('cost')).toBe(30);
  });

  it('a mixed patch is refused whole, before any write', () => {
    const state = costDataset();
    expect(() => state.entries.update('p1', { name: 'renamed', cost: 500 })).toThrow(
      DerivedFieldNotWritableError,
    );
    expect(state.entries.get('p1')?.name).toBe('p1');
  });

  it('a leaf writes its own rolling-up cell, with or without a distribute', () => {
    const state = costDataset();
    state.entries.update('c1', { cost: 99 });
    expect(state.entries.get('c1')?.read('cost')).toBe(99);
    expect(state.entries.get('p1')?.read('cost')).toBe(119);
  });
});

describe('validation leaves the store as the body found it', () => {
  it('a validation failure inside a transaction body commits nothing — no partial commit', () => {
    const state = dataset([{ id: 't1', name: 'original' }]);
    const seen = changeSets(state);

    expect(() =>
      state.transaction(() => {
        state.entries.update('t1', { name: 'changed' });
        state.entries.update('missing', { name: 'x' });
      }),
    ).toThrow(EntryNotFoundError);

    expect(state.entries.get('t1')?.name).toBe('original');
    expect(seen).toHaveLength(0);
  });
});

describe('removability (D-S2-23)', () => {
  it('with identityExtender injected explicitly, the fixture rolls up nothing and behaves identically', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', start: 0, end: 1 },
        { id: 'c1', name: 'c1', parentId: 'p1', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      editExtender: identityExtender, // explicit injection of what an unoccupied hook already defaults to
    });

    state.entries.update('c1', { start: '2026-05-01', end: '2026-05-10' });

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-05-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-05-10', 'inclusive'));
  });
});

describe('the write door: what entries.update() refuses (ADR 0015)', () => {
  /** One Dataset holding all three `editable` states, plus the shipped `compute` Field. `start` is
   *  the lock, `owner` is the app-owned value a user never types, and `cost` declares nothing — so
   *  it answers the default, `'anywhere'`. */
  function doorDataset(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'e1', name: 'e1', start: '2026-01-01', end: '2026-01-05', props: { cost: 10, owner: 'ana' } },
      ],
      fields: [{ key: 'start', editable: false }, { key: 'owner', editable: 'api' }, { key: 'cost' }],
    });
  }

  it("refuses a 'never' Field, and writes nothing", () => {
    const state = doorDataset();

    expect(() => state.entries.update('e1', { start: '2026-03-01' })).toThrow(FieldNotEditableError);
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });

  it("un-dating a 'never' Field is a change too, so it throws as well", () => {
    const state = doorDataset();

    expect(() => state.entries.update('e1', { start: undefined })).toThrow(FieldNotEditableError);
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });

  it("writes an 'api' Field — that state closes the grid cell, never this door", () => {
    const state = doorDataset();

    state.entries.update('e1', { owner: 'bo' });

    expect(state.entries.get('e1')?.read('owner')).toBe('bo');
  });

  it('writes a Field that declares no editable at all, because the default is anywhere', () => {
    const state = doorDataset();

    state.entries.update('e1', { cost: 42 });

    expect(state.entries.get('e1')?.read('cost')).toBe(42);
  });

  it('refuses a compute Field, and the message names this door', () => {
    const state = doorDataset();

    try {
      state.entries.update('e1', { duration: 1 });
      expect.unreachable('expected ComputedFieldCannotBeWrittenError');
    } catch (error) {
      expect(error).toBeInstanceOf(ComputedFieldCannotBeWrittenError);
      expect((error as ComputedFieldCannotBeWrittenError).message).toContain('entries.update');
    }
  });

  // A lock names what a *caller* may write, never what the library may.
  it('lets construction, entries.add() and History replay write a locked Field', () => {
    const state = doorDataset();
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));

    state.entries.add({ id: 'e2', name: 'e2', start: '2026-02-01', end: '2026-02-03' });
    expect(state.entries.get('e2')!.start).toBe(toInstant('UTC', '2026-02-01'));

    // The replay half: move a date while the Field is open, lock it, then undo. The undo replays a
    // `start` write onto a Field the consumer has since locked, and it must still land.
    const openThenLocked = dataset([{ id: 'x', start: '2026-01-01', end: '2026-01-05' }]);
    openThenLocked.entries.update('x', { start: '2026-01-03' });
    openThenLocked.fields.setEditable('start', 'never');

    openThenLocked.undo();

    expect(openThenLocked.entries.get('x')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });
});

describe('a lock holds at every caller-facing door (ADR 0015)', () => {
  /** Removing the last Segment un-dates the Entry, and un-dating is a change. So a locked `end`
   *  refuses that removal too — and the message names `entries.removeSegments`, the call the
   *  consumer wrote, never the `update` it delegates to (J37, BUILD-LOG). */
  it("refuses a last-Segment removal that would un-date a 'never' end, and names that door", () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [{ id: 'e1', name: 'e1', start: '2026-01-01', end: '2026-01-05' }],
      fields: [{ key: 'end', editable: false }],
    });
    const only = state.entries.get('e1')!.segments[0]!.id;

    try {
      state.entries.removeSegments([only]);
      expect.unreachable('expected FieldNotEditableError');
    } catch (error) {
      expect(error).toBeInstanceOf(FieldNotEditableError);
      expect((error as FieldNotEditableError).operation).toBe('entries.removeSegments');
    }
    expect(state.entries.get('e1')!.segments).toHaveLength(1);
  });

  it('removes a Segment from an Entry whose dates are open, as it always did', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        {
          id: 'e1',
          name: 'e1',
          segments: [
            { id: 's1', start: '2026-01-01', end: '2026-01-02' },
            { id: 's2', start: '2026-01-04', end: '2026-01-05' },
          ],
        },
      ],
    });

    state.entries.removeSegments(['s1']);

    expect(state.entries.get('e1')!.segments.map((segment) => segment.id)).toEqual([segmentId('s2')]);
  });
});
