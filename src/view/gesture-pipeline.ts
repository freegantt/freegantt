// view/ — the gesture pipeline (D-GH-2): which entries a gesture moves, draft math
// (`layout/gesture-draft.ts`), preview rAF coalescing, and the commit pipeline for a move or resize
// gesture, all in one place. `GanttShell` builds one `GesturePipeline` from its own primitives; its
// only public entry point is `session()` (D-GH-1), which `interaction/entry-gestures.ts` drives
// through `EntryGestureContext`. (Named `GesturePipeline`, not the plan's original "GestureHost" —
// "Host" is a retired word, D-S1.11-6/#64, for smuggling two concepts under one name.)

import { draftForMove, draftForResize, previewOffsets } from '../layout/index.js';
import type { ItemPreview, SnapUnit, TimeScale, ViewPreset } from '../layout/index.js';
import type { Entry, EntryEdits, EntryId } from '../model/index.js';
import type { EventBus } from './event-bus.js';
import type { GanttEventMap } from './event-bus.js';
import type { Interactions } from './capability.js';
import { FrameScheduler } from './frame-scheduler.js';
import type { DraftOptions, EntryGesture, EntryGestureSession } from './entry-gesture-context.js';

/** No cascade — the pipeline's own `previewOffsets` call contrasts a real gesture draft against
 *  (S3.6 wires an extender's actual extras in here). */
const EMPTY_EDITS: EntryEdits = Object.freeze(new Map());

export interface GesturePipelineDeps {
  timeZone(): string;
  timeScale(): TimeScale;
  preset(): ViewPreset;
  selection(): readonly EntryId[];
  entryById(id: EntryId): Entry | undefined;
  /** One resolution (I14, D-S3-9) — `GanttShell#canGesture`, the same answer the pointer-selection
   *  path and the affordance ids resolve through, never re-derived here. */
  canGesture(capability: keyof Interactions, id: EntryId): boolean;
  commitEntryEdits(edits: EntryEdits): boolean;
  emit: EventBus<GanttEventMap>['emit'];
  /** D-S3-18: coalesced on the pipeline's own rAF. `undefined` clears whatever was previewing. */
  applyPreview(preview: readonly ItemPreview[] | undefined): void;
}

/** Owns entry resolution, draft math, preview coalescing and the commit pipeline for move/resize
 *  gestures (D-GH-2, closes C1/C4). One commit-shaped fork on `gesture.kind`, isolated here instead
 *  of spread across shell state. `session()` (D-GH-1) is the only public entry point — draft/commit/
 *  preview are the moves an armed session makes, not standalone calls a caller assembles itself. */
export class GesturePipeline {
  #deps: GesturePipelineDeps;
  /** D-S3-18: the most recent in-flight draft a drag has proposed, applied on the next animation
   *  frame rather than synchronously on every pointermove — one paint per frame, not one per event. */
  #pendingPreviewDraft: EntryEdits | undefined;
  #previewFrame: FrameScheduler;

  constructor(deps: GesturePipelineDeps) {
    this.#deps = deps;
    this.#previewFrame = new FrameScheduler(() => {
      this.#deps.applyPreview(this.#computePreview(this.#pendingPreviewDraft));
    });
  }

  /** D-S3-19/D-S3-22: arms a gesture on `grabbed` (+ capable co-selected entries) and returns a
   *  session closed over exactly those entries and this one `gesture` shape — `undefined` when
   *  nothing capable is grabbed, replacing the length check a caller used to make by hand against
   *  `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture): EntryGestureSession | undefined {
    const capability: keyof Interactions = gesture.kind === 'resize' ? 'resize' : 'move';
    const entries = this.#entriesForGesture(grabbed, capability);
    if (entries.length === 0) return undefined;
    return {
      preview: (dxPx, options) => {
        this.#preview(this.#draftFor(gesture, entries, dxPx, options));
      },
      commit: (dxPx, options) => {
        const draft = this.#draftFor(gesture, entries, dxPx, options);
        this.#preview(undefined);
        return this.#commit(gesture, draft);
      },
      cancel: () => {
        this.#preview(undefined);
      },
    };
  }

  /** D-S3-19: just the grabbed entry when it is not part of a multi-entry selection; else every
   *  *capable* selected entry, grabbed first (D-S3-22) — an incapable one is skipped, not blocking. */
  #entriesForGesture(grabbedId: EntryId, capability: keyof Interactions): readonly Entry[] {
    const selection = this.#deps.selection();
    const inMultiSelection = selection.includes(grabbedId) && selection.length > 1;
    const candidateIds = inMultiSelection ? selection : [grabbedId];
    const entries: Entry[] = [];
    const seen = new Set<EntryId>();
    const pushCapable = (id: EntryId): void => {
      if (seen.has(id)) return;
      const entry = this.#deps.entryById(id);
      if (entry && this.#deps.canGesture(capability, id)) {
        entries.push(entry);
        seen.add(id);
      }
    };
    pushCapable(grabbedId);
    for (const id of candidateIds) pushCapable(id);
    return entries;
  }

  /** D-S3-12: an unset/`'tick'` `ViewPreset.snap` resolves to the current preset's own tick unit;
   *  Alt (`suspendSnap`) always wins and falls back to raw millisecond placement. */
  #resolveSnap(suspendSnap: boolean | undefined): SnapUnit {
    const preset = this.#deps.preset();
    if (suspendSnap) return 'none';
    const snap = preset.snap ?? 'tick';
    if (snap === 'none') return 'none';
    if (snap === 'tick') {
      return { unit: preset.tickUnit, increment: preset.tickIncrement };
    }
    return snap;
  }

  #draftFor(
    gesture: EntryGesture,
    entries: readonly Entry[],
    dxPx: number,
    options: DraftOptions | undefined,
  ): EntryEdits {
    const snap = this.#resolveSnap(options?.suspendSnap);
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
  #commit(gesture: EntryGesture, draft: EntryEdits): Promise<boolean> {
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
  #preview(draft: EntryEdits | undefined): void {
    this.#pendingPreviewDraft = draft;
    this.#previewFrame.request();
  }

  #computePreview(draft: EntryEdits | undefined): readonly ItemPreview[] | undefined {
    if (!draft || draft.size === 0) return undefined;
    const entries: Entry[] = [];
    for (const id of draft.keys()) {
      const entry = this.#deps.entryById(id);
      if (entry) entries.push(entry);
    }
    return previewOffsets({
      proposed: draft,
      extra: EMPTY_EDITS,
      entries,
      scale: this.#deps.timeScale(),
    });
  }
}
