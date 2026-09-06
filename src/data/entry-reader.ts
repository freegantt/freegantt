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
  EntryId,
  EntryInput,
  EntryKind,
  Instant,
  Segment,
  SegmentId,
  SegmentInput,
  TimeSpan,
} from '../model/index.js';
import { addMs, diffMs, envelopeOfSegments, toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';
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

/** What `reconcileEnvelope` hands back: the reconciled edit, and which keys it wrote onto the edit
 *  itself — `segments` paired on, or `start`/`end` read back off Segments the edit already named.
 *  `readEdit` reports these keys to its own `proposed` set (#212 R2 fix-plan review, finding D): the
 *  caller of `reconcileEnvelope` is told what changed, instead of diffing `Object.keys` before and
 *  after to find out. */
export interface EnvelopeReconciliation {
  readonly edit: StoredEdit;
  readonly addedKeys: readonly string[];
}

/**
 * The envelope invariant (ADR 0010, #212 finding 4), applied to a `StoredEdit` on its own: whenever
 * the edit touches `segments`, or touches the envelope (`start`/`end`) without naming `segments`, the
 * two are reconciled against each other so the result leaving this function can never disagree. One
 * Segment is the envelope's own drawing, so an envelope-only write moves it; several Segments give no
 * such answer, so an envelope-only write against several is refused (`SegmentsOutOfSyncError`,
 * `'ambiguous'`) — the same refusal `CONTEXT.md`'s Segment entry states for a consumer's direct write.
 * An edit that names both `segments` and an envelope the Segments do not produce is refused too
 * (`'conflicting'`) rather than picking a winner (finding S3).
 *
 * `readEdit` below calls this for `entries.update()`. A consumer can be asked to send a clearer edit;
 * an `EditExtender`'s cascade cannot, so it does not call this function for its own several-Segment,
 * envelope-only case — `reconcileExtenderEnvelope` below is that seam's own answer (D-S5-43).
 */
export function reconcileEnvelope(entry: Entry, stored: StoredEdit): EnvelopeReconciliation {
  const writesEnvelope = stored.start !== undefined || stored.end !== undefined;
  const sole = soleSegmentOf(entry);
  if (writesEnvelope && stored.segments === undefined && sole === undefined) {
    throw new SegmentsOutOfSyncError(entry.id, 'ambiguous');
  }

  const before = new Set(Object.keys(stored));
  let next = stored;
  if (writesEnvelope && stored.segments === undefined && sole !== undefined) {
    // The bar a one-Segment Entry draws is its envelope, so both move or the bar stays where the
    // envelope no longer is. The Segment keeps its id: this is the same stretch, moved.
    next = {
      ...stored,
      segments: [{ id: sole.id, start: stored.start ?? entry.start, end: stored.end ?? entry.end }],
    };
  }

  if (next.segments !== undefined) {
    const envelope = envelopeOfSegments(next.segments);
    if (stored.segments !== undefined) {
      if (stored.start !== undefined && stored.start !== envelope.start) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting');
      }
      if (stored.end !== undefined && stored.end !== envelope.end) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting');
      }
    }
    next = { ...next, start: envelope.start, end: envelope.end };
  }

  const addedKeys = Object.keys(next).filter((key) => !before.has(key));
  return { edit: next, addedKeys };
}

/** Fits `segments` inside `target`: every Segment first clamps into `[target.start, target.end)`,
 *  then whichever Segment still misses an edge widens to reach it — the earliest-starting Segment to
 *  `target.start`, the latest-ending one to `target.end` (`rollup.ts`'s own rule for a rolled-up
 *  parent, #212 R2 fix-plan review, finding B1). One Segment plays both roles when there is only one.
 *  Returns `segments` unchanged when every Segment already fits. Shared by the Rollup and by
 *  `reconcileExtenderEnvelope` below, so both compute one answer to "how do these Segments fit a new
 *  span" the same way. */
export function fitSegmentsToEnvelope(segments: readonly Segment[], target: TimeSpan): readonly Segment[] {
  if (segments.length === 0) return segments;
  const { start: targetStart, end: targetEnd } = target;
  const clamp = (value: Instant): Instant => {
    if (value < targetStart) return targetStart;
    if (value > targetEnd) return targetEnd;
    return value;
  };

  let changed = false;
  let next = segments.map((segment) => {
    const start = clamp(segment.start);
    const end = clamp(segment.end);
    if (start === segment.start && end === segment.end) return segment;
    changed = true;
    return { ...segment, start, end };
  });

  let earliestIndex = 0;
  let latestIndex = 0;
  for (let index = 1; index < next.length; index++) {
    if (next[index]!.start < next[earliestIndex]!.start) earliestIndex = index;
    if (next[index]!.end > next[latestIndex]!.end) latestIndex = index;
  }

  if (next[earliestIndex]!.start !== targetStart) {
    next = next.map((segment, index) =>
      index === earliestIndex ? { ...segment, start: targetStart } : segment,
    );
    changed = true;
  }
  if (next[latestIndex]!.end !== targetEnd) {
    next = next.map((segment, index) => (index === latestIndex ? { ...segment, end: targetEnd } : segment));
    changed = true;
  }

  return changed ? next : segments;
}

/** Moves every Segment by `deltaMs`, keeping each Segment's own id and its own length. This is a
 *  rigid-group move, the same shift a whole-Entry drag already performs (`layout/gesture-draft.ts`'s
 *  `moveEdit`). Returns `segments` unchanged when `deltaMs` is zero. */
function translateSegments(segments: readonly Segment[], deltaMs: number): readonly Segment[] {
  if (deltaMs === 0) return segments;
  return segments.map((segment) => ({
    ...segment,
    start: addMs(segment.start, deltaMs),
    end: addMs(segment.end, deltaMs),
  }));
}

/**
 * The `EditExtender` seam's own answer to a several-Segment, envelope-only write — the case
 * `reconcileEnvelope` refuses for a consumer, because a plugin's cascade cannot be asked to send a
 * clearer edit the way `entries.update()` can (#212 R2 fix-plan review, posture decision D-S5-43).
 *
 * Every other shape an extender's `StoredEdit` can take — naming `segments` itself, or writing the
 * envelope against an Entry with one Segment — owes the same proof a consumer's edit does, so those
 * cases still go through `reconcileEnvelope` unchanged, `'conflicting'` refusal included.
 *
 * The several-Segment, envelope-only case gets a computed answer instead of a refusal: every Segment
 * translates by the written delta, the rigid-group move a whole-Entry drag already performs. A write
 * that names both `start` and `end` with a duration that disagrees with the Entry's own current span
 * cannot satisfy both edges with one delta — no single shift moves both a different distance — so that
 * one case falls back to `fitSegmentsToEnvelope`, the Rollup's own clamp-and-widen rule, instead.
 */
export function reconcileExtenderEnvelope(entry: Entry, stored: StoredEdit): StoredEdit {
  const writesEnvelope = stored.start !== undefined || stored.end !== undefined;
  if (!writesEnvelope || stored.segments !== undefined || soleSegmentOf(entry) !== undefined) {
    return reconcileEnvelope(entry, stored).edit;
  }

  const bothEdgesGiven = stored.start !== undefined && stored.end !== undefined;

  // An inverted envelope names no span to fit into. `fitSegmentsToEnvelope` would clamp every
  // Segment onto both edges at once, so every Segment of the Entry collapses onto the same inverted
  // stretch and every authored extent goes, with no error raised. This seam refuses instead, which
  // is what this write met before the seam computed answers at all. `'ambiguous'` already carries
  // the guidance a plugin author needs here: write `segments`, not `start`/`end` alone.
  if (bothEdgesGiven && stored.end! < stored.start!) {
    throw new SegmentsOutOfSyncError(entry.id, 'ambiguous');
  }

  const durationChanged =
    bothEdgesGiven && diffMs(stored.end!, stored.start!) !== diffMs(entry.end, entry.start);

  if (durationChanged) {
    const segments = fitSegmentsToEnvelope(entry.segments, { start: stored.start!, end: stored.end! });
    return { ...stored, segments, start: stored.start!, end: stored.end! };
  }

  // One edge names the move; the other rides along by the same delta, keeping the Entry's duration —
  // a translate, not a resize (D-S5-43). `bothEdgesGiven` with a matching duration reaches here too,
  // and either edge's delta agrees with the other's by construction.
  const deltaMs =
    stored.start !== undefined ? diffMs(stored.start, entry.start) : diffMs(stored.end!, entry.end);
  const segments = translateSegments(entry.segments, deltaMs);
  return {
    ...stored,
    segments,
    start: addMs(entry.start, deltaMs),
    end: addMs(entry.end, deltaMs),
  };
}

/**
 * The map version of `reconcileExtenderEnvelope`: every edit an `EditExtender` returned, reconciled
 * against the Entry it targets. One function, called from both the commit path
 * (`build-commit-change-set.ts`) and the drag preview (`view/gesture-pipeline.ts`), so a gesture
 * previews exactly what it commits (#212 R2 fix-plan review — the preview path used to call the
 * extender with no reconciliation at all, so a drag could preview one span and commit a different one).
 * An id `entries` does not carry — nothing this caller knows the current Segments of — passes its edit
 * through unreconciled; there is nothing to reconcile against.
 */
export function reconcileExtenderEdits(entries: ReadonlyMap<EntryId, Entry>, edits: EntryEdits): EntryEdits {
  let changed = false;
  const reconciled = new Map<EntryId, StoredEdit>();
  for (const [id, edit] of edits) {
    const entry = entries.get(id);
    const next = entry ? reconcileExtenderEnvelope(entry, edit) : edit;
    if (next !== edit) changed = true;
    reconciled.set(id, next);
  }
  return changed ? reconciled : edits;
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
  }

  // The envelope has one owner (#212, finding 4, `plans/01` §6): `reconcileEnvelope` above reads it
  // back whenever this edit changes `segments`, and pairs a lone Segment onto an envelope-only write.
  // `reconcileEnvelope` reports which keys it added (`segments` paired on, or `start`/`end` read
  // back), and those are proposed the same way the caller's own keys are — neither is policy, so both
  // count as stated (#212 R2 fix-plan review, finding D).
  const reconciled = reconcileEnvelope(entry, stored);
  stored = reconciled.edit;
  for (const key of reconciled.addedKeys) proposed.add(key);

  if (edit.meta !== undefined) stored.meta = edit.meta;

  stored = writeDeclaredMetaFields(stored, entry, edit, registry);
  return withProposedKeys(stored, proposed);
}
