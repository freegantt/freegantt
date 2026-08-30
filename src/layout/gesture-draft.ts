// layout/ — the pure gesture math a drag needs (plans/s3-direct-manipulation/s3.3-drag-move.md
// D-S3-4). `interaction/` performs no arithmetic of its own — it receives a `Draft` (an `EntryEdits`,
// D-S3-2) from `EntryGestureContext.draftFor`, which the shell builds by calling `draftForMove` here.
// Every date computation goes through `time/` (I10); this file never touches an Instant except by
// calling one of those functions.

import type { Entry, EntryEdits, EntryId, ItemId, StoredEdit } from '../model/index.js';
import { itemId } from '../model/index.js';
import { addMs, diffMs, stepBy, snapInstant, stepsBetween } from '../time/index.js';
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
