// view/ — the gesture pipeline (D-GH-2): which entries a gesture moves, draft math
// (`layout/gesture-draft.ts`), preview rAF coalescing, and the commit pipeline for a move or resize
// gesture, all in one place. `GanttShell` builds one `GesturePipeline` from its own primitives; its
// only public entry point is `session()` (D-GH-1), which `interaction/entry-gestures.ts` drives
// through `EntryGestureContext`. (Named `GesturePipeline`, not the plan's original "GestureHost" —
// "Host" is a retired word, D-S1.11-6/#64, for smuggling two concepts under one name.)

import { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from '../layout/index.js';
import type { ItemPreview, SnapUnit, TimeScale, ViewPreset } from '../layout/index.js';
import type { Entry, EntryEdits, EntryId, ItemId, TimeSpan } from '../model/index.js';
import { itemId, segmentIndexOfItem } from '../model/index.js';
import { identityExtender, type EditExtender } from '../data/edit-extension.js';
import type { EventBus } from './event-bus.js';
import type { AsyncCancelableEvent, EntryMove, EntryResize, GanttEventMap } from './event-bus.js';
import type { Interactions } from './capability.js';
import { FrameScheduler } from './frame-scheduler.js';
import type { DraftOptions, EntryGesture, EntryGestureSession } from './entry-gesture-context.js';

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
  emit: EventBus<GanttEventMap, AsyncCancelableEvent>['emit'];
  /** D-S3-18, S3.6, P1: an installed extension hook, read for **preview only** — the real hook still
   *  runs again, for real, inside `data/transaction.ts`'s own commit; this never writes anything.
   *  `undefined` previews no ghost extras, same as `data/edit-extension.ts`'s `identityExtender` —
   *  which is also what a Dataset with no plugin installed hands over (S5.10, D-S5-23). */
  extend?: EditExtender;
  /** Committed entries `extend`'s `EditRequest.entries` argument reads — a snapshot map, built only
   *  when a preview frame actually calls `extend` (an installed extender may cascade to an entry
   *  outside the caller's own draft, so `entryById` alone cannot answer it). */
  allEntries?(): ReadonlyMap<EntryId, Entry>;
  /** S3.8, D-S3-15: locale for `cursorLabelForX` — the same value header ticks already use. */
  locale?(): Intl.LocalesArgument | undefined;
  /** D-S3-17/D-S3-18: one `InteractionState` write for the live or held preview and the pending-bar
   *  ids. `undefined` preview parks bars on committed geometry; `undefined` pendingItemIds clears the
   *  `pending` token. The arm lock itself is `session()` refusing while `#heldItemIds` is set.
   *  `cursor` is the Cursor line (D-S3-15); `undefined` parks it. */
  applyGestureState(
    preview: readonly ItemPreview[] | undefined,
    pendingItemIds: readonly ItemId[] | undefined,
    cursor?: { x: number; label: string },
  ): void;
}

/** The span `#stepPx` measures a snap unit against: the grabbed segment when one is grabbed and the
 *  entry actually has segments, the whole entry otherwise. */
function grabbedSpanOf(anchor: Entry, segmentIndex: number | undefined): TimeSpan {
  if (segmentIndex !== undefined && anchor.segments && anchor.segments.length > 0) {
    return anchor.segments[segmentIndex]!;
  }
  return anchor;
}

/** Owns entry resolution, draft math, preview coalescing and the commit pipeline for move/resize
 *  gestures (D-GH-2, closes C1/C4). One commit-shaped fork on `gesture.kind`, isolated here instead
 *  of spread across shell state. `session()` (D-GH-1) is the only public entry point — draft/commit/
 *  preview are the moves an armed session makes, not standalone calls a caller assembles itself. */
export class GesturePipeline {
  #deps: GesturePipelineDeps;
  /** D-S3-18: the most recent in-flight draft a drag has proposed, applied on the next animation
   *  frame rather than synchronously on every pointermove — one paint per frame, not one per event. */
  #scheduledDraft: EntryEdits | undefined;
  #previewFrame: FrameScheduler;
  /** D-S3-17: set for the duration of an unsettled `beforeEntryMove`/`beforeEntryResize` Promise;
   *  `session()` refuses to arm a new gesture while this is defined (the arm lock). Paint uses the
   *  same value as `pendingItemIds` in the one `applyGestureState` write. */
  #heldItemIds: readonly ItemId[] | undefined;
  /** S3.8, D-S3-15: content-x of the live pointer, coalesced with the preview on the same rAF. */
  #scheduledCursorX: number | undefined;

  constructor(deps: GesturePipelineDeps) {
    this.#deps = deps;
    this.#previewFrame = new FrameScheduler(() => {
      this.#deps.applyGestureState(
        this.#computePreview(this.#scheduledDraft),
        this.#heldItemIds,
        this.#computeCursor(),
      );
    });
  }

  /** D-S3-19/D-S3-22: arms a gesture on `grabbed` (+ capable co-selected entries) and returns a
   *  session closed over exactly those entries and this one `gesture` shape — `undefined` when
   *  nothing capable is grabbed, replacing the length check a caller used to make by hand against
   *  `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture, grabbedItemId?: ItemId): EntryGestureSession | undefined {
    if (this.#heldItemIds !== undefined) return undefined;
    const capability: keyof Interactions = gesture.kind === 'resize' ? 'resize' : 'move';
    const entries = this.#entriesForGesture(grabbed, capability);
    if (entries.length === 0) return undefined;
    const anchor = entries[0]!;
    const grabbedSegmentIndex =
      grabbedItemId !== undefined && anchor.segments !== undefined && anchor.segments.length > 0
        ? segmentIndexOfItem(grabbedItemId)
        : undefined;
    return {
      preview: (dxPx, options) => {
        this.#preview(this.#draftFor(gesture, entries, dxPx, options, grabbedSegmentIndex), options?.cursorX);
      },
      commit: (dxPx, options) => {
        return this.#commit(gesture, this.#draftFor(gesture, entries, dxPx, options, grabbedSegmentIndex));
      },
      nudge: (direction, options) => {
        const dxPx = this.#stepPx(gesture, anchor, options?.suspendSnap, grabbedSegmentIndex) * direction;
        return this.#commit(gesture, this.#draftFor(gesture, entries, dxPx, options, grabbedSegmentIndex));
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

  /** S3.5, D-S3-13: the px width of one resolved snap unit, anchored at the grabbed edge's own
   *  current instant — what `nudge()` feeds `#draftFor` as `dxPx` so a keyboard step reuses the exact
   *  same pixel-then-snap math a mouse drag's `commit()` already runs, instead of a second, parallel
   *  calendar-stepping path. Falls back to the preset's own tick when `suspendSnap` clears `snap` to
   *  `'none'` — a keyboard nudge always has *some* unit to size a step by, even unsnapped. */
  #stepPx(
    gesture: EntryGesture,
    anchor: Entry,
    suspendSnap: boolean | undefined,
    segmentIndex?: number,
  ): number {
    const snap = this.#resolveSnap(suspendSnap);
    const preset = this.#deps.preset();
    const unit = snap === 'none' ? preset.tickUnit : snap.unit;
    const increment = snap === 'none' ? preset.tickIncrement : snap.increment;
    const span = grabbedSpanOf(anchor, segmentIndex);
    const anchorInstant =
      gesture.kind === 'resize' ? (gesture.edge === 'start' ? span.start : span.end) : span.start;
    return this.#deps.timeScale().widthForDuration({ unit, value: increment }, anchorInstant);
  }

  #draftFor(
    gesture: EntryGesture,
    entries: readonly Entry[],
    dxPx: number,
    options: DraftOptions | undefined,
    grabbedSegmentIndex?: number,
  ): EntryEdits {
    const snap = this.#resolveSnap(options?.suspendSnap);
    const base = {
      zone: this.#deps.timeZone(),
      scale: this.#deps.timeScale(),
      snap,
      entries,
      dxPx,
      ...(grabbedSegmentIndex !== undefined ? { grabbedSegmentIndex } : {}),
    };
    if (gesture.kind === 'resize') {
      return draftForResize({ ...base, edge: gesture.edge });
    }
    return draftForMove(base);
  }

  /** `beforeEntryMove`/`beforeEntryResize` → one commit → `entryMove`/`entryResize` (D-S3-16,
   *  D-S3-22). Event names come from `gesture.kind` once; `#settle` is the one veto/write path.
   *  `commitEntryEdits` does the actual write and folds a sync veto and a `MutationCancelledError`
   *  into one `false`. A `before*` handler that returns a Promise instead of resolving synchronously
   *  holds the **commit draft** as preview and marks the bars `pending` until it settles (D-S3-17). */
  #commit(gesture: EntryGesture, draft: EntryEdits): Promise<boolean> {
    this.#scheduledCursorX = undefined;
    if (draft.size === 0) return Promise.resolve(false);
    const spans = [...draft].flatMap(([id, edit]) =>
      edit.start !== undefined && edit.end !== undefined
        ? [{ entry: id, start: edit.start, end: edit.end }]
        : [],
    );
    const grabbed = spans[0];
    if (!grabbed) return Promise.resolve(false);
    const itemIds = spans.map((span) => itemId(span.entry));
    const event =
      gesture.kind === 'resize'
        ? {
            before: 'beforeEntryResize' as const,
            after: 'entryResize' as const,
            payload: { ...grabbed, entries: spans, edge: gesture.edge } satisfies EntryResize,
          }
        : {
            before: 'beforeEntryMove' as const,
            after: 'entryMove' as const,
            payload: { ...grabbed, entries: spans } satisfies EntryMove,
          };
    const before =
      event.before === 'beforeEntryResize'
        ? this.#deps.emit(event.before, event.payload)
        : this.#deps.emit(event.before, event.payload);
    return this.#settle(before, draft, itemIds, () => {
      const committed = this.#deps.commitEntryEdits(draft);
      if (committed) {
        if (event.after === 'entryResize') this.#deps.emit(event.after, event.payload);
        else this.#deps.emit(event.after, event.payload);
      }
      return committed;
    });
  }

  /** Sync `true`/`false` still finish in this tick (same as before async veto). An unsettled Promise
   *  paints the commit draft and the `pending` token together, then `finish`s only after a `true`
   *  settle — `false` clears the hold and writes nothing. */
  #settle(
    result: boolean | Promise<boolean>,
    draft: EntryEdits,
    itemIds: readonly ItemId[],
    finish: () => boolean,
  ): Promise<boolean> {
    if (result === false) {
      this.#preview(undefined);
      return Promise.resolve(false);
    }
    if (result === true) {
      const committed = finish();
      this.#preview(undefined);
      return Promise.resolve(committed);
    }
    return this.#awaitVeto(result, itemIds, draft).then((allowed) => {
      if (allowed) {
        const committed = finish();
        this.#releaseHold();
        return committed;
      }
      this.#releaseHold();
      return false;
    });
  }

  /** D-S3-17: only reached for a `before*` handler's unsettled Promise. Holds the commit draft (not
   *  the last unsnapped pointer preview, not the stored origin) and arm-locks `session()` until
   *  `result` settles. Paint is one immediate `applyGestureState`, not a rAF-cleared preview plus a
   *  separate pending write. */
  #awaitVeto(result: Promise<boolean>, itemIds: readonly ItemId[], draft: EntryEdits): Promise<boolean> {
    this.#heldItemIds = itemIds;
    this.#scheduledDraft = draft;
    this.#previewFrame.flush();
    return result.then(
      (allowed) => allowed,
      () => false,
    );
  }

  #releaseHold(): void {
    this.#heldItemIds = undefined;
    this.#scheduledDraft = undefined;
    this.#previewFrame.flush();
  }

  /** D-S3-18: coalesces on the pipeline's own rAF — a drag's every pointermove replaces the scheduled
   *  draft, but only the last one before the next frame is ever painted. */
  #preview(draft: EntryEdits | undefined, cursorX?: number): void {
    this.#scheduledDraft = draft;
    this.#scheduledCursorX = draft === undefined ? undefined : cursorX;
    this.#previewFrame.request();
  }

  /** D-S3-15: label snaps even while the bar preview is unsnapped (D-S3-12). */
  #computeCursor(): { x: number; label: string } | undefined {
    if (this.#scheduledCursorX === undefined) return undefined;
    return {
      x: this.#scheduledCursorX,
      label: cursorLabelForX(
        this.#scheduledCursorX,
        this.#deps.timeScale(),
        this.#resolveSnap(false),
        this.#deps.locale?.(),
      ),
    };
  }

  #computePreview(draft: EntryEdits | undefined): readonly ItemPreview[] | undefined {
    if (!draft || draft.size === 0) return undefined;
    const extra = this.#extraFor(draft);
    const entries: Entry[] = [];
    const seen = new Set<EntryId>();
    const pushEntry = (id: EntryId): void => {
      if (seen.has(id)) return;
      const entry = this.#deps.entryById(id);
      if (entry) {
        entries.push(entry);
        seen.add(id);
      }
    };
    for (const id of draft.keys()) pushEntry(id);
    for (const id of extra.keys()) pushEntry(id);
    return previewOffsets({
      proposed: draft,
      extra,
      entries,
      scale: this.#deps.timeScale(),
    });
  }

  /** D-S3-18, S3.6: `extra = extend({ entries: committed, proposed: draft })` — the exact pseudocode
   *  the decision names, run on the pipeline's own rAF (`#preview`'s caller) rather than on every
   *  `pointermove`. No installed hook (P1's default): `identityExtender`, so `previewOffsets` paints
   *  no ghost — behaviorally identical to before this hook existed. */
  #extraFor(draft: EntryEdits): EntryEdits {
    const entries = this.#deps.allEntries?.() ?? new Map<EntryId, Entry>();
    return (this.#deps.extend ?? identityExtender)({ entries, proposed: draft });
  }
}
