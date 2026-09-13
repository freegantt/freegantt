import { describe, expect, it } from 'vitest';
import {
  fitSegmentsToEnvelope,
  moveEntryTo,
  reconcileExtenderEdits,
  reconcileExtenderEditsForPreview,
  toEditReading,
  toEntries,
} from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { buildEffectiveEntries } from './entry-tree.js';
import {
  entryId,
  EmptySegmentsError,
  InvertedSpanError,
  segmentId,
  SegmentsOutOfSyncError,
} from '../model/index.js';
import type { StoredEntry, EntryEdit, EntryInput } from '../model/index.js';
import { addMs, instant, toInstant } from '../time/index.js';
import { mergeEntryEdits } from './edit-extension.js';
import type { ProposedEdit } from './edit-extension.js';
import { FieldRegistry } from './fields/field-registry.js';

const registry = new FieldRegistry({ fields: [] });

const utc = (iso: string): number => Date.parse(iso);

// Each test gets its own counter, so no test can see another test's minted ids (I2).
function createContext(): EntryReadContext {
  let mintedCount = 0;
  return {
    timeZone: 'UTC',
    dateOnlyEnd: 'inclusive' as const,
    mintSegmentId: () => segmentId(`minted-${++mintedCount}`),
  };
}

// F18 (2026-09-11 branch review): production reads `toEditReading(...).stored` directly now — this
// test-only wrapper is the one place that still names the whole read by its old, single-job name, so
// every existing assertion below keeps reading `toProposedEdit(edit, ...)` rather than unwrapping at
// each of its ~25 call sites.
function toProposedEdit(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: StoredEntry,
  registry: FieldRegistry,
  operation: string,
): ProposedEdit {
  return toEditReading(edit, context, entry, registry, operation).stored;
}

describe('toEntries', () => {
  it('brands a plain string id and reads a date-only end inclusively', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.start).toBe(utc('2026-09-01T00:00:00Z'));
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(entry?.end).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('leaves an optional field absent when the input never had it (ADR 0013: no stored kind)', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = toEntries([input], createContext(), registry);
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ['end', 'id', 'name', 'props', 'segments', 'start'].sort(),
    );
  });

  it('fills one segment over the full span when the input names none', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.segments).toHaveLength(1);
    expect(entry?.segments[0]?.id).toBe(segmentId('minted-1'));
  });

  it('carries parentId, segments and props through when present', () => {
    const input: EntryInput = {
      id: 'child',
      parentId: 'root',
      name: 'Review',
      start: '2026-09-01',
      end: '2026-09-01',
      segments: [{ start: '2026-09-01', end: '2026-09-02' }],
      props: { team: 'A' },
    };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.parentId).toBe(entryId('root'));
    expect(entry?.segments).toEqual([
      {
        id: segmentId('minted-1'),
        start: utc('2026-09-01T00:00:00Z'),
        end: utc('2026-09-03T00:00:00Z'),
      },
    ]);
    expect(entry?.props).toEqual({ team: 'A' });
  });

  it('keeps an authored segment id unchanged through ingest', () => {
    const input: EntryInput = {
      id: 'seg',
      name: 'Seg',
      start: '2026-09-01',
      end: '2026-09-05',
      segments: [{ id: 'authored-seg', start: '2026-09-01', end: '2026-09-05' }],
    };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.segments[0]?.id).toBe(segmentId('authored-seg'));
  });

  // 2026-09-06 ruling, #143: an inverted span is refused at ingest, not stored and rendered honestly.
  it('refuses a construction-time entry whose end sits before its start', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-08', end: '2026-09-01' };
    expect(() => toEntries([input], createContext(), registry)).toThrow(InvertedSpanError);
  });

  it('refuses a construction-time entry whose named segment is inverted', () => {
    const input: EntryInput = {
      id: 'seg',
      name: 'Seg',
      start: '2026-09-01',
      end: '2026-09-05',
      segments: [{ start: '2026-09-05', end: '2026-09-01' }],
    };
    expect(() => toEntries([input], createContext(), registry)).toThrow(InvertedSpanError);
  });

  // The zero-length span stays legal (D-S3-4, #212's rollUpKinds default) — this is the regression
  // guard the reject ruling names alongside the refusal itself. A full timestamp, not a date-only
  // string, keeps `toEndInstant`'s inclusive rule from bumping `end` forward a day.
  it('still accepts a zero-length construction-time entry', () => {
    const input: EntryInput = {
      id: 't1',
      name: 'Milestone',
      start: '2026-09-01T09:00:00Z',
      end: '2026-09-01T09:00:00Z',
    };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.start).toBe(entry?.end);
  });
});

describe('toProposedEdit (S4.10, D-S4-30)', () => {
  it('throws SegmentsOutOfSyncError when start/end are written without segments on a two-segment entry', () => {
    const context = createContext();
    const [segmented] = toEntries(
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
      registry,
    );
    expect(() =>
      toProposedEdit({ start: '2026-09-02' }, context, segmented!, registry, 'entries.update'),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('moves the lone segment with the envelope on a one-segment entry', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    const edit = toProposedEdit({ start: '2026-09-02' }, context, single!, registry, 'entries.update');
    expect(edit.start).toBe(utc('2026-09-02T00:00:00Z'));
    expect(edit.segments).toHaveLength(1);
  });

  // 2026-09-06 ruling, #143: `update(id, { start })` on a one-Segment entry used to store an
  // inverted span silently, through the sole-Segment pairing in `reconcileEnvelope`.
  it('refuses update(id, { start }) when the new start would end before the entry ends', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    expect(() =>
      toProposedEdit({ start: '2026-09-10' }, context, single!, registry, 'entries.update'),
    ).toThrow(InvertedSpanError);
  });

  it('refuses update(id, { end }) when the new end would sit before the entry starts', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-05', end: '2026-09-10' }],
      context,
      registry,
    );
    expect(() => toProposedEdit({ end: '2026-09-01' }, context, single!, registry, 'entries.update')).toThrow(
      InvertedSpanError,
    );
  });

  it('refuses update(id, { segments }) naming a Segment whose end sits before its start', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    expect(() =>
      toProposedEdit(
        { segments: [{ start: '2026-09-05', end: '2026-09-01' }] },
        context,
        single!,
        registry,
        'entries.update',
      ),
    ).toThrow(InvertedSpanError);
  });

  // The zero-length write stays legal (D-S3-4) — the regression guard the reject ruling names
  // alongside the refusal itself, so a resize gesture's own clamp keeps working (#143).
  it('still accepts update(id, { end }) writing a zero-length span', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01T09:00:00Z', end: '2026-09-05T09:00:00Z' }],
      context,
      registry,
    );
    const edit = toProposedEdit(
      { end: '2026-09-01T09:00:00Z' },
      context,
      single!,
      registry,
      'entries.update',
    );
    expect(edit.start).toBe(edit.end);
  });

  // #212 fix-plan review, finding S2: `update(id, { segments: [] })` used to reach `time/`'s
  // internal "no Segments" assertion as a bare `Error`, with no `code` and no `FreeGanttError`.
  it('throws a typed EmptySegmentsError, not a bare Error, when segments is written empty', () => {
    const context = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    let caught: unknown;
    try {
      toProposedEdit({ segments: [] }, context, single!, registry, 'entries.update');
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
    const [entry] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    expect(() =>
      toProposedEdit(
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
        'entries.update',
      ),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('derives start/end from segments silently when the caller names neither', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    const edit = toProposedEdit(
      {
        segments: [
          { start: 0, end: 10 },
          { start: 10, end: 20 },
        ],
      },
      context,
      entry!,
      registry,
      'entries.update',
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

  function committedSegmentedEntry(): ReadonlyMap<ReturnType<typeof entryId>, StoredEntry> {
    const [entry] = toEntries(
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
      registry,
    );
    return new Map([[entry!.id, entry!]]);
  }

  it('translates the body-widened Segment (2→1), not the stale two-Segment committed state', () => {
    const committed = committedSegmentedEntry();
    const [id] = committed.keys();
    const entry = committed.get(id!)!;
    // The body's own edit collapses the two Segments to one spanning the whole entry — reconciling
    // against `committed` alone would still see two Segments and throw `SegmentsOutOfSyncError`.
    // `toProposedEdit` is the real path a body edit takes, so it also carries the envelope
    // `reconcileEnvelope` derives from the new Segment, the same as the commit pipeline sees it.
    const bodyEdit = toProposedEdit(
      { segments: [{ start: '2026-01-01', end: '2026-01-10' }] },
      context,
      entry,
      registry,
      'entries.update',
    );
    const effective = buildEffectiveEntries(committed, [], [], new Map([[id!, bodyEdit]]));

    // The body's edit leaves exactly one Segment, so this pairs the envelope onto it the same way
    // `reconcileEnvelope` already does for `entries.update()` (a resize, not a translate) — reconciling
    // against the stale, still-two-Segment `committed` state would instead have refused this write
    // with `SegmentsOutOfSyncError('ambiguous')`.
    // Stays short of the entry's own end (2026-01-11) — moving start past it would be an inverted
    // span the #143 ruling refuses, which is not what this test is about.
    const extenderEdits = new Map([[id!, { start: utc('2026-01-08T00:00:00Z') } as ProposedEdit]]);
    const reconciled = reconcileExtenderEdits(effective, extenderEdits);

    const reconciledEdit = reconciled.get(id!)!;
    expect(reconciledEdit.segments).toHaveLength(1);
    expect(reconciledEdit.start).toBe(utc('2026-01-08T00:00:00Z'));
    expect(reconciledEdit.end).toBe(entry.end);
  });

  it('refuses an envelope-only cascade against a body-split Segment (1→2), not the stale one-Segment committed state', () => {
    const context2 = createContext();
    const [single] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context2,
      registry,
    );
    const committed = new Map([[single!.id, single!]]);
    // The body's own edit splits the one Segment into two — reconciling against `committed` alone
    // would still see one Segment and pair the envelope onto it directly, silently succeeding on the
    // wrong Segment count instead of catching that this write is now ambiguous.
    const bodyEdit = toProposedEdit(
      {
        segments: [
          { start: '2026-01-01', end: '2026-01-02' },
          { start: '2026-01-03', end: '2026-01-05' },
        ],
      },
      context2,
      single!,
      registry,
      'entries.update',
    );
    const effective = buildEffectiveEntries(committed, [], [], new Map([[single!.id, bodyEdit]]));
    const [effectiveEntry] = effective.values();

    const extenderEdits = new Map([
      [single!.id, { start: addMs(effectiveEntry!.start!, 5) } as ProposedEdit],
    ]);

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
    const [entry] = toEntries(
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
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-02-01T00:00:00Z'));

    expect(() =>
      reconcileExtenderEdits(entries, new Map([[entry!.id, { start: newStart } as ProposedEdit]])),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('refuses a several-Segment envelope-only write naming both start and end', () => {
    const context = createContext();
    const [entry] = toEntries(
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
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-01-03T00:00:00Z'));
    const newEnd = instant(utc('2026-01-04T00:00:00Z'));

    expect(() =>
      reconcileExtenderEdits(
        entries,
        new Map([[entry!.id, { start: newStart, end: newEnd } as ProposedEdit]]),
      ),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('refuses an inverted envelope too — nothing about it makes a several-Segment write computable', () => {
    const context = createContext();
    const [entry] = toEntries(
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
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const inverted = new Map([
      [
        entry!.id,
        {
          start: instant(utc('2026-01-10T00:00:00Z')),
          end: instant(utc('2026-01-05T00:00:00Z')),
        } as ProposedEdit,
      ],
    ]);

    expect(() => reconcileExtenderEdits(entries, inverted)).toThrow(SegmentsOutOfSyncError);
  });

  it('still pairs the envelope onto the one Segment of a sole-Segment Entry, same as reconcileEnvelope', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const newStart = instant(utc('2026-01-02T00:00:00Z'));

    const reconciled = reconcileExtenderEdits(
      entries,
      new Map([[entry!.id, { start: newStart } as ProposedEdit]]),
    );
    const edit = reconciled.get(entry!.id)!;

    expect(edit.segments).toHaveLength(1);
    expect(edit.segments![0]!.id).toBe(entry!.segments[0]!.id);
    expect(edit.start).toBe(newStart);
  });

  // 2026-09-06 ruling, #143: an `EditExtender` cascade against a sole-Segment entry pairs the same
  // way `entries.update()` does, so it is refused the same way too — not only the several-Segment
  // case above.
  it('refuses an inverted cascade against a sole-Segment Entry, same as an inverted entries.update()', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const invertingStart = instant(utc('2026-01-10T00:00:00Z'));

    expect(() =>
      reconcileExtenderEdits(entries, new Map([[entry!.id, { start: invertingStart } as ProposedEdit]])),
    ).toThrow(InvertedSpanError);
  });

  // #258: `reconcileExtenderEditsForPreview` calls the same `reconcileExtenderEditsWith` loop as
  // `reconcileExtenderEdits` above, on the pipeline's own rAF callback (`view/gesture-pipeline.ts`'s
  // `#extraFor`), which has no `catch` of its own. `InvertedSpanError` reached that loop's `catch`
  // one refusal type after this drop was written (`#143`, 27 minutes after `#240`), and nothing here
  // widened it — a cascade proposing an inverted span rethrew straight out of the rAF callback,
  // breaking the drag mid-gesture with the user's own edit lost alongside it. Both assertions read
  // the same input through the one seam (`isEnvelopeRefusal`): the commit path still raises, and the
  // preview path now drops instead of crashing.
  it('#258: the preview path drops an inverted cascade the commit path still throws for', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entries = new Map([[entry!.id, entry!]]);
    const invertingStart = instant(utc('2026-01-10T00:00:00Z'));
    const inverted = new Map([[entry!.id, { start: invertingStart } as ProposedEdit]]);

    expect(() => reconcileExtenderEdits(entries, inverted)).toThrow(InvertedSpanError);
    expect(() => reconcileExtenderEditsForPreview(entries, inverted)).not.toThrow();
    expect(reconcileExtenderEditsForPreview(entries, inverted).has(entry!.id)).toBe(false);
  });
});

describe('moveEntryTo writes segments and lets core derive the envelope (D-S5-50, #239)', () => {
  /** Two Segments. A date-only `end` is inclusive here, so they store as `[01-01, 01-06)` and
   *  `[01-06, 01-11)`, and the Entry's envelope is `[01-01, 01-11)`. */
  function twoSegmentEntry(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [
        {
          id: 't1',
          name: 'Design',
          start: '2026-01-01',
          end: '2026-01-09',
          segments: [
            { start: '2026-01-01', end: '2026-01-05' },
            { start: '2026-01-06', end: '2026-01-10' },
          ],
        },
      ],
      context,
      registry,
    );
    return entry!;
  }

  it('names segments and nothing else', () => {
    const entry = twoSegmentEntry(createContext());
    const edit = moveEntryTo(entry, instant(utc('2026-01-03T00:00:00Z')));
    expect(Object.keys(edit)).toEqual(['segments']);
  });

  it('translates every Segment rigidly, each keeping its own id and its own length', () => {
    const context = createContext();
    const entry = twoSegmentEntry(context);
    const edit = moveEntryTo(entry, instant(utc('2026-01-03T00:00:00Z')));

    expect(edit.segments).toEqual([
      { id: entry.segments[0]!.id, start: utc('2026-01-03T00:00:00Z'), end: utc('2026-01-08T00:00:00Z') },
      { id: entry.segments[1]!.id, start: utc('2026-01-08T00:00:00Z'), end: utc('2026-01-13T00:00:00Z') },
    ]);
  });

  it('takes an Instant, so a caller holding a loose date reads it through the zone first', () => {
    const context = createContext();
    const entry = twoSegmentEntry(context);
    // The zone stays the caller's to apply, because `moveEntryTo` builds an edit and is not a way in
    // (D-S5-50). 'America/New_York' puts the start of 2026-01-03 five hours after the UTC one, and
    // the whole Entry moves by that much more.
    const edit = moveEntryTo(entry, toInstant('America/New_York', '2026-01-03'));

    expect(edit.segments?.[0]?.start).toBe(utc('2026-01-03T05:00:00Z'));
  });

  // Q5: this call site read `entry.start as Instant` until the span invariant got one home. The
  // cast produced a `NaN` delta, and the empty Segment list below swallowed it. `spansTime` now
  // asks the question, and this pins that the answer a caller sees did not move.
  it('names an empty segment list for a start-only Entry, which holds nothing to translate', () => {
    const context = createContext();
    const [startOnly] = toEntries([{ id: 'o1', name: 'Open', start: '2026-01-01' }], context, registry);

    const edit = moveEntryTo(startOnly!, instant(utc('2026-01-03T00:00:00Z')));

    expect(startOnly!.end).toBeUndefined();
    expect(edit).toEqual({ segments: [] });
  });

  it('lets toProposedEdit derive the envelope, so the stored edit still states start and end', () => {
    const context = createContext();
    const entry = twoSegmentEntry(context);
    const stored = toProposedEdit(
      moveEntryTo(entry, instant(utc('2026-01-03T00:00:00Z'))),
      context,
      entry,
      registry,
      'entries.update',
    );

    expect(stored.start).toBe(utc('2026-01-03T00:00:00Z'));
    expect(stored.end).toBe(utc('2026-01-13T00:00:00Z'));
  });

  // #239's premise, checked rather than trusted: the issue reads the refusal as reachable only
  // because `moveEntryTo` stated an envelope. It is not. `reconcileEnvelope` refuses on whether the
  // *merged* edit states `segments` at all, so a later plugin's `{ end }` is refused either way.
  it('still refuses a later plugin merging its own end over this move — before and after alike', () => {
    const context = createContext();
    const entry = twoSegmentEntry(context);
    const laterEnd = instant(utc('2026-02-01T00:00:00Z'));

    const afterTheChange = mergeEntryEdits(
      new Map([[entry.id, moveEntryTo(entry, instant(utc('2026-01-03T00:00:00Z')))]]),
      new Map([[entry.id, { end: laterEnd }]]),
    );
    expect(() =>
      toProposedEdit(afterTheChange.get(entry.id)!, context, entry, registry, 'entries.update'),
    ).toThrow(SegmentsOutOfSyncError);

    // The shape `moveEntryTo` used to return, merged the same way: the same refusal.
    const beforeTheChange = mergeEntryEdits(
      new Map([
        [
          entry.id,
          {
            segments: [{ id: 's1', start: utc('2026-01-03T00:00:00Z'), end: utc('2026-01-07T00:00:00Z') }],
            start: utc('2026-01-03T00:00:00Z'),
            end: utc('2026-01-07T00:00:00Z'),
          },
        ],
      ]),
      new Map([[entry.id, { end: laterEnd }]]),
    );
    expect(() =>
      toProposedEdit(beforeTheChange.get(entry.id)!, context, entry, registry, 'entries.update'),
    ).toThrow(SegmentsOutOfSyncError);
  });

  // What the change actually buys. `ExtenderWrapper`'s own idiom composes this move *over* the
  // occupant it wraps — `mergeEntryEdits(next(request), mine(request))` — so the earlier plugin's
  // write is the base. A stated envelope overwrote it and left a self-consistent edit, which
  // committed with that write gone; naming `segments` alone makes it a refusal (#238's defect class).
  it('turns a silent overwrite of an earlier plugin’s end into a refusal', () => {
    const context = createContext();
    const entry = twoSegmentEntry(context);
    const earlierPlugin = new Map([[entry.id, { end: instant(utc('2026-02-01T00:00:00Z')) }]]);

    // What used to happen: the envelope `moveEntryTo` stated won, and nothing said so.
    const withStatedEnvelope = mergeEntryEdits(
      earlierPlugin,
      new Map([
        [
          entry.id,
          {
            segments: [{ id: 's1', start: utc('2026-01-03T00:00:00Z'), end: utc('2026-01-07T00:00:00Z') }],
            start: utc('2026-01-03T00:00:00Z'),
            end: utc('2026-01-07T00:00:00Z'),
          },
        ],
      ]),
    );
    const lost = toProposedEdit(
      withStatedEnvelope.get(entry.id)!,
      context,
      entry,
      registry,
      'entries.update',
    );
    expect(lost.end).toBe(utc('2026-01-07T00:00:00Z'));
    expect(lost.end).not.toBe(utc('2026-02-01T00:00:00Z'));

    // What happens now: the earlier plugin's `end` survives the merge, disagrees with the Segments,
    // and is refused rather than dropped.
    const refused = mergeEntryEdits(
      earlierPlugin,
      new Map([[entry.id, moveEntryTo(entry, instant(utc('2026-01-03T00:00:00Z')))]]),
    );
    expect(refused.get(entry.id)!.end).toBe(utc('2026-02-01T00:00:00Z'));
    expect(() => toProposedEdit(refused.get(entry.id)!, context, entry, registry, 'entries.update')).toThrow(
      SegmentsOutOfSyncError,
    );
  });
});

// #237 / s5-231 review F4. The error used to take a bare string, and the string was wrong four ways:
// it named `entries.update` to a cascade that never called it, it named the Entry while iterating
// Segments, it could report an id minted a line earlier, and it exposed nothing to catch on.
describe('InvertedSpanError names the caller, the ids the consumer wrote, and both instants', () => {
  function invertedSpanErrorFrom(run: () => unknown): InvertedSpanError {
    try {
      run();
    } catch (error) {
      if (error instanceof InvertedSpanError) return error;
      throw error;
    }
    throw new Error('expected an InvertedSpanError');
  }

  it('names the entry the consumer wrote, not only the segment id ingest minted', () => {
    const error = invertedSpanErrorFrom(() =>
      toEntries(
        [
          {
            id: 't1',
            name: 'Design',
            start: '2026-01-01',
            end: '2026-01-10',
            segments: [
              { start: instant(utc('2026-01-09T00:00:00Z')), end: instant(utc('2026-01-02T00:00:00Z')) },
            ],
          },
        ],
        createContext(),
        registry,
      ),
    );

    expect(error.entryId).toBe(entryId('t1'));
    expect(error.message).toContain('"t1"');
    // The Segment named no id, so its id was minted a line earlier. It is still reported — the
    // Entry id is what makes the message searchable.
    expect(error.segmentId).toBe(segmentId('minted-1'));
    expect(error.span).toEqual({
      start: utc('2026-01-09T00:00:00Z'),
      end: utc('2026-01-02T00:00:00Z'),
    });
    expect(error.message).toContain(String(utc('2026-01-09T00:00:00Z')));
    expect(error.message).toContain(String(utc('2026-01-02T00:00:00Z')));
  });

  it('names no segment when the entry, not a segment, carries the inverted span', () => {
    const error = invertedSpanErrorFrom(() =>
      toEntries(
        [{ id: 't1', name: 'Design', start: '2026-01-10', end: '2026-01-01' }],
        createContext(),
        registry,
      ),
    );

    expect(error.segmentId).toBeUndefined();
    expect(error.message).toContain('"t1"');
  });

  it('an unreadable date names the caller too, not toInstant (#237)', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );

    expect(() =>
      toEntries([{ id: 't2', name: 'Build', start: 'next tuesday', end: '2026-01-05' }], context, registry),
    ).toThrow('construction: "next tuesday" is not a date this library reads.');
    expect(() =>
      toProposedEdit({ start: 'next tuesday' }, context, entry!, registry, 'entries.update'),
    ).toThrow('entries.update: "next tuesday" is not a date this library reads.');
  });

  it('names entries.update for an update, and the edit extender for a cascade', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const inverting = { start: instant(utc('2026-06-01T00:00:00Z')) };

    const fromUpdate = invertedSpanErrorFrom(() =>
      toProposedEdit(inverting, context, entry!, registry, 'entries.update'),
    );
    expect(fromUpdate.operation).toBe('entries.update');

    const fromCascade = invertedSpanErrorFrom(() =>
      reconcileExtenderEdits(
        new Map([[entry!.id, entry!]]),
        new Map([[entry!.id, inverting as ProposedEdit]]),
      ),
    );
    expect(fromCascade.operation).toBe('edit extender');
    // The plugin author is not sent to a call they never made (#239).
    expect(fromCascade.message).not.toContain('entries.update');
  });

  // D-S5-46, and it is load-bearing: `gesture-draft.ts`'s resize clamp produces a zero-length span
  // as its own way of refusing an inversion (ADR 0012 does not touch this rule). Tidying `<` into
  // `<=` in `reconcileEnvelope` breaks that clamp.
  it('leaves a zero-length span legal', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const zeroLength = instant(entry!.start!);

    const stored = toProposedEdit({ end: zeroLength }, context, entry!, registry, 'entries.update');
    expect(stored.start).toBe(stored.end);
  });
});

describe('a refusal names the caller that reached it, not one door of two (#239, #237)', () => {
  function twoSegments(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [
        {
          id: 't1',
          name: 'Design',
          start: '2026-01-01',
          end: '2026-01-09',
          segments: [
            { start: '2026-01-01', end: '2026-01-05' },
            { start: '2026-01-06', end: '2026-01-10' },
          ],
        },
      ],
      context,
      registry,
    );
    return entry!;
  }

  it('names the edit extender when a cascade writes an ambiguous envelope', () => {
    const context = createContext();
    const entry = twoSegments(context);
    let thrown: SegmentsOutOfSyncError | undefined;
    try {
      reconcileExtenderEdits(
        new Map([[entry.id, entry]]),
        new Map([[entry.id, { start: instant(utc('2026-02-01T00:00:00Z')) } as ProposedEdit]]),
      );
    } catch (error) {
      thrown = error as SegmentsOutOfSyncError;
    }

    expect(thrown?.operation).toBe('edit extender');
    expect(thrown?.reason).toBe('ambiguous');
    expect(thrown?.message).not.toContain('entries.update');
  });

  it('names entries.update when the same refusal comes through an update', () => {
    const context = createContext();
    const entry = twoSegments(context);

    expect(() => toProposedEdit({ segments: [] }, context, entry, registry, 'entries.update')).toThrow(
      /^entries\.update: /,
    );
  });
});
