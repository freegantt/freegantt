// Moved verbatim from api/entry-input.ts (D-S2-2): construction and `entries.add()` must read an
// `EntryInput` the same way, and the one place that happens is inside the store now.
//
// This file maps fields and nothing else. Every date decision — resolving a Plain time through the
// zone, and what a date-only `end` means against half-open storage — belongs to `time/input.ts`
// (I10); anything resembling date math here is a bug.

import {
  entryId,
  DuplicateSegmentIdError,
  EmptySegmentsError,
  InvalidInstantError,
  SegmentsOutOfSyncError,
  segmentId,
} from '../model/index.js';
import type {
  DateOnlyEndRule,
  Entry,
  EntryEdit,
  EntryInput,
  EntryKind,
  Instant,
  Segment,
  SegmentId,
  SegmentInput,
  TimeSpan,
} from '../model/index.js';
import { envelopeOfSegments, toEndInstant, toInstant } from '../time/index.js';
import type { StoredEdit } from './edit-extension.js';
import { withProposedKeys, writeDeclaredMetaFields } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

/** The Dataset context every entry is read against: one zone, one end rule, for the whole list, plus
 * what the Rollup needs to fill in a roll-up-kind entry's initial span (S2.3 §1.5). */
export interface EntryReadContext {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  /** The one `Date.now()` read the owning Dataset performed — used as a deriving-kind entry's
   * zero-length span until the rollup gives it a real one (CONTEXT.md, Reference date). */
  referenceDate: Instant;
  /** Kinds whose rolling-up Fields the Rollup derives from children (`01` §2.5, default `['group']`)
   * — an entry of one of these kinds may omit `start`/`end`. */
  rollUpKinds: ReadonlySet<EntryKind>;
  /** Call: `context.mintSegmentId()` — the id a Segment nobody named gets, from the owning Dataset's
   * own counter (I2, #212). */
  mintSegmentId(): SegmentId;
}

/** `existing` is the Segment presently at this position, when `entries.update` is moving one it
 *  already drew (S2.3 §1.1, #212). An input that names no `id` keeps `existing`'s id — a move, not a
 *  replacement — and mints only when there is no Segment at that position to keep the id of. */
function readSegment(input: SegmentInput, context: EntryReadContext, existing?: Segment): Segment {
  return {
    id: input.id === undefined ? (existing?.id ?? context.mintSegmentId()) : segmentId(input.id),
    start: toInstant(context.timeZone, input.start),
    end: toEndInstant(context.timeZone, input.end, context.dateOnlyEnd),
  };
}

/** Every stored Entry has at least one Segment (#212), so nothing downstream carries a "this one
 * draws no Segment" branch. An Entry that named none stores its own envelope as its one Segment. */
function readSegments(input: EntryInput, span: TimeSpan, context: EntryReadContext): readonly Segment[] {
  if (input.segments === undefined || input.segments.length === 0) {
    return [{ id: context.mintSegmentId(), start: span.start, end: span.end }];
  }
  return input.segments.map((segment) => readSegment(segment, context));
}

/** The one Segment an Entry draws, or `undefined` when it draws several — the question
 * `segments-out-of-sync` and a plain `start` edit both ask (#212). */
function soleSegmentOf(entry: Entry): Segment | undefined {
  return entry.segments.length === 1 ? entry.segments[0] : undefined;
}

/** Optional fields are copied only when present: `exactOptionalPropertyTypes` makes an explicit
 * `undefined` a different thing from an absent key, and an `Entry` must not gain keys its input
 * never had. Exported for `entries.add()` (S2.3 §1.1), which reads one input the same way
 * construction reads every entry in `entries: EntryInput[]` — one function, both call sites.
 *
 * `start`/`end` are read from the Segments, not from `input.start`/`input.end` directly (#212,
 * finding 4): an Entry that names Segments overrunning its own authored span used to keep that
 * stale span forever, because ingest was not one of the places that computed the envelope.
 * `envelopeOfSegments` is the one function every write path — this one included — calls instead. */
export function readEntry(input: EntryInput, context: EntryReadContext): Entry {
  const kind = input.kind ?? 'span';
  const span = readEntrySpan(input, kind, context);
  const segments = readSegments(input, span, context);
  const envelope = envelopeOfSegments(segments);
  const entry: Entry = {
    id: entryId(input.id),
    name: input.name,
    start: envelope.start,
    end: envelope.end,
    kind,
    segments,
  };
  if (input.parentId !== undefined) entry.parentId = entryId(input.parentId);
  if (input.meta !== undefined) entry.meta = input.meta;
  return entry;
}

/** `start`/`end` are both required unless `kind` derives its span (S2.3 §1.5): a deriving-kind entry
 * that omits both gets a zero-length span at the reference date, which the rollup overwrites on the
 * first commit that gives it children. Omitting only one, on any kind, is `InvalidInstantError` — a
 * half-specified span is not a span the rollup or a non-deriving kind can make sense of. */
function readEntrySpan(input: EntryInput, kind: EntryKind, context: EntryReadContext): TimeSpan {
  if (input.start === undefined && input.end === undefined) {
    if (context.rollUpKinds.has(kind)) {
      return { start: context.referenceDate, end: context.referenceDate };
    }
    throw new InvalidInstantError(
      `entries: "${input.id}" has kind "${kind}", which does not derive its span — start and end are required`,
    );
  }
  if (input.start === undefined || input.end === undefined) {
    throw new InvalidInstantError(`entries: "${input.id}" must set both start and end, or neither`);
  }
  return {
    start: toInstant(context.timeZone, input.start),
    end: toEndInstant(context.timeZone, input.end, context.dateOnlyEnd),
  };
}

/** Every `SegmentId` a consumer named explicitly, anywhere in a construction-time `entries:
 *  EntryInput[]` list — read before any Segment mints (#212). `DatasetState` reserves these first, so
 *  an id ingest mints for one Entry never lands on an id another Entry in the same list authored. */
export function authoredSegmentIdsOf(inputs: readonly EntryInput[]): ReadonlySet<SegmentId> {
  const ids = new Set<SegmentId>();
  for (const input of inputs) {
    for (const segment of input.segments ?? []) {
      if (segment.id !== undefined) ids.add(segmentId(segment.id));
    }
  }
  return ids;
}

/** No two Segments in a construction-time `entries: EntryInput[]` list share one `SegmentId` — the
 *  same rule `entries.add`/`entries.update` enforce against the live store (#212, ADR 0010). Checked
 *  once over the whole list, so an authored duplicate never reaches the store in the first place. */
function assertNoDuplicateSegmentIds(entries: readonly Entry[]): void {
  const seen = new Set<SegmentId>();
  for (const entry of entries) {
    for (const segment of entry.segments) {
      if (seen.has(segment.id)) throw new DuplicateSegmentIdError(segment.id, 'construction');
      seen.add(segment.id);
    }
  }
}

export function readEntries(inputs: readonly EntryInput[], context: EntryReadContext): readonly Entry[] {
  const entries = inputs.map((input) => readEntry(input, context));
  assertNoDuplicateSegmentIds(entries);
  return entries;
}

/** Reads an `entries.update()` edit into `StoredEdit` (S2.3 §1.1) — every present core date field
 * goes through `time/` the way `readEntry` reads a whole `Entry`. Declared Field keys fold through
 * `writeField` so the write set stays entry-shaped (D-S4-2). An update may set `start` without `end`. */
export function readEdit(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: Entry,
  registry: FieldRegistry,
): StoredEdit {
  let stored: StoredEdit = {};
  // Which Fields this edit writes. The caller's own keys start the set, and a Field core
  // derives below joins it. A key nobody states never reaches the changeset (#212).
  const proposed = new Set<string>(Object.keys(edit));
  if (edit.parentId !== undefined) stored.parentId = entryId(edit.parentId);
  if (edit.kind !== undefined) stored.kind = edit.kind;
  if (edit.name !== undefined) stored.name = edit.name;
  const writesEnvelope = edit.start !== undefined || edit.end !== undefined;
  const sole = soleSegmentOf(entry);
  // Every Entry stores Segments now (#212), so the refusal narrows to the case that still has no
  // answer: several Segments and an envelope write naming none of them says nothing about which
  // stretch moved. One Segment is the envelope's own drawing, and moves with it below.
  if (writesEnvelope && edit.segments === undefined && sole === undefined) {
    throw new SegmentsOutOfSyncError(entry.id, 'ambiguous');
  }
  if (edit.start !== undefined) stored.start = toInstant(context.timeZone, edit.start);
  if (edit.end !== undefined) stored.end = toEndInstant(context.timeZone, edit.end, context.dateOnlyEnd);
  if (edit.segments !== undefined) {
    // Every stored Entry keeps at least one Segment (#212); an update cannot write it down to zero
    // the way `entries.add({ segments: [] })` can mint one — there is no whole-span input here to
    // mint it from, only the Segment ids already on the Entry, which this write would silently drop.
    if (edit.segments.length === 0) throw new EmptySegmentsError(entry.id);
    // Positional match (#212): the Segment at index `i` that names no `id` of its own keeps the id
    // of the Entry's current Segment at that index — this is how `dataset.entries.update(id, {
    // segments })` moves a Segment, per `CONTEXT.md`. An index beyond the Entry's current count has
    // no counterpart to keep, so it mints a fresh id, the same as an added Segment on `entries.add`.
    stored.segments = edit.segments.map((segment, index) =>
      readSegment(segment, context, entry.segments[index]),
    );
  } else if (writesEnvelope && sole !== undefined) {
    // The bar a one-Segment Entry draws is its envelope, so both move or the bar stays where the
    // envelope no longer is. The Segment keeps its id: this is the same stretch, moved.
    stored.segments = [{ id: sole.id, start: stored.start ?? entry.start, end: stored.end ?? entry.end }];
    proposed.add('segments');
  }
  // The envelope has one owner (#212, finding 4, `plans/01` §6): whenever this edit changes
  // `segments`, `start`/`end` are read back off the result. A plain `update(id, { segments })`,
  // naming no `start`/`end` at all, used to leave the Entry's own span stale against its new
  // Segments — reading it back here is what stops that. When the caller named `start`/`end` *and*
  // `segments` in the same edit and the two disagree, that is not this silent case: the edit
  // contradicts itself, and `SegmentsOutOfSyncError('conflicting')` refuses it rather than picking a
  // winner (finding S3) — the reverse derivation above can never disagree with itself, so it never
  // throws here. Marked proposed the same way the reverse derivation above already marks `segments`:
  // neither is policy, so both sides of the pair count as stated.
  if (stored.segments !== undefined) {
    const envelope = envelopeOfSegments(stored.segments);
    if (edit.segments !== undefined) {
      if (edit.start !== undefined && stored.start !== envelope.start) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting');
      }
      if (edit.end !== undefined && stored.end !== envelope.end) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting');
      }
    }
    stored.start = envelope.start;
    stored.end = envelope.end;
    proposed.add('start');
    proposed.add('end');
  }
  if (edit.meta !== undefined) stored.meta = edit.meta;

  stored = writeDeclaredMetaFields(stored, entry, edit, registry);
  return withProposedKeys(stored, proposed);
}
