// layout/ — the pure gesture math a drag needs (plans/s3-direct-manipulation/s3.3-drag-move.md
// D-S3-4). `interaction/` performs no arithmetic of its own — it receives a `Draft` (an `EntryEdits`,
// D-S3-2) from `GesturePipeline.session()` (`#draftFor`), which calls `draftForMove` here.
// Every date computation goes through `time/` (I10); this file never touches an Instant except by
// calling one of those functions.

import type {
  Entry,
  EntryEdits,
  EntryId,
  Instant,
  ItemId,
  StoredEdit,
  TimeSpan,
  TimeUnit,
} from '../model/index.js';
import { itemId } from '../model/index.js';
import { addMs, diffMs, formatDate, stepBy, snapInstant, stepsBetween } from '../time/index.js';
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
}

/** A move draft: `{ start, end }` for every grabbed entry, snapped and stepped as one rigid group
 *  (D-S3-3, D-S3-19). A segmented entry moves every Segment by that same delta and rewrites its
 *  envelope — the Selection names an Entry, so a drag moves the whole Entry (#200, D-S4-30).
 *  Empty when `input.entries` is empty — a gesture with nothing capable to move. */
export function draftForMove(input: DraftInput): EntryEdits {
  const { zone, scale, snap, entries, dxPx } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorInstant = envelopeEdgeInstant(anchor, 'start');
  const anchorX = scale.xForInstant(anchorInstant);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();
  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchorInstant);
    for (const entry of entries) edits.set(entry.id, moveEdit(entry, deltaMs));
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, snappedCandidate);
  for (const entry of entries) {
    edits.set(entry.id, stepMoveEdit(zone, entry, snap.unit, steps * snap.increment));
  }
  return edits;
}

/** A resize draft: one edge of every grabbed entry moves by the same snapped/stepped calendar delta
 *  as `entries[0]`'s own grabbed edge (D-S3-19), the opposite edge held fixed. The edge is the
 *  **envelope** edge, on a segmented entry too — the Selection names an Entry, so the `start` handle
 *  moves the earliest Segment's start and the `end` handle moves the latest Segment's end, and every
 *  other Segment stays where it is (#200). Zero-length clamp: the dragged edge never crosses the
 *  fixed one — an inverted span is refused right here, in the layout layer, before it ever reaches a
 *  changeset (D-S3-4). */
export function draftForResize(input: DraftInput & { edge: 'start' | 'end' }): EntryEdits {
  const { zone, scale, snap, entries, dxPx, edge } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorInstant = envelopeEdgeInstant(anchor, edge);
  const anchorX = scale.xForInstant(anchorInstant);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();

  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchorInstant);
    for (const entry of entries) {
      const current = envelopeEdgeInstant(entry, edge);
      edits.set(entry.id, resizeEdit(entry, edge, addMs(current, deltaMs)));
    }
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, snappedCandidate);
  for (const entry of entries) {
    const current = envelopeEdgeInstant(entry, edge);
    edits.set(entry.id, resizeEdit(entry, edge, stepBy(zone, current, snap.unit, steps * snap.increment)));
  }
  return edits;
}

function hasSegments(entry: Entry): entry is Entry & { segments: readonly TimeSpan[] } {
  return entry.segments !== undefined && entry.segments.length > 0;
}

/** The instant a resize drags — the edge the handle paints on (#200). A segmented entry reads its
 *  own Segments rather than its stored `start`/`end`: an entry authored with a date-only `end` gets
 *  an envelope a whole day past its latest Segment, and the drag must anchor where the handle sits,
 *  not a day to its right. */
function envelopeEdgeInstant(entry: Entry, edge: 'start' | 'end'): Instant {
  if (!hasSegments(entry)) return edge === 'start' ? entry.start : entry.end;
  const envelope = envelopeOfSegments(entry.segments);
  return edge === 'start' ? envelope.start : envelope.end;
}

/** Which Segment holds the envelope edge — the earliest `start` or the latest `end`, the same two
 *  edges `envelopeOfSegments` reports. Segments are authored in any order, so the answer is a
 *  comparison, never index 0 (#200). */
function segmentIndexAtEnvelopeEdge(segments: readonly TimeSpan[], edge: 'start' | 'end'): number {
  let found = 0;
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    const best = segments[found]!;
    if (edge === 'start' ? segment.start < best.start : segment.end > best.end) found = i;
  }
  return found;
}

function envelopeOfSegments(segments: readonly TimeSpan[]): { start: Instant; end: Instant } {
  let start = segments[0]!.start;
  let end = segments[0]!.end;
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.start < start) start = segment.start;
    if (segment.end > end) end = segment.end;
  }
  return { start, end };
}

function moveEdit(entry: Entry, deltaMs: number): StoredEdit {
  if (!hasSegments(entry)) {
    return { start: addMs(entry.start, deltaMs), end: addMs(entry.end, deltaMs) };
  }
  const segments = entry.segments.map((segment) => ({
    start: addMs(segment.start, deltaMs),
    end: addMs(segment.end, deltaMs),
  }));
  return { segments, ...envelopeOfSegments(segments) };
}

function stepMoveEdit(zone: string, entry: Entry, unit: TimeUnit, amount: number): StoredEdit {
  if (!hasSegments(entry)) {
    return {
      start: stepBy(zone, entry.start, unit, amount),
      end: stepBy(zone, entry.end, unit, amount),
    };
  }
  const segments = entry.segments.map((segment) => ({
    start: stepBy(zone, segment.start, unit, amount),
    end: stepBy(zone, segment.end, unit, amount),
  }));
  return { segments, ...envelopeOfSegments(segments) };
}

function resizeEdit(entry: Entry, edge: 'start' | 'end', moved: Instant): StoredEdit {
  if (!hasSegments(entry)) {
    return clampedEdgeEdit(entry, edge, moved);
  }
  const index = segmentIndexAtEnvelopeEdge(entry.segments, edge);
  const segments = entry.segments.map((segment, i) => {
    if (i !== index) return segment;
    if (edge === 'start') {
      const start = moved > segment.end ? segment.end : moved;
      return { start, end: segment.end };
    }
    const end = moved < segment.start ? segment.start : moved;
    return { start: segment.start, end };
  });
  return { segments, ...envelopeOfSegments(segments) };
}

function clampedEdgeEdit(entry: Entry, edge: 'start' | 'end', moved: Instant): StoredEdit {
  if (edge === 'start') {
    return { start: moved > entry.end ? entry.end : moved, end: entry.end };
  }
  return { start: entry.start, end: moved < entry.start ? entry.start : moved };
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
  proposed: EntryEdits;
  /** Extension-hook extras layered on top (S3.6). Empty until then. */
  extra: EntryEdits;
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
    if (edit.segments !== undefined && original.segments !== undefined) {
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
