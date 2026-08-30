// layout/ — the pure gesture math a drag needs (plans/s3-direct-manipulation/s3.3-drag-move.md
// D-S3-4). `interaction/` performs no arithmetic of its own — it receives a `Draft` (an `EntryEdits`,
// D-S3-2) from `EntryGestureContext.draftFor`, which the shell builds by calling `draftForMove` here.
// Every date computation goes through `time/` (I10); this file never touches an Instant except by
// calling one of those functions.

import type { Entry, EntryEdits, EntryId, Instant, ItemId, StoredEdit } from '../model/index.js';
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
 *  (D-S3-3, D-S3-19). Empty when `input.entries` is empty — a gesture with nothing capable to move. */
export function draftForMove(input: DraftInput): EntryEdits {
  const { zone, scale, snap, entries, dxPx } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorX = scale.xForInstant(anchor.start);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();
  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchor.start);
    for (const entry of entries) {
      edits.set(entry.id, { start: addMs(entry.start, deltaMs), end: addMs(entry.end, deltaMs) });
    }
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchor.start, snappedCandidate);
  for (const entry of entries) {
    edits.set(entry.id, {
      start: stepBy(zone, entry.start, snap.unit, steps * snap.increment),
      end: stepBy(zone, entry.end, snap.unit, steps * snap.increment),
    });
  }
  return edits;
}

/** A resize draft: one edge of every grabbed entry moves by the same snapped/stepped calendar delta
 *  as `entries[0]`'s own grabbed edge (D-S3-19), the opposite edge held fixed. Zero-length clamp: the
 *  dragged edge never crosses the fixed one — an inverted span is refused right here, in the layout
 *  layer, before it ever reaches a changeset (D-S3-4). */
export function draftForResize(input: DraftInput & { edge: 'start' | 'end' }): EntryEdits {
  const { zone, scale, snap, entries, dxPx, edge } = input;
  const anchor = entries[0];
  if (!anchor) return new Map();

  const anchorInstant = edge === 'start' ? anchor.start : anchor.end;
  const anchorX = scale.xForInstant(anchorInstant);
  const rawCandidate = scale.instantForX(anchorX + dxPx);
  const snappedCandidate = snapInstant(zone, rawCandidate, snap);

  const edits = new Map<EntryId, StoredEdit>();

  function place(entry: Entry, moved: Instant): void {
    edits.set(entry.id, clampedEdgeEdit(entry, edge, moved));
  }

  if (snap === 'none') {
    const deltaMs = diffMs(snappedCandidate, anchorInstant);
    for (const entry of entries) {
      place(entry, addMs(edge === 'start' ? entry.start : entry.end, deltaMs));
    }
    return edits;
  }

  const steps = stepsBetween(zone, snap.unit, snap.increment, anchorInstant, snappedCandidate);
  for (const entry of entries) {
    place(entry, stepBy(zone, edge === 'start' ? entry.start : entry.end, snap.unit, steps * snap.increment));
  }
  return edits;
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
    if (!original || edit.start === undefined || edit.end === undefined) return;
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
