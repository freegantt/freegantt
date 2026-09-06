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
 * `readEdit` below calls this for `entries.update()`, and `reconcileExtenderEdits` below calls it for
 * an `EditExtender`'s cascade — the same function, the same refusal, for both callers (D-S5-44). A
 * plugin's cascade cannot be asked to send a clearer edit the way `entries.update()`'s caller can,
 * but it has an author, and this refusal is how that author is told at dev time to write `segments`
 * instead — a caller-identity split, a computed answer for the extender and a refusal for
 * `entries.update()`, was tried and rejected (D-S5-44).
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
 *  Returns `segments` unchanged when every Segment already fits. This is the Rollup's own rule for
 *  a rolled-up parent's envelope, not one an `EditExtender`'s cascade can reach for (D-S5-44): a
 *  cascade owes the same refusal `reconcileEnvelope` above enforces, not a computed fit. */
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

/**
 * The move a plugin's cascade is honest about (D-S5-44): every Segment of `entry`, translated rigidly
 * by `start - entry.start`, each keeping its own `SegmentId` and its own length. This is what a
 * several-Segment envelope-only write cannot say — `reconcileEnvelope` refuses that write because
 * `start`/`end` alone name no Segment to move — so a plugin author reaches for `moveEntryTo` instead
 * of hand-rolling the same rigid translate `layout/gesture-draft.ts`'s own `moveEdit` computes for a
 * whole-Entry drag. `layout/` and `data/` may not import each other (§1), so that is a second,
 * private copy of this same rule, not a shared function — `moveEdit` also moves only the gesture's own
 * selected Segments, never every Segment of the Entry, which this always does.
 *
 * A public export (`api/dataset-plugin.ts`, `api/index.ts`), for the same reason `mergeEntryEdits` is:
 * it takes and returns storage-shaped values only an extender produces, so it is a plugin-author tool,
 * not an app-author one.
 */
export function moveEntryTo(entry: Entry, start: Instant): StoredEdit {
  const deltaMs = diffMs(start, entry.start);
  const segments = entry.segments.map((segment) => ({
    ...segment,
    start: addMs(segment.start, deltaMs),
    end: addMs(segment.end, deltaMs),
  }));
  return { segments, ...envelopeOfSegments(segments) };
}

/**
 * Every edit an `EditExtender` returned, reconciled against the Entry it targets — `reconcileEnvelope`
 * itself, called once per edit. One function, called from both the commit path
 * (`build-commit-change-set.ts`) and the drag preview (`view/gesture-pipeline.ts`), so a gesture
 * previews exactly what it commits (#212 R2 fix-plan review — the preview path used to call the
 * extender with no reconciliation at all, so a drag could preview one span and commit a different one).
 *
 * A plugin's cascade owes the same envelope invariant a consumer's `entries.update()` does (D-S5-44):
 * an envelope-only write against a several-Segment Entry is refused (`SegmentsOutOfSyncError`,
 * `'ambiguous'`) here exactly as it is there — a dev-time throw is how a plugin author is told to
 * cascade `segments` instead. `#extraFor` in `view/gesture-pipeline.ts` is the caller that must not
 * let that throw reach a rAF callback with nothing to catch it; it drops the offending edit before
 * calling this function's preview counterpart, `reconcileExtenderEditsForPreview` below.
 *
 * An id `entries` does not carry — nothing this caller knows the current Segments of — passes its edit
 * through unreconciled; there is nothing to reconcile against.
 */
export function reconcileExtenderEdits(entries: ReadonlyMap<EntryId, Entry>, edits: EntryEdits): EntryEdits {
  let changed = false;
  const reconciled = new Map<EntryId, StoredEdit>();
  for (const [id, edit] of edits) {
    const entry = entries.get(id);
    const next = entry ? reconcileEnvelope(entry, edit).edit : edit;
    if (next !== edit) changed = true;
    reconciled.set(id, next);
  }
  return changed ? reconciled : edits;
}

/**
 * `reconcileExtenderEdits`'s own call for a preview frame (`view/gesture-pipeline.ts`'s `#extraFor`,
 * inside a rAF callback with nothing to catch a throw). A refusal there must not break the drag on
 * screen, so this drops the offending edit instead of reconciling it — that Entry paints no ghost for
 * this frame — and leaves every other edit reconciled as `reconcileExtenderEdits` would. The commit
 * path still calls `reconcileExtenderEdits` and still throws: the refusal is real, and dropping it
 * from a preview is not the same as dropping it from the write itself.
 */
export function reconcileExtenderEditsForPreview(
  entries: ReadonlyMap<EntryId, Entry>,
  edits: EntryEdits,
): EntryEdits {
  let changed = false;
  const reconciled = new Map<EntryId, StoredEdit>();
  for (const [id, edit] of edits) {
    const entry = entries.get(id);
    try {
      const next = entry ? reconcileEnvelope(entry, edit).edit : edit;
      if (next !== edit) changed = true;
      reconciled.set(id, next);
    } catch (error) {
      if (!(error instanceof SegmentsOutOfSyncError)) throw error;
      changed = true;
    }
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
