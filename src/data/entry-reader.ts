// Moved verbatim from api/entry-input.ts (D-S2-2): construction and `entries.add()` must read an
// `EntryInput` the same way, and the one place that happens is inside the store now.
//
// This file maps fields and nothing else. Every date decision — resolving a Plain time through the
// zone, and what a date-only `end` means against half-open storage — belongs to `time/input.ts`
// (I10); anything resembling date math here is a bug.

import {
  entryId,
  DuplicatePropsKeyError,
  DuplicateSegmentIdError,
  EmptySegmentsError,
  InvertedSpanError,
  SegmentsOutOfSyncError,
  segmentId,
  UnknownFieldError,
} from '../model/index.js';
import type {
  DateOnlyEndRule,
  Entry,
  EntryEdit,
  EntryId,
  EntryInput,
  Instant,
  Segment,
  SegmentId,
  SegmentInput,
  TimeSpan,
} from '../model/index.js';
import { addMs, diffMs, envelopeOfSegments, toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdits, ProposedEdit, ProposedEdits } from './edit-extension.js';
import {
  completeProps,
  emptyProposedEdit,
  withProposedKeys,
  writeDeclaredPropsFields,
} from './fields/field-access.js';
import { isCoreFieldKey } from './fields/core-fields.js';
import type { FieldRegistry } from './fields/field-registry.js';

/** The Dataset context every entry is read against: one zone, one end rule, for the whole list. */
export interface EntryReadContext {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  /** Call: `context.mintSegmentId()` — the id a Segment nobody named gets, from the owning Dataset's
   * own counter (I2, #212). */
  mintSegmentId(): SegmentId;
}

/** Which Entry a write targets, and which call wrote it — what an error message needs to name the
 *  caller's own door and the id the caller wrote (#237). `operation` is a plain call name:
 *  `entries.add`, `entries.update`, `construction`, or `edit extender`. */
interface EditOrigin {
  readonly entryId: EntryId;
  readonly operation: string;
}

/** The name a plugin author knows their own write by. `reconcileEnvelope` and `toProposedEdit` serve both
 *  `entries.update()` and an `EditExtender` cascade (D-S5-44), and a message that named the wrong one
 *  sent the reader to a call they never made (#239). Exported so `build-commit-change-set.ts` can
 *  name the same call when it reconciles a body author's and an extender author's envelope keys
 *  together (#232) — one label for the one boundary, not a second string that means the same thing. */
export const EXTENDER_OPERATION = 'edit extender';

/** `start`/`end`/`segments` are the only keys `reconcileEnvelope` ever adds on its own (D-S5-44) — an
 *  edit that never touches one of these three carries no envelope ambiguity at all. */
const ENVELOPE_KEYS = ['start', 'end', 'segments'] as const;

/** Which of `start`/`end`/`segments` a caller's own loose edit named, before `reconcileEnvelope` pairs
 *  or back-derives the rest (#232). This is the fact the I4 guard and the commit's own envelope
 *  reconciliation both need and `toProposedEdit` alone can answer, because after reconciliation the same
 *  three keys sit on the `ProposedEdit` whether the caller wrote one of them or none — `reconcileEnvelope`
 *  fills in whichever the caller left out. */
export function authoredEnvelopeKeysOf(edit: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const keys = new Set<string>();
  // `key in edit` — not `edit[key] !== undefined` — so an explicit `start: undefined` (the un-date
  // verb, ADR 0012) still counts as authored: the caller named the key to clear it, not by accident.
  for (const key of ENVELOPE_KEYS) if (key in edit) keys.add(key);
  return keys;
}

/** A Segment's own span, without its id — what an error reports, so `InvertedSpanError.span` stays a
 *  `TimeSpan` rather than leaking the Segment it came from. */
function spanOf(segment: { start: Instant; end: Instant }): TimeSpan {
  return { start: segment.start, end: segment.end };
}

/** `existing` is the Segment presently at this position, when `entries.update` is moving one it
 *  already drew (S2.3 §1.1, #212). An input that names no `id` keeps `existing`'s id — a move, not a
 *  replacement — and mints only when there is no Segment at that position to keep the id of. */
function toSegment(
  input: SegmentInput,
  context: EntryReadContext,
  owner: EditOrigin,
  existing?: Segment,
): Segment {
  const segment: Segment = {
    id: input.id === undefined ? (existing?.id ?? context.mintSegmentId()) : segmentId(input.id),
    start: toInstant(context.timeZone, input.start, owner.operation),
    end: toEndInstant(context.timeZone, input.end, context.dateOnlyEnd, owner.operation),
  };
  if (segment.end < segment.start) {
    // The Entry id comes from `owner`, not from the Segment alone: a Segment written with no `id` of
    // its own carries an id that was minted a line ago, which the consumer has never seen (#237, F4).
    throw new InvertedSpanError(owner.entryId, spanOf(segment), owner.operation, segment.id);
  }
  return segment;
}

/** An Entry spans if and only if it holds both dates (ADR 0012), and holds a Segment if and only if
 * it spans — so this returns `[]` when `dates` names fewer than two, unless the input named its own
 * `segments` explicitly. An Entry that spans but named none stores its own envelope as its one
 * Segment. */
function toSegments(
  input: EntryInput,
  dates: { start?: Instant; end?: Instant },
  context: EntryReadContext,
  owner: EditOrigin,
): readonly Segment[] {
  if (input.segments === undefined || input.segments.length === 0) {
    if (dates.start === undefined || dates.end === undefined) return [];
    return [{ id: context.mintSegmentId(), start: dates.start, end: dates.end }];
  }
  return input.segments.map((segment) => toSegment(segment, context, owner));
}

/** The one Segment an Entry draws, or `undefined` when it draws several — the question
 * `segments-out-of-sync` and a plain `start` edit both ask (#212). */
function soleSegmentOf(entry: Entry): Segment | undefined {
  return entry.segments.length === 1 ? entry.segments[0] : undefined;
}

/** Reads `input.start`/`input.end` into `Instant`s, one date at a time (ADR 0012: one date with no
 * other is legal, so this never demands the pair the way `toEntrySpan` used to). An unreadable date
 * is still refused by `toInstant`/`toEndInstant`; a pair that inverts is `InvertedSpanError`. */
function toEntryDates(
  input: EntryInput,
  context: EntryReadContext,
  owner: EditOrigin,
): { start?: Instant; end?: Instant } {
  const dates: { start?: Instant; end?: Instant } = {};
  if (input.start !== undefined) dates.start = toInstant(context.timeZone, input.start, owner.operation);
  if (input.end !== undefined) {
    dates.end = toEndInstant(context.timeZone, input.end, context.dateOnlyEnd, owner.operation);
  }
  if (dates.start !== undefined && dates.end !== undefined && dates.end < dates.start) {
    throw new InvertedSpanError(owner.entryId, dates as TimeSpan, owner.operation);
  }
  return dates;
}

/** Optional fields are copied only when present: `exactOptionalPropertyTypes` makes an explicit
 * `undefined` a different thing from an absent key, and an `Entry` must not gain keys its input
 * never had. Exported for `entries.add()` (S2.3 §1.1), which reads one input the same way
 * construction reads every entry in `entries: EntryInput[]` — one function, both call sites.
 *
 * `start`/`end` are read from the Segments when the Entry spans, not from `input.start`/`input.end`
 * directly (#212, finding 4): an Entry that names Segments overrunning its own authored span used to
 * keep that stale span forever, because ingest was not one of the places that computed the envelope.
 * `envelopeOfSegments` is the one function every write path — this one included — calls instead. A
 * dateless or one-date Entry has no Segments to derive an envelope from, so it keeps the dates it
 * named, read straight (ADR 0012). */
/** Every key `EntryInput` itself declares — the envelope this walk never treats as a `props`
 *  candidate, flat or nested. Frozen, not a `Set`: one array literal, read-only for the module's
 *  whole life, so it carries no state a second Gantt instance could share (I2). */
const ENVELOPE_INPUT_KEYS = Object.freeze([
  'id',
  'parentId',
  'kind',
  'name',
  'start',
  'end',
  'segments',
  'props',
]);

function warnIngest(message: string): void {
  console.warn(`FreeGantt: ${message}`);
}

/**
 * `entry.props` at ingest (ADR 0011, Q15): declared Field keys may sit flat, at the top level of a
 * constructor record or an `add()` call, the same shape `update()` takes; a nested `props` stays
 * legal for passenger keys and for a bag a consumer already holds. A key named both ways throws
 * (`DuplicatePropsKeyError`) — the two spellings would silently disagree about which value wins.
 *
 * Two ingest warnings live here, and neither throws: an unknown top-level key (this Entry may come
 * from an API this consumer does not own), and a `props` key that names a core key (the core
 * definition wins; the value is carried nowhere and is unreachable through `read`).
 */
function propsFromInput(
  input: EntryInput,
  registry: FieldRegistry,
  id: EntryId,
): Readonly<Record<string, unknown>> {
  const props: Record<string, unknown> = {};
  const nested = input.props as Readonly<Record<string, unknown>> | undefined;
  for (const key of Object.keys(nested ?? {})) {
    if (isCoreFieldKey(key)) {
      warnIngest(`"${id}"'s "props.${key}" names a core field. The core value wins; this is ignored.`);
      continue;
    }
    props[key] = nested![key];
  }
  const flat = input as unknown as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(flat)) {
    if (ENVELOPE_INPUT_KEYS.includes(key)) continue;
    if (!registry.has(key)) {
      warnIngest(`"${id}" carries an undeclared key "${key}". Declare it in "fields" to make it writable.`);
      continue;
    }
    if (key in props) throw new DuplicatePropsKeyError(key, id);
    props[key] = flat[key];
  }
  return props;
}

export function toEntry(
  input: EntryInput,
  context: EntryReadContext,
  registry: FieldRegistry,
  operation: string,
): Entry {
  const kind = input.kind ?? 'span';
  const id = entryId(input.id);
  const owner: EditOrigin = { entryId: id, operation };
  const dates = toEntryDates(input, context, owner);
  const segments = toSegments(input, dates, context, owner);
  const envelope = segments.length > 0 ? envelopeOfSegments(segments) : dates;
  const entry: Entry = {
    id,
    name: input.name,
    kind,
    segments,
    props: propsFromInput(input, registry, id),
  };
  if (envelope.start !== undefined) entry.start = envelope.start;
  if (envelope.end !== undefined) entry.end = envelope.end;
  if (input.parentId !== undefined) entry.parentId = entryId(input.parentId);
  return entry;
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

export function toEntries(
  inputs: readonly EntryInput[],
  context: EntryReadContext,
  registry: FieldRegistry,
  operation = 'construction',
): readonly Entry[] {
  const entries = inputs.map((input) => toEntry(input, context, registry, operation));
  assertNoDuplicateSegmentIds(entries);
  return entries;
}

/** What `reconcileEnvelope` hands back: the reconciled edit, and which keys it wrote onto the edit
 *  itself — `segments` paired on, or `start`/`end` read back off Segments the edit already named.
 *  `toProposedEdit` reports these keys to its own `proposed` set (#212 R2 fix-plan review, finding D): the
 *  caller of `reconcileEnvelope` is told what changed, instead of diffing `Object.keys` before and
 *  after to find out. */
export interface EnvelopeReconciliation {
  readonly edit: ProposedEdit;
  readonly addedKeys: readonly string[];
}

/**
 * The envelope invariant (ADR 0010, #212 finding 4; revised by ADR 0012), applied to a `ProposedEdit`
 * on its own: whenever the edit touches `segments`, or touches the envelope (`start`/`end`) without
 * naming `segments`, the two are reconciled against each other so the result leaving this function
 * can never disagree.
 *
 * An Entry spans if and only if it holds both dates, and holds a Segment if and only if it spans
 * (ADR 0012). So an envelope-only write against zero or one Segment is no longer one question —
 * it is three, asked in this order: does the edit leave both dates present? Mint (or keep) one
 * Segment. Does it leave the pair broken? Drop the Segment, if there was one, and keep whichever
 * date the edit did not touch. Does the Entry hold several Segments already? An envelope-only write
 * names none of them, so it is refused (`SegmentsOutOfSyncError`, `'ambiguous'`) — the same refusal
 * `CONTEXT.md`'s Segment entry states for a consumer's direct write. An edit that names both
 * `segments` and an envelope the Segments do not produce is refused too (`'conflicting'`) rather
 * than picking a winner (finding S3).
 *
 * `toProposedEdit` below calls this for `entries.update()`, and `reconcileExtenderEdits` below calls it for
 * an `EditExtender`'s cascade — the same function, the same refusal, for both callers (D-S5-44). A
 * plugin's cascade cannot be asked to send a clearer edit the way `entries.update()`'s caller can,
 * but it has an author, and this refusal is how that author is told at dev time to write `segments`
 * instead — a caller-identity split, a computed answer for the extender and a refusal for
 * `entries.update()`, was tried and rejected (D-S5-44).
 *
 * `mintSegmentId` is optional: the drag preview (`view/gesture-pipeline.ts`'s `#extraFor`) calls
 * this with none, because `view/` has no door to the Dataset's id counter and no plugin can turn a
 * dateless Entry spanning mid-drag today (no scheduling plugin ships before S7). When it is missing
 * and a second date just arrived with no existing Segment to keep, this leaves the dates set with no
 * Segment for that one preview frame — never committed, so never a real inconsistency.
 */
export function reconcileEnvelope(
  entry: Entry,
  stored: ProposedEdit,
  operation: string,
  mintSegmentId?: () => SegmentId,
): EnvelopeReconciliation {
  const before = new Set(Object.keys(stored));
  let next: ProposedEdit = stored;

  if (stored.segments === undefined) {
    const touchesStart = 'start' in stored;
    const touchesEnd = 'end' in stored;
    if (touchesStart || touchesEnd) {
      if (entry.segments.length > 1) {
        throw new SegmentsOutOfSyncError(entry.id, 'ambiguous', operation);
      }
      const sole = soleSegmentOf(entry);
      const resultStart = touchesStart ? stored.start : entry.start;
      const resultEnd = touchesEnd ? stored.end : entry.end;
      if (resultStart !== undefined && resultEnd !== undefined) {
        // The bar a one-Segment Entry draws is its envelope, so both move together. The Segment
        // keeps its id when there is one to keep; a dateless or one-date Entry gaining its pair
        // mints a fresh one.
        const id = sole?.id ?? mintSegmentId?.();
        if (id !== undefined) {
          next = { ...stored, segments: [{ id, start: resultStart, end: resultEnd }] };
        }
      } else if (sole !== undefined) {
        // The pair just broke: the Segment it drew no longer has two dates to span, so it goes.
        next = { ...stored, segments: [] };
      }
    }
  }

  if (next.segments !== undefined && next.segments.length > 0) {
    // Refused before the envelope is even computed (2026-09-06 ruling, #143): a Segment whose `end`
    // sits before its `start` is never legal, whether it came from the sole-Segment pairing above,
    // an `entries.update()` caller's own `segments`, or an `EditExtender` cascade's Instant-typed
    // write. `start === end` still passes — that Segment is empty, not inverted.
    for (const segment of next.segments) {
      if (segment.end < segment.start) {
        throw new InvertedSpanError(entry.id, spanOf(segment), operation, segment.id);
      }
    }
    const envelope = envelopeOfSegments(next.segments);
    if (stored.segments !== undefined) {
      if (stored.start !== undefined && stored.start !== envelope.start) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting', operation);
      }
      if (stored.end !== undefined && stored.end !== envelope.end) {
        throw new SegmentsOutOfSyncError(entry.id, 'conflicting', operation);
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
 * It names `segments` and nothing else, and core derives the envelope from them (D-S5-50, #239). It
 * used to state the envelope too, and that cost a plugin author a silent write: composing this result
 * over an earlier plugin's `{ end }` overwrote that `end` with one these Segments produce, so the
 * merged edit read as self-consistent and committed with the earlier write gone. Naming `segments`
 * alone makes the same composition a refusal (`SegmentsOutOfSyncError`, `'conflicting'`) instead — the
 * defect class #238 closed for `proposedKeys`, closed here for the envelope.
 *
 * A public export (`api/dataset-plugin.ts`, `api/index.ts`), for the same reason `mergeEntryEdits` is:
 * it builds the `EntryEdits` map's value type, which only an extender produces, so it is a
 * plugin-author tool and not an app-author one.
 *
 * `start` is an `Instant`, not the loose `InstantInput` every way *in* takes. This is a builder, not a
 * way in: the way in is the extender's return, which `toProposedEdits` normalizes. Taking a loose date here
 * would need a zone to read it, and asking a plugin author to hand back `ctx.dataset.timeZone` — a
 * zone core already holds — is the zone math core is supposed to fill for them (`plans/02`, "two
 * callers, two surfaces"). A caller who holds a loose date reads it with `time/`'s own helper first.
 */
export function moveEntryTo(entry: Entry, start: Instant): EntryEdit {
  // Load-bearing cast (ADR 0012): moving an Entry rigidly only makes sense for one that already
  // spans — a dateless or one-date Entry has no Segments to translate, so `entry.segments.map`
  // below is `[]` regardless and this delta is never read.
  const deltaMs = diffMs(start, entry.start as Instant);
  return {
    segments: entry.segments.map((segment) => ({
      id: segment.id,
      start: addMs(segment.start, deltaMs),
      end: addMs(segment.end, deltaMs),
    })),
  };
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
 *
 * `mintSegmentId` is the commit path's real counter (`CommitChangeSetInput.mintSegmentId`) — a
 * cascade that turns a dateless Entry spanning always mints a real id, because this path always
 * reaches the store. The preview path below never carries one; see `reconcileEnvelope`.
 */
export function reconcileExtenderEdits(
  entries: ReadonlyMap<EntryId, Entry>,
  edits: ProposedEdits,
  mintSegmentId?: () => SegmentId,
): ProposedEdits {
  let changed = false;
  const reconciled = new Map<EntryId, ProposedEdit>();
  for (const [id, edit] of edits) {
    const entry = entries.get(id);
    const next = entry ? reconcileEnvelope(entry, edit, EXTENDER_OPERATION, mintSegmentId).edit : edit;
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
  edits: ProposedEdits,
): ProposedEdits {
  let changed = false;
  const reconciled = new Map<EntryId, ProposedEdit>();
  for (const [id, edit] of edits) {
    const entry = entries.get(id);
    try {
      const next = entry ? reconcileEnvelope(entry, edit, EXTENDER_OPERATION).edit : edit;
      if (next !== edit) changed = true;
      reconciled.set(id, next);
    } catch (error) {
      if (!(error instanceof SegmentsOutOfSyncError)) throw error;
      changed = true;
    }
  }
  return changed ? reconciled : edits;
}

/** `toEditReading`'s result: the `ProposedEdit` `toProposedEdit` has always returned, plus which of
 *  `start`/`end`/`segments` the *caller* named before `reconcileEnvelope` paired or back-derived the
 *  rest. The commit path needs that second fact to tell a body author's envelope write from an
 *  `EditExtender`'s own, which `proposedKeys` alone cannot: `reconcileEnvelope` folds its own added
 *  keys into `proposedKeys` too, so by the time an edit is stored the two are indistinguishable
 *  (#232). Internal only — never returned from a public entry point. */
export interface EditReading {
  readonly stored: ProposedEdit;
  readonly authoredEnvelopeKeys: ReadonlySet<string>;
}

/** `toEditsReading`'s result: `EditReading` widened from one Entry to the whole map an
 *  `EditExtender` cascade touches — what `DatasetState.extraEditsReadingFor` hands the commit path
 *  (#232). Internal only. */
export interface EditsReading {
  readonly stored: ProposedEdits;
  readonly authoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>;
}

/** Reads an `entries.update()` edit into `ProposedEdit` (S2.3 §1.1) — every present core date field
 * goes through `time/` the way `toEntry` reads a whole `Entry`. Declared Field keys fold through
 * `writeField` so the write set stays entry-shaped (D-S4-2). An update may set `start` without `end`.
 *
 * Returns the envelope keys the caller itself named alongside the `ProposedEdit`, for the commit path
 * to tell a body author's envelope write from an extender's own (#232) — see `EditReading`. */
export function toEditReading(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: Entry,
  registry: FieldRegistry,
  operation: string,
): EditReading {
  let stored: ProposedEdit = emptyProposedEdit();
  // Which Fields this edit writes. The caller's own keys start the set, and a Field core
  // derives below joins it. A key nobody states never reaches the changeset (#212).
  const proposed = new Set<string>(Object.keys(edit));
  const authoredEnvelopeKeys = authoredEnvelopeKeysOf(edit);
  if (edit.parentId !== undefined) stored.parentId = entryId(edit.parentId);
  if (edit.kind !== undefined) stored.kind = edit.kind;
  if (edit.name !== undefined) stored.name = edit.name;
  // `'start' in edit` — not `edit.start !== undefined` — so `update(id, { start: undefined })` (the
  // un-date verb, ADR 0012) reaches `stored.start = undefined` rather than being read as "untouched".
  if ('start' in edit)
    stored.start = edit.start === undefined ? undefined : toInstant(context.timeZone, edit.start, operation);
  if ('end' in edit) {
    stored.end =
      edit.end === undefined
        ? undefined
        : toEndInstant(context.timeZone, edit.end, context.dateOnlyEnd, operation);
  }
  if (edit.segments !== undefined) {
    // Every stored Entry keeps at least one Segment (#212); an update cannot write it down to zero
    // the way `entries.add({ segments: [] })` can mint one — there is no whole-span input here to
    // mint it from, only the Segment ids already on the Entry, which this write would silently drop.
    if (edit.segments.length === 0) throw new EmptySegmentsError(entry.id, operation);
    // Positional match (#212): the Segment at index `i` that names no `id` of its own keeps the id
    // of the Entry's current Segment at that index — this is how `dataset.entries.update(id, {
    // segments })` moves a Segment, per `CONTEXT.md`. An index beyond the Entry's current count has
    // no counterpart to keep, so it mints a fresh id, the same as an added Segment on `entries.add`.
    stored.segments = edit.segments.map((segment, index) =>
      toSegment(segment, context, { entryId: entry.id, operation }, entry.segments[index]),
    );
  }

  // The envelope has one owner (#212, finding 4, `plans/01` §6): `reconcileEnvelope` above reads it
  // back whenever this edit changes `segments`, and pairs a lone Segment onto an envelope-only write.
  // `reconcileEnvelope` reports which keys it added (`segments` paired on, or `start`/`end` read
  // back), and those are proposed the same way the caller's own keys are — neither is policy, so both
  // count as stated (#212 R2 fix-plan review, finding D).
  const reconciled = reconcileEnvelope(entry, stored, operation, () => context.mintSegmentId());
  stored = reconciled.edit;
  for (const key of reconciled.addedKeys) proposed.add(key);

  stored = writeDeclaredPropsFields(stored, entry, edit, registry);
  return { stored: completeProps(entry, withProposedKeys(stored, proposed)), authoredEnvelopeKeys };
}

/** Reads an `entries.update()` edit into `ProposedEdit` (S2.3 §1.1) — the shape every existing caller
 *  wants. `toEditReading` above is the same read; this discards the extra fact only the commit
 *  path's I4 guard needs (#232). */
export function toProposedEdit(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: Entry,
  registry: FieldRegistry,
  operation: string,
): ProposedEdit {
  return toEditReading(edit, context, entry, registry, operation).stored;
}

/**
 * Reads a whole map of `entries.update()` edits — the extension hook's writes (#209). One `toProposedEdit`
 * per Entry, so a plugin's cascade takes the exact road `dataset.entries.update(id, edit)` takes: the
 * dataset's zone resolves its dates, `DateOnlyEndRule` decides what a date-only `end` means, and core
 * derives `proposedKeys` from the edit's own keys. A plugin author writes none of that.
 *
 * An undeclared Field key is refused here for the same reason `update()` refuses one (#209 Q2): one
 * rule on every way in, and a silent drop is the fault #197 existed for. A `props` key with no
 * declaration is carried at construction ingest only (ADR 0011) — it is never a live way in.
 *
 * An id nothing knows is skipped — there is no Entry to read the edit against, and `diffEdit` emits
 * no row for such an id either (#209 Q3, tracked as #235).
 *
 * Returns each Entry's authored envelope keys alongside its `ProposedEdit`, the same fact
 * `toEditReading` reports — the commit path's I4 guard needs to know which of `start`/`end`/
 * `segments` the hook itself named, not which `reconcileEnvelope` added on the hook's behalf (#232).
 */
export function toEditsReading(
  edits: EntryEdits,
  context: EntryReadContext,
  entryFor: (id: EntryId) => Entry | undefined,
  registry: FieldRegistry,
): EditsReading {
  const stored = new Map<EntryId, ProposedEdit>();
  const authoredEnvelopeKeys = new Map<EntryId, ReadonlySet<string>>();
  for (const [id, edit] of edits) {
    // The Entry as this transaction's own body leaves it, not the pre-transaction snapshot: a cascade
    // onto an Entry the same transaction added has no committed state to read against, and one whose
    // Segments the body just rewrote would be read against the Segments the commit is replacing
    // (D-S5-45, #212 R2 finding A).
    const entry = entryFor(id);
    if (entry === undefined) continue;
    for (const key of Object.keys(edit)) {
      if (!registry.has(key)) throw new UnknownFieldError(key, EXTENDER_OPERATION);
    }
    const reading = toEditReading(edit, context, entry, registry, EXTENDER_OPERATION);
    stored.set(id, reading.stored);
    authoredEnvelopeKeys.set(id, reading.authoredEnvelopeKeys);
  }
  return { stored, authoredEnvelopeKeys };
}

/** Reads a whole map of `entries.update()` edits — the extension hook's writes (#209). See
 *  `toEditsReading` above for the same read plus each Entry's authored envelope keys. */
export function toProposedEdits(
  edits: EntryEdits,
  context: EntryReadContext,
  entryFor: (id: EntryId) => Entry | undefined,
  registry: FieldRegistry,
): ProposedEdits {
  return toEditsReading(edits, context, entryFor, registry).stored;
}
