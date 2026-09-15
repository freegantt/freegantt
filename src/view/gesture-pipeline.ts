// view/ — the gesture pipeline (D-GH-2): which entries a gesture moves, draft math
// (`layout/gesture-draft.ts`), preview rAF coalescing, and the commit pipeline for a move or resize
// gesture, all in one place. `GanttShell` builds one `GesturePipeline` from its own primitives; its
// only public entry point is `session()` (D-GH-1), which `interaction/entry-gestures.ts` drives
// through `EntryGestureContext`. (Named `GesturePipeline`, not the plan's original "GestureHost" —
// "Host" is a retired word, D-S1.11-6/#64, for smuggling two concepts under one name.)

import { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from '../layout/index.js';
import type { ItemPreview, SnapSetting, SnapUnit, TimeScale, ViewPreset } from '../layout/index.js';
import type {
  Entry,
  StoredEntry,
  EntryId,
  GestureDroppedReason,
  Instant,
  ItemId,
  ProposedEdit,
  RaiseError,
  Refusable,
  SegmentId,
  ProposedEdits,
} from '../model/index.js';
import { EntryNotFoundError, entryId, itemId, spansTime } from '../model/index.js';
import { EMPTY_ENTRY_IDS } from '../data/edit-extension.js';
import type { EditRequest } from '../data/edit-extension.js';
import type { BeforeGestureEvent } from '../data/error-reporting.js';
import {
  buildCommitFaultReport,
  buildGestureDroppedReport,
  buildRefusalReport,
} from '../data/error-reporting.js';
import { isEnvelopeRefusal, reconcileExtenderEditsForPreview } from '../data/entry-reader.js';
import { effectiveEntriesFor, entryAfterEdits } from '../data/entry-tree.js';
import type { EventBus } from './event-bus.js';
import { RefusalNote } from './event-bus.js';
import type {
  AsyncCancelableEvent,
  EntryMove,
  EntryResize,
  GanttEventMap,
  ProposedDates,
  ProposedSpan,
} from './event-bus.js';
import type { GestureCapability } from './capability.js';
import { FrameScheduler } from './frame-scheduler.js';
import type { DraftOptions, EntryGesture, EntryGestureSession } from './entry-gesture-context.js';

/** No seam wired means no ghost — one frozen empty map, so a preview frame with no plugin installed
 *  allocates nothing (I5). */
const NO_EXTRA_EDITS: ProposedEdits = Object.freeze(new Map());
/** Every gesture but a parent bar's drag writes each bar it paints, so this is the usual answer. */
const NOTHING_PAINTED_ONLY: ReadonlySet<EntryId> = Object.freeze(new Set<EntryId>());

export interface GesturePipelineDeps {
  timeZone(): string;
  timeScale(): TimeScale;
  preset(): ViewPreset;
  /** D-S3-24: what this Gantt snaps to — `GanttShell` has already resolved its own `snap` over the
   *  showing preset's. `'tick'` still arrives unresolved: only a gesture knows which preset is
   *  measuring it. */
  snap(): SnapSetting;
  /** The Selection (#212, ADR 0010) — the same Segment ids `render/dom` paints from. A draft reads
   *  it, so a gesture acts on exactly the bars that paint selected, never more. */
  selectedSegmentIds(): readonly SegmentId[];
  /** The Entries those Segments belong to, deduped, in row order — one projection, resolved by the
   *  shell, so this file never turns a Segment into an Entry itself. */
  selectedEntryIds(): readonly EntryId[];
  entryById(id: EntryId): Entry | undefined;
  /** One resolution (I14, D-S3-9) — `GanttShell#canGesture`, the same answer the pointer-selection
   *  path and the affordance ids resolve through, never re-derived here. `edge` narrows a `'resize'`
   *  question to one handle (#142); every other capability ignores it. */
  canGesture(capability: GestureCapability, id: EntryId, edge?: 'start' | 'end'): boolean;
  /** ADR 0013: which Entries a move of this bar writes — `Capabilities.entriesMovedBy`, resolved by
   *  the shell like every other capability answer (I14). An ordinary bar answers with itself. A
   *  parent bar answers with the dated descendants below it, because its own dates roll up. */
  entriesMovedBy(entry: Entry): readonly Entry[];
  commitEntryEdits(edits: ProposedEdits): boolean;
  emit: EventBus<GanttEventMap, AsyncCancelableEvent>['emit'];
  /** S5.12, D-S5-40: a vetoed gesture still draws nothing and still throws nothing, and now it also
   *  reports. `plans/02` §3's "a vetoed gesture is silent" stays true of the *UI*. */
  raiseError: RaiseError;
  /** D-S3-18, S3.6, P1: an installed extension hook, read for **preview only** — the real hook still
   *  runs again, for real, inside `data/transaction.ts`'s own commit; this never writes anything.
   *  `undefined` previews no ghost extras, same as `data/edit-extension.ts`'s `identityExtender` —
   *  which is also what a Dataset with no plugin installed hands over (S5.10, D-S5-23). Renamed from
   *  `extend` to `extraEditsFor` at #209 Q5, alongside the seam it mirrors (`api/Dataset`'s own). */
  extraEditsFor?: (request: EditRequest) => ProposedEdits;
  /** What `extraEditsFor`'s `EditRequest.entries` reads — the *committed* Entries keyed by id, never
   *  the in-flight draft (D-S5-45). An installed extender may cascade to an Entry outside the
   *  caller's own draft, so `entryById` alone cannot answer it.
   *
   *  `#extraFor` calls this once per rAF frame for the whole length of a drag, so the supplier owes
   *  it a cached map and not a fresh copy of the Dataset (I5). `GanttShell` keys its cache on
   *  `datasetRevision`, which rises once per committed change.
   *
   *  Required, not optional (#273): `#measuredFrom` reads it to fingerprint the rows a held draft was
   *  built from, whether or not an `extraEditsFor` hook is installed. Left optional, a deps bag that
   *  forgot to wire it would make that guard silently no-op — a test double that skips it is a test
   *  that stops proving the guard exists. */
  committedEntriesById(): ReadonlyMap<EntryId, StoredEntry>;
  /** S3.8, D-S3-15: locale for `cursorLabelForX` — the same value header ticks already use. */
  locale?(): Intl.LocalesArgument | undefined;
  /** D-S3-17/D-S3-18: one `InteractionState` write for the live or held preview and the pending-bar
   *  ids. `undefined` preview parks bars on committed geometry; `undefined` pendingItemIds clears the
   *  `pending` token. There is no arm lock (#272/#273 — `session()` supersedes a held gesture instead
   *  of refusing to arm over it; `#held` is a fingerprint, not a gate). `cursor` is the Cursor line
   *  (D-S3-15); `undefined` parks it. */
  applyGestureState(
    preview: readonly ItemPreview[] | undefined,
    pendingItemIds: readonly ItemId[] | undefined,
    cursor?: { x: number; label: string },
  ): void;
}

/** What one gesture proposes, ready to write and ready to paint.
 *
 *  The two differ for one gesture only. A parent bar's drag writes the dated descendants below the
 *  bar, and never the bar's own dates, which roll up from them (ADR 0013). So the parent sits in
 *  `paints`, where it follows the pointer, and stays out of `writes`. Every other gesture writes
 *  exactly what it paints, and both fields hold one and the same map. */
interface GestureProposal {
  readonly writes: ProposedEdits;
  readonly paints: ProposedEdits;
  /** The bar the user grabbed — `event.entry`, and where the payload's own span comes from. It is
   *  always a key of `paints`. */
  readonly grabbed: EntryId;
}

/** The dates one edit proposes for one entry — what `event.entries` carries. A date the edit leaves
 *  alone stays absent here: a half-dated descendant moves the date it holds and gains no second one
 *  (ADR 0013, Q9). */
function proposedDatesOf(entry: EntryId, edit: ProposedEdit): ProposedDates {
  const dates: { entry: EntryId; start?: Instant; end?: Instant } = { entry };
  if (edit.start !== undefined) dates.start = edit.start;
  if (edit.end !== undefined) dates.end = edit.end;
  return dates;
}

/** What one refused gesture reports — built once in `#commit`, where the gesture's own event name is
 *  already in hand, and read by `#settle` on whichever of its two veto paths runs.
 *
 *  `note` rather than a finished message, because the reason arrives after this is built: a sync veto
 *  states it during the emit, an async one states it before it resolves (#210). `#reportRefusal`
 *  hands this straight to `buildRefusalReport` (`data/error-reporting.ts`), which derives the
 *  sentence's noun *and* the report's code from `event` alone (#377 "Decision taken") — that is what
 *  lets this carry no separate `kind`, and no `code` of its own to lend to the wrong veto. */
interface GestureRefusal {
  /** The `before*` name whose handler refused. */
  event: BeforeGestureEvent;
  entryId: EntryId;
  note: RefusalNote;
}

/** One gesture waiting on a `before*` Promise, stamped with the pipeline's own generation counter at
 *  the moment the hold begins (#272, #273). `#settle`'s async branch reads `generation` back against
 *  `#generation` before it acts — unequal means `session()` superseded it, `discardHeldGesture()`
 *  discarded it, or the pipeline was destroyed, and the settle does nothing at all: no paint, no
 *  write, no report (whichever of those already ran when the hold ended owns that job). */
interface HeldGesture {
  readonly generation: number;
  readonly itemIds: readonly ItemId[];
  readonly proposal: GestureProposal;
  readonly refusal: GestureRefusal;
  /** Part 3 (#273): the stored row each id in `proposal.paints` was measured from, snapshotted the
   *  moment the hold begins. `#settle` compares this against the current `committedEntriesById()`
   *  before it writes — object identity, not a value compare, because `entry-store.ts` replaces a
   *  row's whole object on every committed field write to it (ADR 0017), so an unrelated field's
   *  write already hands back a new object. `undefined` for an id the store held nothing for at hold
   *  time — the same value a removal leaves behind. */
  readonly measuredFrom: ReadonlyMap<EntryId, StoredEntry | undefined>;
}

/** Owns entry resolution, draft math, preview coalescing and the commit pipeline for move/resize
 *  gestures (D-GH-2, closes C1/C4). One commit-shaped fork on `gesture.kind`, isolated here instead
 *  of spread across shell state. `session()` (D-GH-1) is the only public entry point — draft/commit/
 *  preview are the moves an armed session makes, not standalone calls a caller assembles itself. */
export class GesturePipeline {
  #deps: GesturePipelineDeps;
  /** D-S3-18: the most recent in-flight draft a drag has proposed, applied on the next animation
   *  frame rather than synchronously on every pointermove — one paint per frame, not one per event. */
  #scheduledProposal: GestureProposal | undefined;
  #previewFrame: FrameScheduler;
  /** #272/#273: one clock, ticked once per held gesture (`#awaitVeto`), never reset. `#held.generation`
   *  is that gesture's stamp; `#settle`'s async branch only acts when the two still match, which is
   *  what makes `session()` superseding the hold (instead of refusing to arm over it) safe — a stale
   *  settle can never write, paint, or report over a gesture that replaced it. */
  #generation = 0;
  /** D-S3-17, amended #272/#273: the one held gesture, if any — no arm lock any more (see `session()`
   *  and `discardHeldGesture()`), just a fingerprint a late settle checks itself against. */
  #held: HeldGesture | undefined;
  /** S3.8, D-S3-15: content-x of the live pointer, coalesced with the preview on the same rAF. */
  #scheduledCursorX: number | undefined;

  constructor(deps: GesturePipelineDeps) {
    this.#deps = deps;
    this.#previewFrame = new FrameScheduler(() => {
      this.#deps.applyGestureState(
        this.#computePreview(this.#scheduledProposal),
        this.#held?.itemIds,
        this.#computeCursor(),
      );
    });
  }

  /** D-S3-19/D-S3-22: arms a gesture on `grabbed` (+ capable co-selected entries) and returns a
   *  session closed over exactly those entries and this one `gesture` shape — `undefined` when
   *  nothing capable is grabbed, replacing the length check a caller used to make by hand against
   *  `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture): EntryGestureSession | undefined {
    // #272/#273: a new gesture supersedes a held one instead of refusing to arm over it — the old
    // "arm lock" let one hung handler on one bar refuse every gesture in the Gantt, forever.
    this.#dropHeldGesture('superseded');
    const capability: GestureCapability = gesture.kind === 'resize' ? 'resize' : 'move';
    const edge = gesture.kind === 'resize' ? gesture.edge : undefined;
    const bars = this.#entriesForGesture(grabbed, capability, edge);
    if (bars.length === 0) return undefined;
    const anchor = bars[0]!;
    const { entries, paintedOnly } = this.#draftedEntries(bars, capability);
    // Review finding 9: the Selection cannot change mid-drag — the arming grab is the last write it
    // sees before `commit`/`cancel` ends the gesture — so this `Set` is built once here, not once per
    // rAF inside `#draftFor`. A select-all held through a drag no longer allocates a Set of every
    // Segment in the Dataset sixty times a second.
    const selectedSegmentIds = new Set(this.#deps.selectedSegmentIds());
    const proposalFor = (dxPx: number, options: DraftOptions | undefined): GestureProposal =>
      this.#proposalFor({
        gesture,
        entries,
        paintedOnly,
        grabbed: anchor.id,
        dxPx,
        options,
        selectedSegmentIds,
      });
    return {
      preview: (dxPx, options) => {
        this.#preview(proposalFor(dxPx, options), options?.cursorX);
      },
      commit: (dxPx, options) => {
        return this.#commit(gesture, proposalFor(dxPx, options));
      },
      nudge: (direction, options) => {
        const dxPx = this.#stepPx(gesture, anchor, options?.suspendSnap) * direction;
        return this.#commit(gesture, proposalFor(dxPx, options));
      },
      cancel: () => {
        this.#preview(undefined);
      },
    };
  }

  /** D-S3-19: just the grabbed entry when it is not part of a multi-entry selection; else every
   *  *capable* selected entry, grabbed first (D-S3-22) — an incapable one is skipped, not blocking.
   *  `edge` (#142) is the grabbed handle on a resize: a multi-select drag on the `end` handle pulls
   *  in only the co-selected entries whose own `end` is capable, so a Field closed on one entry never
   *  blocks the whole drag — it just sits out of it. */
  #entriesForGesture(
    grabbedId: EntryId,
    capability: GestureCapability,
    edge?: 'start' | 'end',
  ): readonly Entry[] {
    const selection = this.#deps.selectedEntryIds();
    const inMultiSelection = selection.includes(grabbedId) && selection.length > 1;
    const candidateIds = inMultiSelection ? selection : [grabbedId];
    const entries: Entry[] = [];
    const seen = new Set<EntryId>();
    const pushCapable = (id: EntryId): void => {
      if (seen.has(id)) return;
      const entry = this.#deps.entryById(id);
      if (entry && this.#deps.canGesture(capability, id, edge)) {
        entries.push(entry);
        seen.add(id);
      }
    };
    pushCapable(grabbedId);
    for (const id of candidateIds) pushCapable(id);
    return entries;
  }

  /** D-S3-12: a `'tick'` snap resolves to the current preset's own tick unit; Alt (`suspendSnap`)
   *  always wins and falls back to raw millisecond placement. D-S3-24: which setting arrives here —
   *  the Gantt's own or the showing preset's — is `GanttShell`'s answer, not this file's. */
  #resolveSnap(suspendSnap: boolean | undefined): SnapUnit {
    if (suspendSnap) return 'none';
    const snap = this.#deps.snap();
    if (snap === 'none') return 'none';
    if (snap === 'tick') {
      const preset = this.#deps.preset();
      return { unit: preset.tickUnit, increment: preset.tickIncrement };
    }
    return snap;
  }

  /** S3.5, D-S3-13: the px width of one resolved snap unit, anchored at the grabbed edge's own
   *  current instant — what `nudge()` feeds `#draftFor` as `dxPx` so a keyboard step reuses the exact
   *  same pixel-then-snap math a mouse drag's `commit()` already runs, instead of a second, parallel
   *  calendar-stepping path. Falls back to the preset's own tick when `suspendSnap` clears `snap` to
   *  `'none'` — a keyboard nudge always has *some* unit to size a step by, even unsnapped. */
  #stepPx(gesture: EntryGesture, anchor: Entry, suspendSnap: boolean | undefined): number {
    const snap = this.#resolveSnap(suspendSnap);
    const preset = this.#deps.preset();
    const unit = snap === 'none' ? preset.tickUnit : snap.unit;
    const increment = snap === 'none' ? preset.tickIncrement : snap.increment;
    // A gesture exists only for an Entry with a grip to grab, which means it already spans
    // (`spansTime`, ADR 0012). This was a cast until Q5 gave the rule one home; it now asks the
    // question. A non-spanning anchor sizes its step at zero, which moves nothing — the cast sized
    // it at `NaN`, and nothing on any reachable path produces either (J32 in BUILD-LOG.md).
    if (!spansTime(anchor)) return 0;
    const anchorInstant = gesture.kind === 'resize' && gesture.edge === 'end' ? anchor.end : anchor.start;
    return this.#deps.timeScale().widthForDuration({ unit, value: increment }, anchorInstant);
  }

  /** Which entries the draft math works over, grabbed bar first, and which of them the gesture paints
   *  without writing.
   *
   *  A parent bar is the one entry a gesture moves without writing (ADR 0013). Its `start`/`end` roll
   *  up from its children, so its drag translates the dated descendants below it, and the Rollup
   *  moves the parent's own envelope at commit. It still has to follow the pointer while the drag is
   *  live, so it travels in the draft and drops out of the map that commits.
   *
   *  A resize reaches none of this: a parent never passes `can('resize', …)`, because one edge of a
   *  derived envelope names no descendant to resize. */
  #draftedEntries(
    bars: readonly Entry[],
    capability: GestureCapability,
  ): { entries: readonly Entry[]; paintedOnly: ReadonlySet<EntryId> } {
    if (capability !== 'move') return { entries: bars, paintedOnly: NOTHING_PAINTED_ONLY };
    const entries: Entry[] = [];
    const seen = new Set<EntryId>();
    const paintedOnly = new Set<EntryId>();
    const push = (entry: Entry): void => {
      if (seen.has(entry.id)) return;
      entries.push(entry);
      seen.add(entry.id);
    };
    for (const bar of bars) {
      const moved = this.#deps.entriesMovedBy(bar);
      if (!moved.some((entry) => entry.id === bar.id)) paintedOnly.add(bar.id);
      push(bar);
      for (const entry of moved) push(entry);
    }
    return { entries, paintedOnly };
  }

  #proposalFor(input: {
    gesture: EntryGesture;
    entries: readonly Entry[];
    paintedOnly: ReadonlySet<EntryId>;
    grabbed: EntryId;
    dxPx: number;
    options: DraftOptions | undefined;
    selectedSegmentIds: ReadonlySet<SegmentId>;
  }): GestureProposal {
    const { gesture, entries, paintedOnly, grabbed, dxPx, options, selectedSegmentIds } = input;
    const base = {
      zone: this.#deps.timeZone(),
      scale: this.#deps.timeScale(),
      snap: this.#resolveSnap(options?.suspendSnap),
      entries,
      dxPx,
      selectedSegmentIds,
    };
    const paints =
      gesture.kind === 'resize' ? draftForResize({ ...base, edge: gesture.edge }) : draftForMove(base);
    if (paintedOnly.size === 0) return { writes: paints, paints, grabbed };
    const writes = new Map(paints);
    for (const id of paintedOnly) writes.delete(id);
    return { writes, paints, grabbed };
  }

  /** `beforeEntryMove`/`beforeEntryResize` → one commit → `entryMove`/`entryResize` (D-S3-16,
   *  D-S3-22). Event names come from `gesture.kind` once; `#settle` is the one veto/write path.
   *  `commitEntryEdits` does the actual write and folds a sync veto and a `MutationCancelledError`
   *  into one `false`. A `before*` handler that returns a Promise instead of resolving synchronously
   *  holds the **commit draft** as preview and marks the bars `pending` until it settles (D-S3-17). */
  #commit(gesture: EntryGesture, proposal: GestureProposal): Promise<boolean> {
    this.#scheduledCursorX = undefined;
    if (proposal.writes.size === 0) return Promise.resolve(false);
    // The grabbed bar draws, so it spans (`spansTime`, ADR 0012) — a parent bar included, whose
    // envelope this reads off the paint side because the write side never holds it (ADR 0013).
    const grabbedEdit = proposal.paints.get(proposal.grabbed);
    if (grabbedEdit === undefined || !spansTime(grabbedEdit)) return Promise.resolve(false);
    const grabbed: ProposedSpan = {
      entry: proposal.grabbed,
      start: grabbedEdit.start,
      end: grabbedEdit.end,
    };
    const spans = [...proposal.writes].map(([id, edit]) => proposedDatesOf(id, edit));
    const itemIds = [...proposal.paints.keys()].map((id) => itemId(id));
    // #210: the same note goes out on the `before*` payload and comes back in the refusal, so a
    // handler's `refuse('…')` reaches the report core raises for its veto. `Refusable` belongs to
    // the `before*` payload alone (event-bus.ts's map already types `entryMove`/`entryResize`
    // without it) — the after-emit below gets its own payload, built from the same base but never
    // carrying `refuse`.
    const note = new RefusalNote();
    const event =
      gesture.kind === 'resize'
        ? {
            before: 'beforeEntryResize' as const,
            after: 'entryResize' as const,
            afterPayload: { ...grabbed, entries: spans, edge: gesture.edge } satisfies EntryResize,
          }
        : {
            before: 'beforeEntryMove' as const,
            after: 'entryMove' as const,
            afterPayload: { ...grabbed, entries: spans } satisfies EntryMove,
          };
    // One payload shape, spelled once. The `before*` copy adds the note; nothing removes it again.
    const beforePayload = { ...event.afterPayload, refuse: note.refuse } satisfies Refusable;
    const before = this.#deps.emit(event.before, beforePayload);
    const refusal: GestureRefusal = {
      event: event.before,
      entryId: grabbed.entry,
      note,
    };
    return this.#settle(before, proposal, itemIds, refusal, () => {
      const committed = this.#deps.commitEntryEdits(proposal.writes);
      if (committed) {
        this.#deps.emit(event.after, event.afterPayload);
      }
      return committed;
    });
  }

  /** Sync `true`/`false` still finish in this tick (same as before async veto). An unsettled Promise
   *  paints the commit draft and the `pending` token together, then `finish`s only after a `true`
   *  settle — `false` clears the hold and writes nothing. */
  #settle(
    result: boolean | Promise<boolean>,
    proposal: GestureProposal,
    itemIds: readonly ItemId[],
    refusal: GestureRefusal,
    finish: () => boolean,
  ): Promise<boolean> {
    if (result === false) {
      this.#preview(undefined);
      this.#reportRefusal(refusal);
      return Promise.resolve(false);
    }
    if (result === true) {
      const committed = this.#finishCommit(finish, refusal);
      this.#preview(undefined);
      return Promise.resolve(committed);
    }
    const generation = this.#awaitVeto(itemIds, proposal, refusal);
    return result
      .then(
        (allowed) => allowed,
        () => false,
      )
      .then((allowed) => {
        // #272/#273: the hold this settle belongs to may already be gone — superseded by a later
        // `session()`, discarded by Escape or `destroy()`, or already settled itself. Whichever of
        // those ran already did this settle's job (report, release, or nothing at all), so a stale
        // settle does nothing here: no paint, no write, no second report.
        const held = this.#held;
        if (held === undefined || held.generation !== generation) return false;
        if (!allowed) {
          this.#releaseHold();
          this.#reportRefusal(refusal);
          return false;
        }
        if (this.#rowsChangedSince(held.measuredFrom)) {
          // Part 3 (#273): the settle is honest, but the rows the draft was measured from are not the
          // rows in the store any more. Writing now would silently overwrite whatever changed them —
          // last writer wins, with no conflict and no report. Refuse instead.
          this.#reportGestureDropped(refusal.entryId, refusal.event, 'data-changed');
          this.#releaseHold();
          return false;
        }
        try {
          return this.#finishCommit(finish, refusal);
        } finally {
          // `finally`, not a line after the commit: `#finishCommit` folds every throw it knows, and
          // the hold must still clear for the one it does not, or the pipeline stays bricked by a
          // fault instead of by a slow handler (#273).
          this.#releaseHold();
        }
      });
  }

  /** Runs the commit and answers whether it wrote, for both of `#settle`'s branches. **Nothing
   *  thrown here reaches the caller** (#341): a native `pointerup` listener calls `session.commit()`
   *  and a keydown listener calls `session.nudge()`, and both discard the Promise. So a throw out of
   *  this becomes an uncaught error or an unhandled rejection that no consumer code can catch. The
   *  gesture answers `false` instead — the write did not land — and the report says which of the
   *  three things happened, because the boolean cannot:
   *
   *  - The entry is gone. Another call removed it before the write (`inline-editing.ts`'s cell
   *    commit folds the same case, #137 F10). The user's own edit is moot now.
   *  - The store refused the write. An envelope-only cascade against a several-Segment Entry is the
   *    one core raises (D-S5-44), and the preview path already drops that Entry's ghost for the same
   *    reason — so the two paths now tell one story about one edit.
   *  - Anything else is a fault, and `#reportCommitFault` says so. Calling a plugin's bug a refusal
   *    is the misreport #258 and #332 both ruled out, so the fault keeps its own code and severity. */
  #finishCommit(finish: () => boolean, refusal: GestureRefusal): boolean {
    try {
      return finish();
    } catch (error) {
      if (error instanceof EntryNotFoundError) {
        this.#reportGestureDropped(refusal.entryId, refusal.event, 'entry-gone');
        return false;
      }
      if (isEnvelopeRefusal(error)) {
        this.#reportGestureDropped(refusal.entryId, refusal.event, 'write-refused');
        return false;
      }
      this.#reportCommitFault(refusal, error);
      return false;
    }
  }

  /** One report per refused gesture, sync veto and settled-`false` Promise alike (D-S5-40). A
   *  refused *commit* reports from `data/transaction.ts` instead, so `commitEntryEdits` returning
   *  `false` adds nothing here — one refusal is one record. `buildRefusalReport`
   *  (`data/error-reporting.ts`) is the one place the shape is built; no `fallback` here, because
   *  this site printed nothing before and stays silent. */
  #reportRefusal(refusal: GestureRefusal): void {
    this.#deps.raiseError(
      buildRefusalReport({
        event: refusal.event,
        note: refusal.note,
        entryId: refusal.entryId,
      }),
    );
  }

  /** One report per gesture *core* dropped on its own — never a `before*` handler's `false`, so this
   *  takes no `GestureRefusal`: that shape's `note` says a handler refused, and none did here (#272,
   *  #273, #377 branch review F2). `event` still says which gesture, the same way `buildRefusalReport`
   *  reads it for a noun — `buildGestureDroppedReport` mints its own code from it, the same way
   *  `buildRefusalReport` now mints its own. `by: 'core'` is what tells a consumer this was not their
   *  handler's veto. */
  #reportGestureDropped(
    entryId: EntryId,
    event: BeforeGestureEvent,
    droppedReason: GestureDroppedReason,
  ): void {
    this.#deps.raiseError(buildGestureDroppedReport({ event, entryId, droppedReason }));
  }

  /** #341: the commit half of the fault `#reportExtenderFault` reports for the preview. The shape
   *  is `buildCommitFaultReport`'s (`data/error-reporting.ts`), beside the two refusal builders and
   *  the one noun table they all read. This adds the `console.error` a consumer who subscribes to
   *  nothing still needs, and it reads the sentence back off the report rather than spelling it a
   *  second time (D-S5-41). */
  #reportCommitFault(refusal: GestureRefusal, error: unknown): void {
    const report = buildCommitFaultReport({
      event: refusal.event,
      entryId: refusal.entryId,
      cause: error,
    });
    this.#deps.raiseError(report, () => console.error(`FreeGantt: ${report.message}`, error));
  }

  /** D-S3-17: only reached for a `before*` handler's unsettled Promise. Holds the commit draft (not
   *  the last unsnapped pointer preview, not the stored origin) while `result` settles. Paint is one
   *  immediate `applyGestureState`, not a rAF-cleared preview plus a separate pending write. Returns
   *  this hold's generation, so `#settle` can tell a stale settle from a live one when `result`
   *  finally resolves (#272, #273 — this no longer arm-locks `session()`; see `session()`). */
  #awaitVeto(itemIds: readonly ItemId[], proposal: GestureProposal, refusal: GestureRefusal): number {
    const generation = ++this.#generation;
    this.#held = {
      generation,
      itemIds,
      proposal,
      refusal,
      measuredFrom: this.#measuredFrom(proposal),
    };
    this.#scheduledProposal = proposal;
    this.#previewFrame.flush();
    return generation;
  }

  /** Part 3 (#273): the stored row behind each id `proposal.paints` names, at the moment the hold
   *  begins — `paints`, not `writes`, because a parent bar's drag measures its delta off the
   *  parent's own envelope, which lives only in `paints` (ADR 0013); a child that moved under it
   *  during the hold makes that delta wrong too. */
  #measuredFrom(proposal: GestureProposal): ReadonlyMap<EntryId, StoredEntry | undefined> {
    const committed = this.#deps.committedEntriesById();
    const measuredFrom = new Map<EntryId, StoredEntry | undefined>();
    for (const id of proposal.paints.keys()) measuredFrom.set(id, committed.get(id));
    return measuredFrom;
  }

  /** True once any row `measuredFrom` names is no longer the same object the store holds — a
   *  replacement (ADR 0017: every committed field write replaces the row) or a removal
   *  (`committed.get(id)` now `undefined`). Object identity, not a value compare: cheap, and exact —
   *  a row that did not change is never replaced, so no false positive can reach this. */
  #rowsChangedSince(measuredFrom: ReadonlyMap<EntryId, StoredEntry | undefined>): boolean {
    const committed = this.#deps.committedEntriesById();
    for (const [id, row] of measuredFrom) {
      if (committed.get(id) !== row) return true;
    }
    return false;
  }

  #releaseHold(): void {
    this.#held = undefined;
    this.#scheduledProposal = undefined;
    this.#previewFrame.flush();
  }

  /** Ends a currently-held gesture without writing anything: clears the hold, flushes the preview,
   *  and raises one `'discarded'` report. `false` when nothing was held — Escape and `destroy()` both
   *  read that to decide whether they did anything (Escape falls through to clearing the selection
   *  instead; `destroy()` just no-ops). Public because `EntryGestureContext` (both the Escape handler
   *  and `GanttShell.destroy()`) reach it from outside this file (#272, #273). */
  discardHeldGesture(): boolean {
    return this.#dropHeldGesture('discarded');
  }

  #dropHeldGesture(droppedReason: GestureDroppedReason): boolean {
    const held = this.#held;
    if (held === undefined) return false;
    this.#reportGestureDropped(held.refusal.entryId, held.refusal.event, droppedReason);
    this.#releaseHold();
    return true;
  }

  /** D-S3-18: coalesces on the pipeline's own rAF — a drag's every pointermove replaces the scheduled
   *  draft, but only the last one before the next frame is ever painted. */
  #preview(proposal: GestureProposal | undefined, cursorX?: number): void {
    this.#scheduledProposal = proposal;
    this.#scheduledCursorX = proposal === undefined ? undefined : cursorX;
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

  /** The extension hook sees `writes` and the bars follow `paints`. A parent bar's own translated
   *  envelope is paint and nothing else (ADR 0013): showing it to the hook would offer a plugin an
   *  edit the commit never makes. */
  #computePreview(proposal: GestureProposal | undefined): readonly ItemPreview[] | undefined {
    if (!proposal || proposal.paints.size === 0) return undefined;
    const draft = proposal.paints;
    const extra = this.#extraFor(proposal.writes);
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

  /** D-S3-18, S3.6: `extra = extraEditsFor({ entries: committed, proposed: draft })` — the exact
   *  pseudocode the decision names, run on the pipeline's own rAF (`#preview`'s caller) rather than on
   *  every `pointermove`. No wired seam (P1's default) means no ghost, which is what an unoccupied
   *  hook writes anyway — behaviorally identical to before this hook existed. The seam hands over
   *  storage-shaped edits, because `api/Dataset.extraEditsFor` reads the occupant's loose writes
   *  through the dataset's own zone first (#209 C3): pixels need an `Instant`, and `layout/` may not
   *  derive one (I10).
   *
   *  The raw hook result is reconciled the same way `data/build-commit-change-set.ts` reconciles it
   *  at commit, against the same effective state (committed entries overlaid with this draft) — so a
   *  drag previews exactly what it commits (#212 R2 fix-plan review). Before this, the preview
   *  painted the hook's raw, unreconciled edit — a plugin cascading `start` alone onto a
   *  several-Segment Entry could preview one span and then commit a different one.
   *
   *  This runs inside a rAF callback with nothing to catch a throw, and the reconciliation a several-
   *  Segment envelope-only cascade owes is a refusal (`SegmentsOutOfSyncError`, D-S5-44) — so this
   *  calls `reconcileExtenderEditsForPreview`, not `reconcileExtenderEdits`: a refused edit paints no
   *  ghost for that Entry this frame, and the commit path still throws the same edit for real.
   *
   *  #332: a bug in the extender itself (a bare `Error`, `UnknownFieldError`, anything
   *  `isEnvelopeRefusal` does not name) is not a refusal, and `reconcileExtenderEditsWith` rethrows it
   *  unchanged from *either* call this makes. The `try` below catches it, the one place on this rAF
   *  path that can — recovered the same way `render/dom`'s `callRenderer` recovers a bad renderer: this
   *  frame paints with no cascade ghost, same as no extender installed, and the drag carries on. */
  #extraFor(draft: ProposedEdits): ProposedEdits {
    const extraEditsFor = this.#deps.extraEditsFor;
    if (extraEditsFor === undefined) return NO_EXTRA_EDITS;
    try {
      const entries = this.#deps.committedEntriesById();
      const raw = extraEditsFor({
        entries,
        proposed: draft,
        entryAfterEdits: (id) => entryAfterEdits(entries, draft, entryId(id)),
        addedEntryIds: EMPTY_ENTRY_IDS,
        removedEntryIds: EMPTY_ENTRY_IDS,
      });
      // No hook installed is the default, and it writes nothing — so the frame reconciles nothing and
      // allocates nothing (I5). A hook that did write costs one entry per id it named:
      // `reconcileExtenderEditsForPreview` reads only the ids its own edits name, and `entries` above
      // is the supplier's cached map, not a copy this frame made.
      if (raw.size === 0) return raw;
      return reconcileExtenderEditsForPreview(effectiveEntriesFor(entries, draft, raw.keys()), raw);
    } catch (error) {
      this.#reportExtenderFault(error);
      return NO_EXTRA_EDITS;
    }
  }

  /** #332: `by: 'plugin'`, not a specific `PluginId` — `setExtender` composes (D-S5-23), so the hook
   *  `#extraFor` calls may be several plugins deep, and nothing here can tell which layer threw. ADR
   *  0020 hit the identical problem (a composed hierarchy source) and settled on the same literal for
   *  the same reason. `severity: 'warning'`, matching `callRenderer`'s own fault (`render/dom/index.ts`):
   *  the drag itself fully recovers, it just paints one frame short a cascade ghost. */
  #reportExtenderFault(error: unknown): void {
    const message =
      'An edit extender threw while computing the drag preview — this frame paints with no cascade.';
    this.#deps.raiseError(
      { code: 'extender-preview-failed', message, severity: 'warning', by: 'plugin', cause: error },
      () => console.error(`FreeGantt: ${message}`, error),
    );
  }
}
