// Moved verbatim from api/entry-input.ts (D-S2-2): construction and `entries.add()` must read an
// `EntryInput` the same way, and the one place that happens is inside the store now.
//
// This file maps fields and nothing else. Every date decision — resolving a Plain time through the
// zone, and what a date-only `end` means against half-open storage — belongs to `time/input.ts`
// (I10); anything resembling date math here is a bug.

import { entryId, InvalidInstantError, SegmentsOutOfSyncError, segmentId } from '../model/index.js';
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
import { toEndInstant, toInstant } from '../time/index.js';
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

function readSegment(input: SegmentInput, context: EntryReadContext): Segment {
  return {
    id: input.id === undefined ? context.mintSegmentId() : segmentId(input.id),
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
 * construction reads every entry in `entries: EntryInput[]` — one function, both call sites. */
export function readEntry(input: EntryInput, context: EntryReadContext): Entry {
  const kind = input.kind ?? 'span';
  const span = readEntrySpan(input, kind, context);
  const entry: Entry = {
    id: entryId(input.id),
    name: input.name,
    start: span.start,
    end: span.end,
    kind,
    segments: readSegments(input, span, context),
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

export function readEntries(inputs: readonly EntryInput[], context: EntryReadContext): readonly Entry[] {
  return inputs.map((input) => readEntry(input, context));
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
    throw new SegmentsOutOfSyncError(entry.id);
  }
  if (edit.start !== undefined) stored.start = toInstant(context.timeZone, edit.start);
  if (edit.end !== undefined) stored.end = toEndInstant(context.timeZone, edit.end, context.dateOnlyEnd);
  if (edit.segments !== undefined) {
    stored.segments = edit.segments.map((segment) => readSegment(segment, context));
  } else if (writesEnvelope && sole !== undefined) {
    // The bar a one-Segment Entry draws is its envelope, so both move or the bar stays where the
    // envelope no longer is. The Segment keeps its id: this is the same stretch, moved.
    stored.segments = [{ id: sole.id, start: stored.start ?? entry.start, end: stored.end ?? entry.end }];
    proposed.add('segments');
  }
  if (edit.meta !== undefined) stored.meta = edit.meta;

  stored = writeDeclaredMetaFields(stored, entry, edit, registry);
  return withProposedKeys(stored, proposed);
}
