import { describe, expect, it } from 'vitest';
import { fitSegmentsToEnvelope, reconcileExtenderEdits, readEntries, readEdit } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { buildEffectiveEntries } from './entry-tree.js';
import { entryId, EmptySegmentsError, segmentId, SegmentsOutOfSyncError } from '../model/index.js';
import type { Entry, EntryInput } from '../model/index.js';
import { addMs, instant } from '../time/index.js';
import type { StoredEdit } from './edit-extension.js';
import { FieldRegistry } from './fields/field-registry.js';

const registry = new FieldRegistry({ fields: [] });

const utc = (iso: string): number => Date.parse(iso);

// Each test gets its own counter, so no test can see another test's minted ids (I2).
function createContext(): EntryReadContext {
  let mintedCount = 0;
  return {
    timeZone: 'UTC',
    dateOnlyEnd: 'inclusive' as const,
    referenceDate: instant('2026-01-01T00:00:00Z'),
    rollUpKinds: new Set(['group']),
    mintSegmentId: () => segmentId(`minted-${++mintedCount}`),
  };
}

describe('readEntries', () => {
  it('brands a plain string id and reads a date-only end inclusively', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.start).toBe(utc('2026-09-01T00:00:00Z'));
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(entry?.end).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('leaves an optional field absent when the input never had it, but defaults kind to span', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ['end', 'id', 'kind', 'name', 'segments', 'start'].sort(),
    );
    expect(entry?.kind).toBe('span');
  });

  it('fills one segment over the full span when the input names none', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(entry?.segments).toHaveLength(1);
    expect(entry?.segments[0]?.id).toBe(segmentId('minted-1'));
  });

  it('carries parentId, kind, segments and meta through when present', () => {
    const input: EntryInput = {
      id: 'child',
      parentId: 'root',
      kind: 'milestone',
      name: 'Review',
      start: '2026-09-01',
      end: '2026-09-01',
      segments: [{ start: '2026-09-01', end: '2026-09-02' }],
      meta: { team: 'A' },
    };
    const [entry] = readEntries([input], createContext());
    expect(entry?.parentId).toBe(entryId('root'));
    expect(entry?.kind).toBe('milestone');
    expect(entry?.segments).toEqual([
      {
        id: segmentId('minted-1'),
        start: utc('2026-09-01T00:00:00Z'),
        end: utc('2026-09-03T00:00:00Z'),
      },
    ]);
    expect(entry?.meta).toEqual({ team: 'A' });
  });

  it('keeps an authored segment id unchanged through ingest', () => {
    const input: EntryInput = {
      id: 'seg',
      name: 'Seg',
      start: '2026-09-01',
      end: '2026-09-05',
      segments: [{ id: 'authored-seg', start: '2026-09-01', end: '2026-09-05' }],
    };
    const [entry] = readEntries([input], createContext());
    expect(entry?.segments[0]?.id).toBe(segmentId('authored-seg'));
  });
});

describe('readEdit (S4.10, D-S4-30)', () => {
  it('throws SegmentsOutOfSyncError when start/end are written without segments on a two-segment entry', () => {
    const context = createContext();
    const [segmented] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-09-01',
          end: '2026-09-10',
          segments: [
            { start: '2026-09-01', end: '2026-09-05' },
            { start: '2026-09-06', end: '2026-09-10' },
          ],
        },
      ],
      context,
    );
    expect(() => readEdit({ start: '2026-09-02' }, context, segmented!, registry)).toThrow(
      SegmentsOutOfSyncError,
    );
  });

  it('moves the lone segment with the envelope on a one-segment entry', () => {
    const context = createContext();
    const [single] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    const edit = readEdit({ start: '2026-09-02' }, context, single!, registry);
    expect(edit.start).toBe(utc('2026-09-02T00:00:00Z'));
    expect(edit.segments).toHaveLength(1);
  });

  // #212 fix-plan review, finding S2: `update(id, { segments: [] })` used to reach `time/`'s
  // internal "no Segments" assertion as a bare `Error`, with no `code` and no `FreeGanttError`.
  it('throws a typed EmptySegmentsError, not a bare Error, when segments is written empty', () => {
    const context = createContext();
    const [single] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    let caught: unknown;
    try {
      readEdit({ segments: [] }, context, single!, registry);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EmptySegmentsError);
    expect((caught as EmptySegmentsError).code).toBe('empty-segments');
  });

  // #212 fix-plan review, finding S3: a `start`/`end` written alongside `segments` whose own
  // envelope disagreed used to lose silently — the caller's values vanished, with `proposed`
  // claiming the caller wrote what `envelopeOfSegments` derived instead.
  it('throws SegmentsOutOfSyncError when a written start/end disagrees with the written segments', () => {
    const context = createContext();
    const [entry] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    expect(() =>
      readEdit(
        {
          start: 100,
          end: 200,
          segments: [
            { start: 0, end: 10 },
            { start: 10, end: 20 },
          ],
        },
        context,
        entry!,
        registry,
      ),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('derives start/end from segments silently when the caller names neither', () => {
    const context = createContext();
    const [entry] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    const edit = readEdit(
      {
        segments: [
          { start: 0, end: 10 },
          { start: 10, end: 20 },
        ],
      },
      context,
      entry!,
      registry,
    );
    expect(edit.start).toBe(0);
    expect(edit.end).toBe(20);
  });
});

// #212 R2 fix-plan review, finding A: `reconcileExtenderEdits` must reconcile a plugin's cascade
// against the state its own edit actually lands on — committed entries overlaid with this
// transaction's own body edits and adds (`buildEffectiveEntries`) — not against stale, pre-transaction
// entries. `build-commit-change-set.ts` composes these two functions the same way this test does.
describe('reconcileExtenderEdits reads the effective, not the stale, entry (finding A, hole 2)', () => {
  const context = createContext();

  function committedSegmentedEntry(): ReadonlyMap<ReturnType<typeof entryId>, Entry> {
    const [entry] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-01-01',
          end: '2026-01-10',
          segments: [
            { start: '2026-01-01', end: '2026-01-05' },
            { start: '2026-01-06', end: '2026-01-10' },
          ],
        },
      ],
      context,
    );
    return new Map([[entry!.id, entry!]]);
  }

  it('translates the body-widened Segment (2→1), not the stale two-Segment committed state', () => {
    const committed = committedSegmentedEntry();
    const [id] = committed.keys();
    const entry = committed.get(id!)!;
    // The body's own edit collapses the two Segments to one spanning the whole entry — reconciling
    // against `committed` alone would still see two Segments and throw `SegmentsOutOfSyncError`.
    // `readEdit` is the real path a body edit takes, so it also carries the envelope
    // `reconcileEnvelope` derives from the new Segment, the same as the commit pipeline sees it.
    const bodyEdit = readEdit(
      { segments: [{ start: '2026-01-01', end: '2026-01-10' }] },
      context,
      entry,
      registry,
    );
    const effective = buildEffectiveEntries(committed, [], [], new Map([[id!, bodyEdit]]));

    // The body's edit leaves exactly one Segment, so this pairs the envelope onto it the same way
    // `reconcileEnvelope` already does for `entries.update()` (a resize, not a translate) — reconciling
    // against the stale, still-two-Segment `committed` state would instead have refused this write
    // with `SegmentsOutOfSyncError('ambiguous')`.
    const extenderEdits = new Map([[id!, { start: utc('2026-02-01T00:00:00Z') } as StoredEdit]]);
    const reconciled = reconcileExtenderEdits(effective, extenderEdits);

    const reconciledEdit = reconciled.get(id!)!;
    expect(reconciledEdit.segments).toHaveLength(1);
    expect(reconciledEdit.start).toBe(utc('2026-02-01T00:00:00Z'));
    expect(reconciledEdit.end).toBe(entry.end);
  });

  it('refuses an envelope-only cascade against a body-split Segment (1→2), not the stale one-Segment committed state', () => {
    const context2 = createContext();
    const [single] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context2,
    );
    const committed = new Map([[single!.id, single!]]);
    // The body's own edit splits the one Segment into two — reconciling against `committed` alone
    // would still see one Segment and pair the envelope onto it directly, silently succeeding on the
    // wrong Segment count instead of catching that this write is now ambiguous.
    const bodyEdit = readEdit(
      {
        segments: [
          { start: '2026-01-01', end: '2026-01-02' },
          { start: '2026-01-03', end: '2026-01-05' },
        ],
      },
      context2,
      single!,
      registry,
    );
    const effective = buildEffectiveEntries(committed, [], [], new Map([[single!.id, bodyEdit]]));
    const [effectiveEntry] = effective.values();

    const extenderEdits = new Map([[single!.id, { start: addMs(effectiveEntry!.start, 5) }]]);

    expect(() => reconcileExtenderEdits(effective, extenderEdits)).toThrow(SegmentsOutOfSyncError);
  });
});

describe('fitSegmentsToEnvelope (#212 R2 fix-plan review, finding B1)', () => {
  it('clamps a Segment that overruns the new span, then widens whichever Segment still misses an edge', () => {
    const segments = [
      { id: segmentId('a'), start: instant(-10), end: instant(5) },
      { id: segmentId('b'), start: instant(8), end: instant(12) },
    ];
    const fitted = fitSegmentsToEnvelope(segments, { start: instant(0), end: instant(20) });
    expect(fitted).toEqual([
      { id: segmentId('a'), start: instant(0), end: instant(5) },
      { id: segmentId('b'), start: instant(8), end: instant(20) },
    ]);
  });

  it('returns the same array reference when every Segment already fits', () => {
    const segments = [{ id: segmentId('a'), start: instant(0), end: instant(10) }];
    expect(fitSegmentsToEnvelope(segments, { start: instant(0), end: instant(10) })).toBe(segments);
  });
});

// #212 R2 fix-plan review, unified at D-S5-44: a caller-identity split — a computed answer for the
// `EditExtender` seam, a refusal for `entries.update()` — was tried and rejected.
// `reconcileExtenderEdits` now calls `reconcileEnvelope` for every edit, so a plugin's cascade owes
// the same envelope invariant a consumer's edit does, refusal included: no looser door onto
// `start`/`end` for one caller than the other.
describe('reconcileExtenderEdits refuses what reconcileEnvelope refuses (D-S5-44)', () => {
  it('refuses a several-Segment envelope-only write naming only start, same as entries.update()', () => {
    const context = createContext();
    const [entry] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-01-01',
          end: '2026-01-10',
          segments: [
            { start: '2026-01-01', end: '2026-01-05' },
            { start: '2026-01-06', end: '2026-01-10' },
          ],
        },
      ],
      context,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-02-01T00:00:00Z'));

    expect(() => reconcileExtenderEdits(entries, new Map([[entry!.id, { start: newStart }]]))).toThrow(
      SegmentsOutOfSyncError,
    );
  });

  it('refuses a several-Segment envelope-only write naming both start and end', () => {
    const context = createContext();
    const [entry] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-01-01',
          end: '2026-01-10',
          segments: [
            { start: '2026-01-01', end: '2026-01-05' },
            { start: '2026-01-06', end: '2026-01-10' },
          ],
        },
      ],
      context,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-01-03T00:00:00Z'));
    const newEnd = instant(utc('2026-01-04T00:00:00Z'));

    expect(() =>
      reconcileExtenderEdits(entries, new Map([[entry!.id, { start: newStart, end: newEnd }]])),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('refuses an inverted envelope too — nothing about it makes a several-Segment write computable', () => {
    const context = createContext();
    const [entry] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-01-01',
          end: '2026-01-13',
          segments: [
            { start: '2026-01-01', end: '2026-01-04' },
            { start: '2026-01-04', end: '2026-01-12' },
            { start: '2026-01-12', end: '2026-01-13' },
          ],
        },
      ],
      context,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const inverted = new Map([
      [entry!.id, { start: instant(utc('2026-01-10T00:00:00Z')), end: instant(utc('2026-01-05T00:00:00Z')) }],
    ]);

    expect(() => reconcileExtenderEdits(entries, inverted)).toThrow(SegmentsOutOfSyncError);
  });

  it('still pairs the envelope onto the one Segment of a sole-Segment Entry, same as reconcileEnvelope', () => {
    const context = createContext();
    const [entry] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-01-02T00:00:00Z'));

    const reconciled = reconcileExtenderEdits(entries, new Map([[entry!.id, { start: newStart }]]));
    const edit = reconciled.get(entry!.id)!;

    expect(edit.segments).toHaveLength(1);
    expect(edit.segments![0]!.id).toBe(entry!.segments[0]!.id);
    expect(edit.start).toBe(newStart);
  });
});
