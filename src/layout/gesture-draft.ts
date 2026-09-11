// layout/ — the pure gesture math a drag needs (plans/s3-direct-manipulation/s3.3-drag-move.md
// D-S3-4). `interaction/` performs no arithmetic of its own — it receives a `Draft` (a `StoredEdits`,
// D-S3-2) from `GesturePipeline.session()` (`#draftFor`), which calls `draftForMove` here.
// Every date computation goes through `time/` (I10); this file never touches an Instant except by
// calling one of those functions.

import type {
  Entry,
  EntryId,
  Instant,
  ItemId,
  SegmentId,
  StoredEdit,
  StoredEdits,
  TimeUnit,
} from '../model/index.js';
import { itemId } from '../model/index.js';
import {
  addMs,
  diffMs,
  envelopeOfSegments,
  formatDate,
  stepBy,
  snapInstant,
  stepsBetween,
} from '../time/index.js';
import type { SnapUnit } from '../time/index.js';
import type { TimeScale } from '../time/index.js';

export interface DraftInput {
  zone: string;
  scale: TimeScale;
  /** Resolved snap setting (D-S3-12) — the caller has already turned an unset/`'tick'`
   *  `ViewPreset.snap` into a concrete `{ unit, increment }`, and Alt into `'none'`. */
  snap: SnapUnit;
  /** The entries this gesture moves, grabbed entry first (D-S3-22) — `entries[0]`'s own `start` is
   *  the anchor every other entry's delta is measured against, so a multi-selection drag moves as one
   *  rigid group instead of each row snapping independently. */
  entries: readonly Entry[];
  /** Horizontal pointer travel since the gesture armed, in content px (D-S3-11: vertical is ignored). */
  dxPx: number;
  /** The Selection (#212, ADR 0010) — the Segment ids the Gantt currently highlights. It is the one
   *  answer to "how much of this Entry does the gesture reach", because what paints as selected is
   *  what moves. An Entry whose Segments the Selection holds none of moves or resizes whole: that is
   *  a hover resize on an unselected bar, and it is the same fallback an omitted set gives. */
  selectedSegmentIds?: ReadonlySet<SegmentId>;
}

/** A move draft: `{ start, end }` for every grabbed entry, snapped and stepped as one rigid group
 *  (D-S3-3, D-S3-19). What paints selected is what moves (#211, #212): an Entry moves the Segments
 *  the Selection holds, and rewrites the envelope around them. A Selection that holds every Segment
 *  moves the whole Entry. Empty when `input.entries` is empty — a gesture with nothing to move. */
export function draftForMove(input: DraftInput): StoredEdits {
  const { zone, scale, snap, entries, dxPx, selectedSegmentIds } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorInstant = gesturedEdgeInstant(anchor, 'start', selectedSegmentIds);
  const anchorX = scale.xForInstant(anchorInstant);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();
  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchorInstant);
    for (const entry of entries) {
      edits.set(entry.id, moveEdit(entry, deltaMs, gesturedSegments(entry, selectedSegmentIds)));
    }
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, snappedCandidate);
  for (const entry of entries) {
    edits.set(
      entry.id,
      stepMoveEdit(
        zone,
        entry,
        snap.unit,
        steps * snap.increment,
        gesturedSegments(entry, selectedSegmentIds),
      ),
    );
  }
  return edits;
}

/** A resize draft: one edge of every grabbed entry moves by the same snapped/stepped calendar delta
 *  as `entries[0]`'s own grabbed edge (D-S3-19), the opposite edge held fixed. What paints selected
 *  is what the handles bracket (#211, #212). A resize reaches only the one selected Segment that
 *  holds the dragged edge: the `start` handle moves the earliest selected Segment's start, the `end`
 *  handle moves the latest selected Segment's end, and every sibling stays where it is. */
export function draftForResize(input: DraftInput & { edge: 'start' | 'end' }): StoredEdits {
  const { zone, scale, snap, entries, dxPx, edge, selectedSegmentIds } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorInstant = gesturedEdgeInstant(anchor, edge, selectedSegmentIds);
  const anchorX = scale.xForInstant(anchorInstant);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();

  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchorInstant);
    for (const entry of entries) {
      const gestured = gesturedSegments(entry, selectedSegmentIds);
      const current = edgeInstantOf(entry, gestured, edge);
      edits.set(entry.id, resizeEdit(entry, edge, addMs(current, deltaMs), gestured));
    }
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, snappedCandidate);
  for (const entry of entries) {
    const gestured = gesturedSegments(entry, selectedSegmentIds);
    const current = edgeInstantOf(entry, gestured, edge);
    edits.set(
      entry.id,
      resizeEdit(entry, edge, stepBy(zone, current, snap.unit, steps * snap.increment), gestured),
    );
  }
  return edits;
}

/** Which Segments of `entry` this gesture reaches (#212, ADR 0010): the ones the Selection holds.
 *  An Entry the Selection names none of moves whole — a hover resize grabs a bar nobody selected,
 *  and it still has to act on something. The answer is a list of indexes into `entry.segments`, so
 *  every rewrite below can keep each Segment's own id.  */
function gesturedSegments(entry: Entry, selected: ReadonlySet<SegmentId> | undefined): readonly number[] {
  const everySegment = entry.segments.map((_segment, index) => index);
  if (selected === undefined) return everySegment;
  const held = everySegment.filter((index) => selected.has(entry.segments[index]!.id));
  return held.length > 0 ? held : everySegment;
}

/** The envelope of the Segments a gesture reaches — the earliest `start` and the latest `end` among
 *  them. A Selection of one Segment makes this that Segment's own span, which is why a click on one
 *  bar anchors the drag on that bar. */
function envelopeOfIndexes(entry: Entry, indexes: readonly number[]): { start: Instant; end: Instant } {
  return envelopeOfSegments(indexes.map((index) => entry.segments[index]!));
}

/** The instant a gesture anchors on or drags: one edge of the reached Segments' envelope. */
function edgeInstantOf(entry: Entry, indexes: readonly number[], edge: 'start' | 'end'): Instant {
  const envelope = envelopeOfIndexes(entry, indexes);
  return edge === 'start' ? envelope.start : envelope.end;
}

/** The same edge, read straight from the Selection — what `draftForMove`/`draftForResize` anchor on
 *  before they know each Entry's own reached Segments. */
function gesturedEdgeInstant(
  entry: Entry,
  edge: 'start' | 'end',
  selected: ReadonlySet<SegmentId> | undefined,
): Instant {
  return edgeInstantOf(entry, gesturedSegments(entry, selected), edge);
}

/** Which reached Segment holds the dragged edge — the earliest `start` or the latest `end` among
 *  them. A multi-Segment resize moves that one Segment and leaves its siblings where they are.
 *  Segments are authored in any order, so the answer is a comparison, never the first index (#200). */
function segmentIndexAtEnvelopeEdge(entry: Entry, indexes: readonly number[], edge: 'start' | 'end'): number {
  let found = indexes[0]!;
  for (const index of indexes) {
    const segment = entry.segments[index]!;
    const best = entry.segments[found]!;
    if (edge === 'start' ? segment.start < best.start : segment.end > best.end) found = index;
  }
  return found;
}

/** Moves the reached Segments of `entry` by `deltaMs` and rewrites the envelope around them. Every
 *  Segment keeps its own id: a Selection points at ids, so a rewrite that dropped them would unselect
 *  the very bar the user is dragging (#212). */
function moveEdit(entry: Entry, deltaMs: number, indexes: readonly number[]): StoredEdit {
  const moving = new Set(indexes);
  const segments = entry.segments.map((segment, index) =>
    moving.has(index)
      ? { ...segment, start: addMs(segment.start, deltaMs), end: addMs(segment.end, deltaMs) }
      : segment,
  );
  return { segments, ...envelopeOfSegments(segments) };
}

/** Same as `moveEdit`, stepped by a calendar unit instead of a millisecond delta (keyboard nudge,
 *  D-S3-13). */
function stepMoveEdit(
  zone: string,
  entry: Entry,
  unit: TimeUnit,
  amount: number,
  indexes: readonly number[],
): StoredEdit {
  const moving = new Set(indexes);
  const segments = entry.segments.map((segment, index) =>
    moving.has(index)
      ? {
          ...segment,
          start: stepBy(zone, segment.start, unit, amount),
          end: stepBy(zone, segment.end, unit, amount),
        }
      : segment,
  );
  return { segments, ...envelopeOfSegments(segments) };
}

/** Resizes `entry`'s `edge` to `moved`. Only the reached Segment holding that edge moves. Zero-length
 *  clamp: the dragged edge never crosses the fixed one, so an inverted span is refused here, in the
 *  layout layer, before it reaches a changeset (D-S3-4). */
function resizeEdit(
  entry: Entry,
  edge: 'start' | 'end',
  moved: Instant,
  indexes: readonly number[],
): StoredEdit {
  const dragged = segmentIndexAtEnvelopeEdge(entry, indexes, edge);
  const segments = entry.segments.map((segment, index) => {
    if (index !== dragged) return segment;
    if (edge === 'start') {
      const start = moved > segment.end ? segment.end : moved;
      return { ...segment, start, end: segment.end };
    }
    const end = moved < segment.start ? segment.start : moved;
    return { ...segment, start: segment.start, end };
  });
  return { segments, ...envelopeOfSegments(segments) };
}

/** What the hot-path paint needs to preview a draft with no frame rebuild (D-S3-18): a pixel offset
 *  and width delta per affected item, read off the bound `TimeScale` against each entry's committed
 *  span. `extra` marks an entry the extension hook added rather than the caller's own selection
 *  (S3.6 — always `false` until the extender is wired in). */
export interface ItemPreview {
  itemId: ItemId;
  dx: number;
  dWidth: number;
  extra: boolean;
}

export interface PreviewOffsetsInput {
  /** The caller's own draft. */
  proposed: StoredEdits;
  /** Extension-hook extras layered on top (S3.6). Empty until then. */
  extra: StoredEdits;
  /** Committed entries `proposed`/`extra` are diffed against — one lookup per row, not a dataset scan. */
  entries: readonly Entry[];
  scale: TimeScale;
}

export function previewOffsets(input: PreviewOffsetsInput): readonly ItemPreview[] {
  const { proposed, extra, entries, scale } = input;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const out: ItemPreview[] = [];

  function pushOffset(id: EntryId, edit: StoredEdit, isExtra: boolean): void {
    const original = byId.get(id);
    if (!original) return;
    if (edit.segments !== undefined) {
      for (let index = 0; index < edit.segments.length; index++) {
        const from = original.segments[index];
        const to = edit.segments[index];
        if (from === undefined || to === undefined) continue;
        const x0 = scale.xForInstant(from.start);
        const x1 = scale.xForInstant(to.start);
        const width0 = scale.xForInstant(from.end) - x0;
        const width1 = scale.xForInstant(to.end) - x1;
        out.push({ itemId: itemId(id, index), dx: x1 - x0, dWidth: width1 - width0, extra: isExtra });
      }
      return;
    }
    if (edit.start === undefined || edit.end === undefined) return;
    // A gesture reaches this branch only for an Entry that already has a grip to grab, which means
    // it already spans (ADR 0012) — but nothing narrows `original` here, so this guards rather than
    // casts: a dateless Entry paints no offset instead of a crash if that assumption is ever wrong.
    if (original.start === undefined || original.end === undefined) return;
    const x0 = scale.xForInstant(original.start);
    const x1 = scale.xForInstant(edit.start);
    const width0 = scale.xForInstant(original.end) - x0;
    const width1 = scale.xForInstant(edit.end) - x1;
    out.push({ itemId: itemId(id), dx: x1 - x0, dWidth: width1 - width0, extra: isExtra });
  }

  for (const [id, edit] of proposed) pushOffset(id, edit, false);
  for (const [id, edit] of extra) pushOffset(id, edit, true);
  return out;
}

/** S3.8, D-S3-15: the Cursor line label at content `x` — `instantForX` → `snapInstant` →
 *  `formatDate`. All `time/` work stays in this file so `view/` never formats a date. */
export function cursorLabelForX(
  x: number,
  scale: TimeScale,
  snap: SnapUnit,
  locale?: Intl.LocalesArgument,
): string {
  const snapped = snapInstant(scale.timeZone, scale.instantForX(x), snap);
  return formatDate(scale.timeZone, snapped, locale);
}
