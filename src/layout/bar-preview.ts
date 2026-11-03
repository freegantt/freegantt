// layout/ — what a drag preview does to one painted bar. A frame, a connector and the backend's
// hot paint all read this one rule, so a line ends where the bar shows.

import type { BarId, EntryId } from '../model/index.js';

/** What the hot-path paint needs to preview a draft with no frame rebuild: a pixel offset
 *  and width delta per affected bar, read off the bound `TimeScale` against each entry's committed
 *  span. `extra` marks an entry the extension hook added rather than the caller's own selection —
 *  always `false` until the extender is wired in. `dy` is a vertical drag's own rigid
 *  offset (#425) — always `0` from `previewOffsets`; `view/gesture-pipeline.ts`'s `#computePreview`
 *  overwrites it on every entry a `place` drop paints, since that function knows nothing about rows. */
export interface BarPreview {
  /** The Entry whose bar this offset moves. A connector end names an Entry, so it matches on this. */
  entryId: EntryId;
  barId: BarId;
  dx: number;
  dy: number;
  dWidth: number;
  extra: boolean;
}

/** Call: `previewedBox(committedBox, preview)`. Where the bar shows while the drag runs. */
export function previewedBox(
  box: { x: number; width: number },
  preview: BarPreview,
): { x: number; width: number; dy: number } {
  return { x: box.x + preview.dx, width: box.width + preview.dWidth, dy: preview.dy };
}
