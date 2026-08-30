// view/ — the gesture pipeline (D-GH-2): draft math (`layout/gesture-draft.ts`), preview rAF
// coalescing, and the commit pipeline for a move or resize gesture, all in one place. `GanttShell`
// builds one `GesturePipeline` from its own primitives and calls straight through to it — this file
// replaces `#entriesForGesture`/`#draftFor`/`#resolveSnap`/`#commitGesture`/`#previewGesture`/
// `#applyPreview`, moved verbatim, no logic change. (Named `GesturePipeline`, not the plan's original
// "GestureHost" — "Host" is a retired word, D-S1.11-6/#64, for smuggling two concepts under one name.)

import { draftForMove, draftForResize } from '../layout/index.js';
import type { SnapUnit, TimeScale } from '../layout/index.js';
import type { Entry, EntryEdits, EntryId } from '../model/index.js';
import type { EventBus } from './event-bus.js';
import type { GanttEventMap } from './event-bus.js';
import type { Interactions } from './capability.js';
import { FrameScheduler } from './frame-scheduler.js';

/** Mirrors `gantt-shell.ts`'s own `EntryGesture` (S3.3/S3.4, D-S3-5) — `interaction/` builds only
 *  `'move'`/`'resize'`, structurally typed at the injection boundary. */
export type EntryGesture = { kind: 'move' } | { kind: 'resize'; edge: 'start' | 'end' };

export interface DraftOptions {
  suspendSnap?: boolean;
}

export interface GesturePipelineDeps {
  timeZone(): string;
  timeScale(): TimeScale;
  /** D-S3-12: resolves an unset/`'tick'` `ViewPreset.snap` against the current preset, Alt
   *  (`suspendSnap`) always winning — `#resolveSnap`, unchanged logic, moved here as a callback
   *  because only `GanttShell` holds the bound `Viewport`/`ViewPreset` this needs to read. */
  snap(suspendSnap: boolean | undefined): SnapUnit;
  entriesForGesture(grabbed: EntryId, capability: keyof Interactions): readonly Entry[];
  commitEntryEdits(edits: EntryEdits): boolean;
  emit: EventBus<GanttEventMap>['emit'];
  /** D-S3-18: coalesced on the caller's own rAF — moved verbatim from `#applyPreview`. */
  applyPreview(draft: EntryEdits | undefined): void;
}

/** Owns draft math, preview coalescing and the commit pipeline for move/resize gestures (D-GH-2,
 *  closes C1/C4). One `#commitGesture`-shaped fork on `gesture.kind`, isolated here instead of
 *  spread across shell state. */
export class GesturePipeline {
  #deps: GesturePipelineDeps;
  /** D-S3-18: the most recent in-flight draft a drag has proposed, applied on the next animation
   *  frame rather than synchronously on every pointermove — one paint per frame, not one per event. */
  #pendingPreviewDraft: EntryEdits | undefined;
  #previewFrame: FrameScheduler;

  constructor(deps: GesturePipelineDeps) {
    this.#deps = deps;
    this.#previewFrame = new FrameScheduler(() => {
      this.#deps.applyPreview(this.#pendingPreviewDraft);
    });
  }

  entriesForGesture(grabbedId: EntryId, capability: keyof Interactions = 'move'): readonly Entry[] {
    return this.#deps.entriesForGesture(grabbedId, capability);
  }

  draftFor(
    gesture: EntryGesture,
    entries: readonly Entry[],
    dxPx: number,
    options: DraftOptions | undefined,
  ): EntryEdits {
    const snap = this.#deps.snap(options?.suspendSnap);
    if (gesture.kind === 'resize') {
      return draftForResize({
        zone: this.#deps.timeZone(),
        scale: this.#deps.timeScale(),
        snap,
        entries,
        dxPx,
        edge: gesture.edge,
      });
    }
    return draftForMove({
      zone: this.#deps.timeZone(),
      scale: this.#deps.timeScale(),
      snap,
      entries,
      dxPx,
    });
  }

  /** `beforeEntryMove`/`beforeEntryResize` → one commit → `entryMove`/`entryResize` (D-S3-16,
   *  D-S3-22). `commitEntryEdits` does the actual write and folds a sync veto and a
   *  `MutationCancelledError` into one `false`. */
  commit(gesture: EntryGesture, draft: EntryEdits): Promise<boolean> {
    if (draft.size === 0) return Promise.resolve(false);
    const spans = [...draft].flatMap(([id, edit]) =>
      edit.start !== undefined && edit.end !== undefined
        ? [{ entry: id, start: edit.start, end: edit.end }]
        : [],
    );
    const grabbed = spans[0];
    if (!grabbed) return Promise.resolve(false);
    if (gesture.kind === 'resize') {
      const payload = { ...grabbed, entries: spans, edge: gesture.edge };
      if (this.#deps.emit('beforeEntryResize', payload) === false) return Promise.resolve(false);
      const committed = this.#deps.commitEntryEdits(draft);
      if (committed) this.#deps.emit('entryResize', payload);
      return Promise.resolve(committed);
    }
    const payload = { ...grabbed, entries: spans };
    if (this.#deps.emit('beforeEntryMove', payload) === false) return Promise.resolve(false);
    const committed = this.#deps.commitEntryEdits(draft);
    if (committed) this.#deps.emit('entryMove', payload);
    return Promise.resolve(committed);
  }

  /** D-S3-18: coalesces on the pipeline's own rAF — a drag's every pointermove replaces the pending
   *  draft, but only the last one before the next frame is ever painted. */
  preview(draft: EntryEdits | undefined): void {
    this.#pendingPreviewDraft = draft;
    this.#previewFrame.request();
  }
}
