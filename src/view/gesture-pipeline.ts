// view/ — the gesture pipeline (D-GH-2): which entries a gesture moves, draft math
// (`layout/gesture-draft.ts`), preview rAF coalescing, and the commit pipeline for a move or resize
// gesture, all in one place. `GanttShell` builds one `GesturePipeline` from its own primitives; its
// only public entry point is `session()` (D-GH-1), which `interaction/entry-gestures.ts` drives
// through `EntryGestureContext`. (Named `GesturePipeline`, not the plan's original "GestureHost" —
// "Host" is a retired word, #64, for smuggling two concepts under one name.)

import {
  cursorLabelForX,
  draftForMove,
  draftForResize,
  previewOffsets,
  spanAfterEdit,
} from '../layout/index.js';
import type {
  Bar,
  BarPreview,
  DropPlace,
  RowDropZone,
  RowsForDrop,
  SnapSetting,
  SnapUnit,
  TimeScale,
  ViewPreset,
} from '../layout/index.js';
import type {
  Entry,
  StoredEntry,
  EntryId,
  GestureDroppedReason,
  Instant,
  BarId,
  ProposedEdit,
  RaiseError,
  Refusable,
  ProposedEdits,
  RowId,
} from '../model/index.js';
import { EntryNotFoundError, InvertedSpanError, barId, spansTime } from '../model/index.js';
import type { BeforeGestureEvent } from '../data/error-reporting.js';
import {
  buildCommitFaultReport,
  buildGestureDroppedReport,
  buildRefusalReport,
} from '../data/error-reporting.js';
import { emptyProposedEdit, mergeProposedEditsByEntry } from '../data/fields/field-access.js';
import type { EventBus } from './event-bus.js';
import { RefusalNote } from './event-bus.js';
import type {
  AsyncCancelableEvent,
  EntryMove,
  EntryResize,
  GanttEventMap,
  ProposedDates,
  ProposedSpan,
  TreePlaceChange,
} from './event-bus.js';
import type { RowDrop, PlacedEntry } from './row-drop.js';
import { resolveRowDrop, ROW_DROP_REFUSAL_TEXT } from './row-drop.js';
import type { EntryStep } from './entry-step.js';
import { EntryStepTree } from './entry-step-tree.js';
import { entryStepRefusalMessage, resolveEntryStep } from './entry-step.js';
import type { EntryStepInput, EntryStepRefusal, EntryStepVerdict } from './entry-step.js';
import type { GestureCapability } from './capability.js';
import { FrameScheduler } from './frame-scheduler.js';
import type { RowHoverExpand } from './row-hover-expand.js';
import type { DraftOptions, EntryGesture, EntryGestureSession } from './entry-gesture-context.js';
import type { InteractionState } from '../render/backend.js';

/** No seam wired means no ghost — one frozen empty map, so a preview frame with no plugin installed
 *  allocates nothing (I5). */
const NO_EXTRA_EDITS: ProposedEdits = Object.freeze(new Map());
/** Every gesture but a parent bar's drag writes each bar it paints, so this is the usual answer. */
const NOTHING_PAINTED_ONLY: ReadonlySet<EntryId> = Object.freeze(new Set<EntryId>());
/** #425 axis lock: what a refused drop writes — nothing. A row-axis drag holds every date fixed
 *  (`interaction/entry-gestures.ts` zeroes its own `dxPx` before this ever runs), so once the row
 *  target itself refuses, there is no time fallback left to commit either. */
const NO_WRITES: ProposedEdits = Object.freeze(new Map());

/** The row a drop lands "into", or `undefined` for any other verdict. A refused drop names no row. */
function intoRowOf(drop: RowDrop): RowId | undefined {
  return drop.kind === 'place' && drop.place.side === 'into' ? drop.place.rowId : undefined;
}

/** #425: a `paintedOnly` Entry's own translated dates (ADR 0013 — they never write directly), with
 *  the dates dropped so `#writesWithPlace` can still write its tree place. `undefined` in,
 *  `undefined` out — a moved id with no paint at all has nothing to place either. */
function stripDates(edit: ProposedEdit | undefined): ProposedEdit | undefined {
  if (edit === undefined) return undefined;
  const { start: _start, end: _end, ...rest } = edit;
  return rest;
}

export interface GesturePipelineDeps {
  timeZone(): string;
  timeScale(): TimeScale;
  preset(): ViewPreset;
  /** What this Gantt snaps to — `GanttShell` has already resolved its own `snap` over the
   *  showing preset's. `'tick'` still arrives unresolved: only a gesture knows which preset is
   *  measuring it. */
  snap(): SnapSetting;
  /** The Selection (#212, ADR 0010, ADR 0025) — the Entry ids `render/dom` paints from, in row
   *  order. */
  selectedEntryIds(): readonly EntryId[];
  entryById(id: EntryId): Entry | undefined;
  /** The committed Bar an entry's preview moves — part 0, the one `barId(entryId)` names (#436
   *  branch review). `previewOffsets` measures the drag against this Bar rather than a literal
   *  it builds itself, so a fixed `box` (ADR 0022) is measured on its own path. */
  barForEntry(id: EntryId): Bar | undefined;
  /** The Gantt's own resolved bar floor, the number `placeFrame` already paints the committed frame
   *  with. A preview that took `barSpan`'s module default instead would agree with the commit only
   *  for a consumer who never overrides `--fg-bar-min-width`. */
  minBarWidthPx(): number;
  /** One resolution (I14) — `GanttShell#canGesture`, the same answer the pointer-selection
   *  path and the affordance ids resolve through, never re-derived here. `edge` narrows a `'resize'`
   *  question to one handle (#142); every other capability ignores it. */
  canGesture(capability: GestureCapability, id: EntryId, edge?: 'start' | 'end'): boolean;
  /** ADR 0013: which Entries a move of this bar writes — `Capabilities.entriesMovedBy`, resolved by
   *  the shell like every other capability answer (I14). An ordinary bar answers with itself. A
   *  parent bar answers with the dated descendants below it, because its own dates roll up. */
  entriesMovedBy(entry: Entry): readonly Entry[];
  commitEntryEdits(edits: ProposedEdits): boolean;
  /** Runs `body` as one transaction, so its writes are one undo step. `false` when a `beforeChange`
   *  handler refused the whole transaction. */
  inOneTransaction(body: () => void): boolean;
  emit: EventBus<GanttEventMap, AsyncCancelableEvent>['emit'];
  /** A vetoed gesture still draws nothing and still throws nothing, and now it also
   *  reports. `plans/02` §3's "a vetoed gesture is silent" stays true of the *UI*. */
  raiseError: RaiseError;
  /** An installed extension hook, read for **preview only** — the real hook still
   *  runs again, for real, inside `data/transaction.ts`'s own commit; this never writes anything.
   *  `undefined` previews no ghost extras, same as `data/edit-extension.ts`'s `identityExtender` —
   *  which is also what a Dataset with no plugin installed hands over. Renamed from
   *  `extend` to `extraEditsFor` at #209, alongside the seam it mirrors (`api/Dataset`'s own).
   *
   *  Takes the draft, not an `EditRequest` (#466): this pipeline holds committed entries and the
   *  in-flight draft, never `hierarchySource`/`committedChildIds`/`fields` — `GanttShell` binds to
   *  `model/`'s narrow `Dataset`, which does not carry those. `api/gantt.ts` wires this to
   *  `api/dataset.ts`'s `extraEditsFor`, which reaches the full `DatasetState` and builds the
   *  `EditRequest` there, through `data/edit-request.ts`'s `createEditRequest` — the one place that
   *  object is built (commit path and preview path alike). */
  extraEditsFor?: (draft: ProposedEdits) => ProposedEdits;
  /** #425: the same door as `extraEditsFor` above, for the Rollup instead of the extension hook.
   *  `#computePreview` calls it only for a `place` drop (ruling 5's "into a leaf, its dates roll
   *  up" is a tree drop's own preview, not a time-only drag's — #425 ruling). `undefined` ghosts
   *  nothing, same as an unwired `extraEditsFor`. `api/gantt.ts` wires this to `api/dataset.ts`'s
   *  `rolledUpEditsFor`. */
  rolledUpEditsFor?: (draft: ProposedEdits) => ProposedEdits;
  /** What `#measuredFrom` fingerprints the rows a held draft was built from against — the *committed*
   *  Entries keyed by id, never the in-flight draft.
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
  /** Locale for `cursorLabelForX` — the same value header ticks already use. */
  locale?(): Intl.LocalesArgument | undefined;
  /** One `InteractionState` write for the live or held preview and the pending-bar
   *  ids. `undefined` preview parks bars on committed geometry; `undefined` pendingBarIds clears the
   *  `pending` token. There is no arm lock (#272/#273 — `session()` supersedes a held gesture instead
   *  of refusing to arm over it; `#held` is a fingerprint, not a gate). `cursor` is the Cursor
   *  line; `undefined` parks it. `rowDrop` (#425) is the vertical drag's own paint — the row it
   *  targets or refuses, and the Insertion line; `undefined` outside a drag, or over the source row. */
  applyGestureState(
    preview: readonly BarPreview[] | undefined,
    pendingBarIds: readonly BarId[] | undefined,
    cursor?: { x: number; label: string },
    rowDrop?: InteractionState['rowDrop'],
  ): void;
  /** #425: resolves a drag's content-y to a row drop zone, hysteresis and the source row both
   *  applied — `layout/row-drop-zone.ts`'s own `rowDropZoneAt`, wired to this Gantt's own row
   *  geometry. `previous` is the last resolved zone this same drag held, so the hysteresis band
   *  measures against the drag's own history, not a fresh reading every frame. */
  rowDropZoneAt(contentY: number, sourceRowIndex: number, previous: RowDropZone): RowDropZone;
  /** #425: the planned rows and the lookups `layout/row-drop-target.ts`'s `dropPlaceFor` and
   *  `resolveRowDrop` need to turn a row drop zone into a tree place. */
  rowsForDrop(): RowsForDrop;
  /** #425: the row a given Entry paints in, for `#movedTopMost`'s row-order sort and for
   *  `dropFor`'s source row. */
  rowIndexForEntry(id: EntryId): number;
  /** #425: `ResolvedCapabilities.canPlace` — may this Entry sit under this parent, the place rule
   *  too (ADR 0038). Asked once for the Entry's own current parent (may it reorder at all) and once
   *  for the drop's target parent (may it cross into this one), per `resolveRowDrop`'s own
   *  two-question rule. */
  canPlace(entry: Entry, parentId: EntryId | undefined): boolean;
  /** #425: does this Gantt's row order mirror the tree at all — `false` for a plugin-owned
   *  hierarchy or a sorted/grouped row source, which offer no vertical drop (coordinator ruling). */
  verticalDropOffered(): boolean;
  /** #604: expands a collapsed parent the drop rests "into", so a drop can land between its
   *  children. The pipeline aims it on each row-drop preview and stops it when the drag ends. */
  readonly rowHoverExpand: RowHoverExpand;
}

/** What one gesture proposes, ready to write and ready to paint.
 *
 *  The two differ for one gesture only. A parent bar's drag writes the dated descendants below the
 *  bar, and never the bar's own dates, which roll up from them (ADR 0013). So the parent sits in
 *  `paints`, where it follows the pointer, and stays out of `writes`. Every other gesture writes
 *  exactly what it paints — `writes` is `paints`' own map whenever nothing needs stripping, and a
 *  fresh one built to agree with it otherwise (a `place` drop's tree write, a refusal's empty one). */
interface GestureProposal {
  readonly writes: ProposedEdits;
  readonly paints: ProposedEdits;
  /** The bar the user grabbed — `event.entry`, and where the payload's own span comes from. Always
   *  a key of `paints` for a move or a resize, and for a reorder that places. */
  readonly grabbed: EntryId;
  /** #425: where this move lands in the tree, or the proof it never asked — `{ kind: 'timeOnly' }`
   *  for a resize, a nudge, or a drag whose pointer never left the source row. */
  readonly drop: RowDrop;
}

/** One Entry of a keyboard step run that its `beforeEntryMove` handlers let through. */
interface AcceptedStep {
  readonly id: EntryId;
  readonly writes: ProposedEdits;
  readonly payload: EntryMove;
  readonly refusal: GestureRefusal;
  readonly proposal: GestureProposal;
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
  readonly barIds: readonly BarId[];
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
  /** The most recent in-flight draft a drag has proposed, applied on the next animation
   *  frame rather than synchronously on every pointermove — one paint per frame, not one per event. */
  #scheduledProposal: GestureProposal | undefined;
  #previewFrame: FrameScheduler;
  /** #272/#273: one clock, ticked once per held gesture (`#awaitVeto`), never reset. `#held.generation`
   *  is that gesture's stamp; `#settle`'s async branch only acts when the two still match, which is
   *  what makes `session()` superseding the hold (instead of refusing to arm over it) safe — a stale
   *  settle can never write, paint, or report over a gesture that replaced it. */
  #generation = 0;
  /** Amended #272/#273: the one held gesture, if any — no arm lock any more (see `session()`
   *  and `discardHeldGesture()`), just a fingerprint a late settle checks itself against. */
  #held: HeldGesture | undefined;
  /** Content-x of the live pointer, coalesced with the preview on the same rAF. */
  #scheduledCursorX: number | undefined;

  constructor(deps: GesturePipelineDeps) {
    this.#deps = deps;
    this.#previewFrame = new FrameScheduler(() => {
      this.#deps.applyGestureState(
        this.#computePreview(this.#scheduledProposal),
        this.#held?.barIds,
        this.#computeCursor(),
        this.#rowDropForPaint(this.#scheduledProposal?.drop),
      );
    });
  }

  /** Arms a gesture on `grabbed` (+ capable co-selected entries) and returns a
   *  session closed over exactly those entries and this one `gesture` shape — `undefined` when
   *  nothing capable is grabbed, replacing the length check a caller used to make by hand against
   *  `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture): EntryGestureSession | undefined {
    // #272/#273: a new gesture supersedes a held one instead of refusing to arm over it — the old
    // "arm lock" let one hung handler on one bar refuse every gesture in the Gantt, forever.
    this.#dropHeldGesture('superseded');
    this.#deps.rowHoverExpand.stop();
    const capability = this.#capabilityFor(gesture);
    const edge = gesture.kind === 'resize' ? gesture.edge : undefined;
    const bars = this.#entriesForGesture(grabbed, capability, edge);
    if (bars.length === 0) return undefined;
    const anchor = bars[0]!;
    // A reorder never drafts a date (D2), so `#proposalFor` — the only reader of this — never runs
    // for one either (`proposalFor` below). Computing it there anyway would draft dates nothing reads.
    const draftedEntries = gesture.kind === 'reorder' ? undefined : this.#draftedEntries(bars, capability);
    const reparents = gesture.kind === 'move' || gesture.kind === 'reorder';
    const movedTopMost = reparents ? this.#movedTopMost(anchor.id, bars) : [];
    let sourceRowIndex = reparents ? this.#deps.rowIndexForEntry(anchor.id) : -1;
    // #425: the last resolved zone for this drag, so `rowDropZoneAt`'s hysteresis measures against
    // the drag's own history rather than a fresh reading every frame. `dropFor`'s `persist` flag
    // keeps a `commit()`/`nudge()` call (which never repeats) from advancing it.
    let zone: RowDropZone = { kind: 'sourceRow' };
    const dropFor = (options: DraftOptions | undefined, persist: boolean): RowDrop => {
      if (!reparents || options?.contentY === undefined) return { kind: 'timeOnly' };
      const resolvedZone = this.#deps.rowDropZoneAt(options.contentY, sourceRowIndex, zone);
      if (persist) zone = resolvedZone;
      return resolveRowDrop({
        zone: resolvedZone,
        movedTopMost,
        rows: this.#deps.rowsForDrop(),
        canPlace: (entry, parentId) => this.#deps.canPlace(entry, parentId),
        verticalDropOffered: this.#deps.verticalDropOffered(),
      });
    };
    // The last preview, so a hover expand can preview again with no pointer move.
    let hasPreviewed = false;
    let lastDxPx = 0;
    let lastOptions: DraftOptions | undefined;
    const previewAgain = (): void => {
      if (!hasPreviewed) return;
      // The expanded rows moved every row below them, the grabbed row too.
      sourceRowIndex = this.#deps.rowIndexForEntry(anchor.id);
      previewNow(lastDxPx, lastOptions);
    };
    const previewNow = (dxPx: number, options: DraftOptions | undefined): void => {
      const drop = dropFor(options, true);
      this.#preview(proposalFor(dxPx, options, drop), options?.cursorX);
      if (reparents) this.#deps.rowHoverExpand.holdOver(intoRowOf(drop), previewAgain);
    };
    const proposalFor = (dxPx: number, options: DraftOptions | undefined, drop: RowDrop): GestureProposal =>
      gesture.kind === 'reorder'
        ? this.#reorderProposal(anchor.id, drop)
        : this.#proposalFor({ gesture, ...draftedEntries!, grabbed: anchor.id, dxPx, options, drop });
    return {
      preview: (dxPx, options) => {
        hasPreviewed = true;
        lastDxPx = dxPx;
        lastOptions = options;
        previewNow(dxPx, options);
      },
      commit: (dxPx, options) => {
        this.#deps.rowHoverExpand.stop();
        return this.#commit(gesture, proposalFor(dxPx, options, dropFor(options, false)));
      },
      nudge: (direction, options) => {
        // A reorder has no time axis to step: `nudge()` never reaches a row drag (`interaction/`
        // wires it to a bar's keyboard path alone), but a session built the same way for both stays
        // consistent, so this states the rule rather than dividing by zero on `#stepPx`.
        if (gesture.kind === 'reorder') return Promise.resolve(false);
        const dxPx = this.#stepPx(gesture, anchor, options?.suspendSnap) * direction;
        // `nudge()` bypasses `dropFor` on purpose (`DraftOptions.contentY`'s own doc: "`nudge()`
        // ignores it") — a keyboard step never reparents, whatever the last preview's zone was.
        return this.#commit(gesture, proposalFor(dxPx, options, { kind: 'timeOnly' }));
      },
      cancel: () => {
        this.#deps.rowHoverExpand.stop();
        this.#preview(undefined);
      },
    };
  }

  /** A refused drop released over a row writes nothing. The note near the pointer is gone with the
   *  drag, so one `info` report says why, and the live region announces it. */
  #announceRefusedDrop(proposal: GestureProposal): void {
    if (proposal.drop.kind !== 'refused') return;
    this.#deps.raiseError({
      code: 'entry-drop-refused',
      message: ROW_DROP_REFUSAL_TEXT[proposal.drop.reason],
      severity: 'info',
      by: 'core',
      entryId: proposal.grabbed,
    });
  }

  /** A keyboard step moves every Entry it is given in the tree — up, down, indent or outdent. Each
   *  Entry takes the step it would take alone: it asks the same rules a row drop asks and commits
   *  through the same `beforeEntryMove`/`entryMove` pair. An Entry the rules refuse stays, and the
   *  others still move. The whole step is one transaction, so it is one undo step. Refused Entries
   *  make one Error report, which the live region announces. Answers the Entries that moved. */
  commitEntrySteps(ids: readonly EntryId[], step: EntryStep): Promise<readonly EntryId[]> {
    // Like `session()`, a new gesture supersedes a held one.
    this.#dropHeldGesture('superseded');
    return Promise.resolve(this.#commitEntryStepRun(ids, step));
  }

  /** Several Entries, one after the other, in the order a user would pick: `up` and `indent` go top
   *  to bottom, `down` and `outdent` go bottom to top. Each step reads the Tree the steps before it
   *  left, and no write happens until every step has its answer. Then one transaction writes them all.
   *
   *  A `beforeEntryMove` handler may answer with a Promise. The run holds like one held gesture: it
   *  waits, and then asks the next Entry. A sync answer waits for nothing. If the data changes during
   *  a wait, the run drops and writes nothing. A newer gesture supersedes the run, as it does a drag. */
  #commitEntryStepRun(
    ids: readonly EntryId[],
    step: EntryStep,
  ): readonly EntryId[] | Promise<readonly EntryId[]> {
    const entries = this.#entriesInStepOrder(ids, step);
    const tree = new EntryStepTree(this.#deps.rowsForDrop());
    const accepted: AcceptedStep[] = [];
    const refused: { id: EntryId; reason: EntryStepRefusal }[] = [];
    // The rows as the run first saw them, for the data-changed check after a wait.
    const measuredFrom = new Map<EntryId, StoredEntry | undefined>();
    const askFrom = (start: number): readonly EntryId[] | Promise<readonly EntryId[]> => {
      for (let index = start; index < entries.length; index += 1) {
        const entry = entries[index]!;
        const verdict = resolveEntryStep(this.#stepInput(entry, step), tree);
        if (verdict.kind === 'refused') {
          refused.push({ id: entry.id, reason: verdict.reason });
          continue;
        }
        const { asked, answer } = this.#askBeforeEntryMove(entry.id, verdict);
        for (const [id, row] of this.#measuredFrom(asked.proposal)) {
          if (!measuredFrom.has(id)) measuredFrom.set(id, row);
        }
        const take = (): void => {
          tree.place(verdict.moves[0]!);
          accepted.push(asked);
        };
        if (typeof answer === 'boolean') {
          if (answer) take();
          else this.#reportRefusal(asked.refusal);
          continue;
        }
        const generation = this.#awaitVeto([], asked.proposal, asked.refusal);
        return answer.then((allowed) => {
          // A newer gesture or Escape already reported and released this wait.
          if (this.#held?.generation !== generation) return [];
          const changed = this.#rowsChangedSince(measuredFrom);
          this.#releaseHold();
          if (!allowed) this.#reportRefusal(asked.refusal);
          if (changed && (allowed || index + 1 < entries.length)) {
            this.#reportGestureDropped(asked.refusal.entryId, asked.refusal.event, 'data-changed');
            return [];
          }
          if (allowed) take();
          return askFrom(index + 1);
        });
      }
      return this.#writeAcceptedSteps(accepted, refused);
    };
    return askFrom(0);
  }

  /** One transaction writes every accepted step. Then each `entryMove` fires, and one report names
   *  the refused Entries. */
  #writeAcceptedSteps(
    accepted: readonly AcceptedStep[],
    refused: readonly { id: EntryId; reason: EntryStepRefusal }[],
  ): readonly EntryId[] {
    const written: AcceptedStep[] = [];
    const first = accepted[0];
    // A fault in the commit reports, and never throws: a key press has no caller to catch it.
    const committed =
      first === undefined ||
      this.#finishCommit(
        () =>
          this.#deps.inOneTransaction(() => {
            for (const one of accepted) {
              if (this.#finishCommit(() => this.#deps.commitEntryEdits(one.writes), one.refusal)) {
                written.push(one);
              }
            }
          }),
        first.refusal,
      );
    if (!committed) return [];
    for (const one of written) this.#deps.emit('entryMove', one.payload);
    if (refused.length > 0) this.#reportStepsRefused(refused, written.length);
    return written.map((one) => one.id);
  }

  #stepInput(entry: Entry, step: EntryStep): EntryStepInput {
    return {
      entry,
      step,
      rows: this.#deps.rowsForDrop(),
      canPlace: (moved, parentId) => this.#deps.canPlace(moved, parentId),
      verticalDropOffered: this.#deps.verticalDropOffered(),
    };
  }

  /** The selected Entries that still exist, top row first for `up` and `indent`, bottom row first for
   *  `down` and `outdent`. */
  #entriesInStepOrder(ids: readonly EntryId[], step: EntryStep): readonly Entry[] {
    const topFirst = ids
      .flatMap((id) => this.#deps.entryById(id) ?? [])
      .sort((a, b) => this.#deps.rowIndexForEntry(a.id) - this.#deps.rowIndexForEntry(b.id));
    return step === 'up' || step === 'indent' ? topFirst : topFirst.reverse();
  }

  /** Asks `beforeEntryMove` for one Entry of a run. `answer` is the handlers' verdict: `true` or
   *  `false` at once, or a Promise when a handler waits. */
  #askBeforeEntryMove(
    id: EntryId,
    verdict: Extract<EntryStepVerdict, { kind: 'place' }>,
  ): { asked: AcceptedStep; answer: boolean | Promise<boolean> } {
    const drop: RowDrop = { kind: 'place', place: verdict.place, moves: verdict.moves };
    const writes = this.#writesWithPlace(NO_WRITES, NO_WRITES, verdict.moves);
    const proposal: GestureProposal = { writes, paints: NO_WRITES, grabbed: id, drop };
    const payload = this.#entryMoveFor(proposal, this.#proposedDatesOf(id, undefined), [
      this.#proposedDatesOf(id, writes.get(id)),
    ]);
    const note = new RefusalNote();
    const refusal: GestureRefusal = { event: 'beforeEntryMove', entryId: id, note };
    const before = this.#deps.emit('beforeEntryMove', {
      ...payload,
      refuse: note.refuse,
    } satisfies Refusable);
    const answer =
      typeof before === 'boolean'
        ? before
        : before.then(
            (allowed) => allowed,
            () => false,
          );
    return { asked: { id, writes, payload, refusal, proposal }, answer };
  }

  /** One report for every Entry a step left in place. */
  #reportStepsRefused(
    refused: readonly { id: EntryId; reason: EntryStepRefusal }[],
    movedCount: number,
  ): void {
    const first = refused[0];
    if (first === undefined) return;
    this.#deps.raiseError({
      code: 'entry-step-refused',
      message: entryStepRefusalMessage(refused, movedCount),
      severity: 'info',
      by: 'core',
      entryId: first.id,
    });
  }

  /** #602: `session()`'s one small map from gesture kind to the capability that gates it — a
   *  `reorder` arms on `'reorder'` alone, never `'move'`, so `move: false, reorder: true` still
   *  reorders from the grid. */
  #capabilityFor(gesture: EntryGesture): GestureCapability {
    if (gesture.kind === 'resize') return 'resize';
    if (gesture.kind === 'reorder') return 'reorder';
    return 'move';
  }

  /** #602: a reorder drafts no dates (D2) — nothing for `draftForMove` to translate, so this skips
   *  `#proposalFor` rather than asking it to draft a time axis a reorder never moves. A `place` drop
   *  writes the tree place alone; anything else (refused, or the pointer never left the source row)
   *  writes nothing. */
  #reorderProposal(grabbed: EntryId, drop: RowDrop): GestureProposal {
    if (drop.kind !== 'place') return { writes: NO_WRITES, paints: NO_WRITES, grabbed, drop };
    const placed = this.#writesWithPlace(NO_WRITES, NO_WRITES, drop.moves);
    return { writes: placed, paints: placed, grabbed, drop };
  }

  /** #425 (ruling 9): grabbed first, then row order, dropping an Entry with a selected ancestor
   *  already in the set — the list `resolveRowDrop` walks to place a multi-select drag as one
   *  block. A `resize` gesture never reaches this (`session()` passes `[]`): only a move reparents. */
  #movedTopMost(grabbedId: EntryId, bars: readonly Entry[]): readonly Entry[] {
    const ids = new Set(bars.map((entry) => entry.id));
    const hasSelectedAncestor = (entry: Entry): boolean => {
      let ancestor = entry.parent();
      while (ancestor !== undefined) {
        if (ids.has(ancestor.id)) return true;
        ancestor = ancestor.parent();
      }
      return false;
    };
    const topMost = bars.filter((entry) => !hasSelectedAncestor(entry));
    const grabbedEntry = topMost.find((entry) => entry.id === grabbedId);
    const rest = topMost
      .filter((entry) => entry.id !== grabbedId)
      .sort((a, b) => this.#deps.rowIndexForEntry(a.id) - this.#deps.rowIndexForEntry(b.id));
    return grabbedEntry ? [grabbedEntry, ...rest] : rest;
  }

  /** Just the grabbed entry when it is not part of a multi-entry selection; else every
   *  *capable* selected entry, grabbed first — an incapable one is skipped, not blocking.
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

  /** A `'tick'` snap resolves to the current preset's own tick unit; Alt (`suspendSnap`)
   *  always wins and falls back to raw millisecond placement. Which setting arrives here —
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

  /** The px width of one resolved snap unit, anchored at the grabbed edge's own
   *  current instant — what `nudge()` feeds `#draftFor` as `dxPx` so a keyboard step reuses the exact
   *  same pixel-then-snap math a mouse drag's `commit()` already runs, instead of a second, parallel
   *  calendar-stepping path. Falls back to the preset's own tick when `suspendSnap` clears `snap` to
   *  `'none'`, or when `snap` is a custom `SnapRule` with no unit of its own to size a step by — a
   *  keyboard nudge always has *some* unit to step in, even unsnapped. */
  #stepPx(gesture: EntryGesture, anchor: Entry, suspendSnap: boolean | undefined): number {
    const snap = this.#resolveSnap(suspendSnap);
    const preset = this.#deps.preset();
    const hasOwnUnit = snap !== 'none' && typeof snap !== 'function';
    const unit = hasOwnUnit ? snap.unit : preset.tickUnit;
    const increment = hasOwnUnit ? snap.increment : preset.tickIncrement;
    // A gesture exists only for an Entry with a grip to grab, which means it already spans
    // (`spansTime`, ADR 0012). This was a cast until the rule got one home; it now asks the
    // question. A non-spanning anchor sizes its step at zero, which moves nothing — the cast sized
    // it at `NaN`, and nothing on any reachable path produces either.
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
   *  A resize reaches none of this: it drags one grabbed bar's own edge, never a subtree, so there is
   *  no descendant to translate alongside it. `can('resize', …)` refuses a deriving parent's edge
   *  outright (`capability.ts`'s `canWrite`), so no handle paints there to begin with. */
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
    drop: RowDrop;
  }): GestureProposal {
    const { gesture, entries, paintedOnly, grabbed, dxPx, options, drop } = input;
    const base = {
      zone: this.#deps.timeZone(),
      scale: this.#deps.timeScale(),
      snap: this.#resolveSnap(options?.suspendSnap),
      entries,
      dxPx,
    };
    const paints =
      gesture.kind === 'resize' ? draftForResize({ ...base, edge: gesture.edge }) : draftForMove(base);
    // #425 (finding 16): no `paintedOnly` id means nothing to strip, so `writes` shares `paints`'
    // own map instead of paying a copy on every frame — the common case, one parent bar aside.
    let writes: ProposedEdits = paints;
    if (paintedOnly.size > 0) {
      const stripped = new Map(paints);
      for (const id of paintedOnly) stripped.delete(id);
      writes = stripped;
    }
    if (drop.kind === 'place') {
      return { writes: this.#writesWithPlace(writes, paints, drop.moves), paints, grabbed, drop };
    }
    if (drop.kind === 'refused') return { writes: NO_WRITES, paints, grabbed, drop };
    return { writes, paints, grabbed, drop };
  }

  /** #425: folds a `place` drop's own tree write into `writes`, on top of whatever `writes` already
   *  holds for a moved id — merging, never replacing, so a diagonal drag keeps its own dates.
   *
   *  A `paintedOnly` id (a deriving parent bar, ADR 0013 — its own dates roll up and never write
   *  directly) can still be a moved top-most Entry: it can reparent even though its dates never
   *  write. Such an id has no entry in `writes` (that is what `paintedOnly` means) but does have one
   *  in `paints`, whose translated `start`/`end` must not carry into the tree-only write —
   *  `stripDates` drops them.
   *
   *  The `moves` loop runs first, so `merged`'s insertion order matches `drop.moves`' own order
   *  (== `siblingBlockMove`'s own call order). `commitEntryEdits` (`api/gantt.ts`) iterates this map
   *  in insertion order, which is what makes it call `entries.update` in the order
   *  `siblingBlockMove` assumed the target group's indices would be written in — do not reorder
   *  this loop. */
  #writesWithPlace(
    writes: ProposedEdits,
    paints: ProposedEdits,
    moves: readonly PlacedEntry[],
  ): ProposedEdits {
    const merged = new Map<EntryId, ProposedEdit>();
    for (const move of moves) {
      const dateEdit = writes.get(move.id);
      // A reorder drafts no dates, so its tree write starts empty — `paints` holds nothing for it
      // to strip, unlike a move's own deriving-parent id (which still owes `#movedTopMost` a lookup).
      const treeEdit = dateEdit ?? stripDates(paints.get(move.id)) ?? emptyProposedEdit();
      // #425: a same-parent drop writes only `siblingIndex` (`capability.ts`'s `canPlace` advertises
      // exactly this — same parent needs no open `parentId` cell). Naming `parentId` here whenever
      // it still equals `move.currentPlace.parentId` would ask a closed cell to accept a write the
      // drop never makes, and `entries.update` asserts every named key.
      const reparents = move.place.parentId !== move.currentPlace.parentId;
      merged.set(move.id, {
        ...treeEdit,
        ...(reparents ? { parentId: move.place.parentId } : {}),
        siblingIndex: move.at,
        proposedKeys: new Set([
          ...treeEdit.proposedKeys,
          ...(reparents ? (['parentId'] as const) : []),
          'siblingIndex',
        ]),
      });
    }
    for (const [id, edit] of writes) {
      if (!merged.has(id)) merged.set(id, edit);
    }
    return merged;
  }

  /** The dates one drafted edit proposes for one entry — what `event.entries` carries, and what
   *  `#commit` guards the grabbed bar's own span on.
   *
   *  The edit is read over the entry's committed span (`spanAfterEdit`), never taken alone: a resize
   *  names the one edge it moves and holds the other (ADR 0026), so the edit by itself is half a
   *  span. A date neither the edit nor the entry holds stays absent — a half-dated descendant moves
   *  the date it holds and gains no second one (ADR 0013).
   *
   *  An entry the store no longer holds falls back to the edit's own dates: the write is about to
   *  report `entry-gone` (`#finishCommit`), and the payload says what the gesture asked for. */
  #proposedDatesOf(id: EntryId, edit: ProposedEdit | undefined): ProposedDates {
    const dates: { entry: EntryId; start?: Instant; end?: Instant } = { entry: id };
    if (edit === undefined) return dates;
    const committed = this.#deps.entryById(id);
    const span = committed === undefined ? edit : spanAfterEdit(committed, edit);
    if (span.start !== undefined) dates.start = span.start;
    if (span.end !== undefined) dates.end = span.end;
    return dates;
  }

  /** `beforeEntryMove`/`beforeEntryResize` → one commit → `entryMove`/`entryResize`.
   *  Event names come from `gesture.kind` once; `#settle` is the one veto/write path.
   *  `commitEntryEdits` does the actual write and folds a sync veto and a `MutationCancelledError`
   *  into one `false`. A `before*` handler that returns a Promise instead of resolving synchronously
   *  holds the **commit draft** as preview and marks the bars `pending` until it settles. */
  #commit(gesture: EntryGesture, proposal: GestureProposal): Promise<boolean> {
    this.#scheduledCursorX = undefined;
    // A refused drop (or any drag whose draft ended up writing nothing) leaves the pointer up with
    // no commit to settle — `#settle` never runs, so its own `#preview(undefined)` never fires
    // either. Clear the paint here instead, or a refused row keeps its highlight until a later
    // gesture happens to preview over it.
    if (proposal.writes.size === 0) {
      this.#announceRefusedDrop(proposal);
      this.#preview(undefined);
      return Promise.resolve(false);
    }
    // The grabbed bar draws, so it spans (`spansTime`, ADR 0012) — a parent bar included, whose
    // envelope this reads off the paint side because the write side never holds it (ADR 0013). A
    // reorder grabs a row, not a bar, so an undated Entry (a new task, an undated parent) still
    // reorders — the span guard is a bar's own rule (#602).
    const grabbed = this.#proposedDatesOf(proposal.grabbed, proposal.paints.get(proposal.grabbed));
    if (gesture.kind !== 'reorder' && !spansTime(grabbed)) return Promise.resolve(false);
    const spans = [...proposal.writes].map(([id, edit]) => this.#proposedDatesOf(id, edit));
    const barIds = [...proposal.paints.keys()].map((id) => barId(id));
    // #210: the same note goes out on the `before*` payload and comes back in the refusal, so a
    // handler's `refuse('…')` reaches the report core raises for its veto. `Refusable` belongs to
    // the `before*` payload alone (event-bus.ts's map already types `entryMove`/`entryResize`
    // without it) — the after-emit below gets its own payload, built from the same base but never
    // carrying `refuse`.
    const note = new RefusalNote();
    // `spansTime(grabbed)` restates what the guard above already refused for a resize — this is
    // the one place `EntryResize`'s required span needs it narrowed through the type checker too.
    const event =
      gesture.kind === 'resize' && spansTime(grabbed)
        ? {
            before: 'beforeEntryResize' as const,
            after: 'entryResize' as const,
            afterPayload: { ...grabbed, entries: spans, edge: gesture.edge } satisfies EntryResize,
          }
        : {
            before: 'beforeEntryMove' as const,
            after: 'entryMove' as const,
            afterPayload: this.#entryMoveFor(proposal, grabbed, spans),
          };
    // One payload shape, spelled once. The `before*` copy adds the note; nothing removes it again.
    const beforePayload = { ...event.afterPayload, refuse: note.refuse } satisfies Refusable;
    const before = this.#deps.emit(event.before, beforePayload);
    const refusal: GestureRefusal = {
      event: event.before,
      entryId: grabbed.entry,
      note,
    };
    return this.#settle(before, proposal, barIds, refusal, () => {
      const committed = this.#deps.commitEntryEdits(proposal.writes);
      if (committed) {
        this.#deps.emit(event.after, event.afterPayload);
      }
      return committed;
    });
  }

  /** What `beforeEntryMove` and `entryMove` carry: the grabbed Entry's dates, and each moved Entry's
   *  dates and tree place. */
  #entryMoveFor(
    proposal: GestureProposal,
    grabbed: ProposedDates,
    spans: readonly ProposedDates[],
  ): EntryMove {
    return {
      ...this.#movedDatesOf(proposal.grabbed, grabbed),
      ...this.#treePlaceChangeFor(proposal.grabbed, proposal.drop),
      entries: spans.map((span) => ({
        ...span,
        ...this.#treePlaceChangeFor(span.entry, proposal.drop),
        shiftsTime: this.#shiftsTime(span.entry, span),
      })),
    } satisfies EntryMove;
  }

  /** #425: this Entry's own share of `proposal.drop` — `{}` (no key at all, under
   *  `exactOptionalPropertyTypes`) for a resize, a nudge, a time-only drag, or an Entry the drop
   *  never named. `place` is where it lands, `currentPlace` where it sat before. */
  #treePlaceChangeFor(id: EntryId, drop: RowDrop): TreePlaceChange {
    if (drop.kind !== 'place') return {};
    const move = drop.moves.find((moved) => moved.id === id);
    return move === undefined ? {} : { place: move.place, currentPlace: move.currentPlace };
  }

  /** #425: did this Entry's own dates change — the question `place`'s absence cannot answer, since
   *  a vertical-only drag still reports the entry's own unchanged `start`/`end`. An id the store no
   *  longer holds errs toward `true`: the write is about to report `entry-gone`, and "nothing
   *  changed" would be the wrong thing to tell a handler about a commit that is failing. */
  #shiftsTime(id: EntryId, dates: ProposedDates): boolean {
    const committed = this.#deps.entryById(id);
    if (committed === undefined) return true;
    const startChanged = dates.start !== undefined && dates.start !== committed.start;
    const endChanged = dates.end !== undefined && dates.end !== committed.end;
    return startChanged || endChanged;
  }

  /** The grabbed Entry's dates, tagged with whether they moved — `EntryMove`'s own discriminated
   *  union, built in one place so TS sees each member. A tree-only move (`shiftsTime: false`) still
   *  carries the grabbed Entry's dates when it has them (ADR 0012 lets it, since `#commit` already
   *  guards the grabbed dates on `spansTime` before this runs). */
  #movedDatesOf(
    id: EntryId,
    dates: ProposedDates,
  ): (ProposedSpan & { readonly shiftsTime: true }) | (ProposedDates & { readonly shiftsTime: false }) {
    return this.#shiftsTime(id, dates) && spansTime(dates)
      ? { ...dates, shiftsTime: true }
      : { ...dates, shiftsTime: false };
  }

  /** Sync `true`/`false` still finish in this tick (same as before async veto). An unsettled Promise
   *  paints the commit draft and the `pending` token together, then `finish`s only after a `true`
   *  settle — `false` clears the hold and writes nothing. */
  #settle(
    result: boolean | Promise<boolean>,
    proposal: GestureProposal,
    barIds: readonly BarId[],
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
    const generation = this.#awaitVeto(barIds, proposal, refusal);
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
   *  two things happened, because the boolean cannot:
   *
   *  - The entry is gone. Another call removed it before the write (`inline-editing.ts`'s cell
   *    commit folds the same case, #137). The user's own edit is moot now.
   *  - An extender cascaded an end before its start. Core never stores that (#143), so the write is
   *    refused and the gesture drops — `'inverted-span'`, a `'warning'`, `by` the plugin. The entry
   *    keeps its stored dates. This is core declining a proposal, not core breaking.
   *  - Anything else is a fault, and `#reportCommitFault` says so. Calling a plugin's bug a refusal
   *    is the misreport #258 and #332 both ruled out, so the fault keeps its own code and severity.
   *
   *  Why the inverted span is the refusal and not the fault: the extender computed a span core
   *  defines as impossible, which is a proposal core answers. A bare `Error` out of the same hook is
   *  the extender falling over, which is a bug nobody proposed. Branch review ruled the line.
   *
   *  The user can never raise it here. `layout/gesture-draft.ts`'s `resizeEdit` clamps the dragged
   *  edge at zero length, and `nudge()` drafts through the same call, so an `InvertedSpanError` on
   *  this path always came from an extender's cascade — which is why `by` names the plugin.
   *
   *  ADR 0026 retired the outcome this used to report, `'write-refused'`, on the premise that the
   *  store only refused an envelope-only cascade against a several-Segment Entry. The
   *  premise was half true: `isEnvelopeRefusal` named `SegmentsOutOfSyncError`, which died with the
   *  Segment, and `InvertedSpanError`, which never was Segment-specific. */
  #finishCommit(finish: () => boolean, refusal: GestureRefusal): boolean {
    try {
      return finish();
    } catch (error) {
      if (error instanceof EntryNotFoundError) {
        this.#reportGestureDropped(refusal.entryId, refusal.event, 'entry-gone');
        return false;
      }
      if (error instanceof InvertedSpanError) {
        this.#reportGestureDropped(refusal.entryId, refusal.event, 'inverted-span', error);
        return false;
      }
      this.#reportCommitFault(refusal, error);
      return false;
    }
  }

  /** One report per refused gesture, sync veto and settled-`false` Promise alike. A
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
   *  #273, #377 branch review). `event` still says which gesture, the same way `buildRefusalReport`
   *  reads it for a noun — `buildGestureDroppedReport` mints its own code from it, the same way
   *  `buildRefusalReport` now mints its own. `by: 'core'` is what tells a consumer this was not their
   *  handler's veto. */
  #reportGestureDropped(
    entryId: EntryId,
    event: BeforeGestureEvent,
    droppedReason: GestureDroppedReason,
    cause?: unknown,
  ): void {
    this.#deps.raiseError(
      buildGestureDroppedReport({
        event,
        entryId,
        droppedReason,
        ...(cause !== undefined ? { cause } : {}),
      }),
    );
  }

  /** #341: the commit half of the fault `#reportExtenderFault` reports for the preview. The shape
   *  is `buildCommitFaultReport`'s (`data/error-reporting.ts`), beside the two refusal builders and
   *  the one noun table they all read. This adds the `console.error` a consumer who subscribes to
   *  nothing still needs, and it reads the sentence back off the report rather than spelling it a
   *  second time. */
  #reportCommitFault(refusal: GestureRefusal, error: unknown): void {
    const report = buildCommitFaultReport({
      event: refusal.event,
      entryId: refusal.entryId,
      cause: error,
    });
    this.#deps.raiseError(report, () => console.error(`FreeGantt: ${report.message}`, error));
  }

  /** Only reached for a `before*` handler's unsettled Promise. Holds the commit draft (not
   *  the last unsnapped pointer preview, not the stored origin) while `result` settles. Paint is one
   *  immediate `applyGestureState`, not a rAF-cleared preview plus a separate pending write. Returns
   *  this hold's generation, so `#settle` can tell a stale settle from a live one when `result`
   *  finally resolves (#272, #273 — this no longer arm-locks `session()`; see `session()`). */
  #awaitVeto(barIds: readonly BarId[], proposal: GestureProposal, refusal: GestureRefusal): number {
    const generation = ++this.#generation;
    this.#held = {
      generation,
      barIds,
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
   *  during the hold makes that delta wrong too.
   *
   *  #425: a `place` drop also snapshots the target group — its parent (if any) and every sibling
   *  a held drop landed among. A row that joins or leaves that group during the hold changes the
   *  indices `siblingBlockMove` assumed, even though no `proposal.paints` id itself was touched. */
  #measuredFrom(proposal: GestureProposal): ReadonlyMap<EntryId, StoredEntry | undefined> {
    const committed = this.#deps.committedEntriesById();
    const measuredFrom = new Map<EntryId, StoredEntry | undefined>();
    const snapshot = (id: EntryId): void => {
      measuredFrom.set(id, committed.get(id));
    };
    for (const id of proposal.paints.keys()) snapshot(id);
    snapshot(proposal.grabbed);
    if (proposal.drop.kind === 'place') {
      const { parentId } = proposal.drop.place;
      if (parentId !== undefined) snapshot(parentId);
      for (const id of this.#targetSiblingIds(parentId)) snapshot(id);
    }
    return measuredFrom;
  }

  /** #425: the committed ids of the drop's target group — root Entries for `parentId === undefined`,
   *  else that parent's own children — for `#measuredFrom` to fingerprint. */
  #targetSiblingIds(parentId: EntryId | undefined): readonly EntryId[] {
    const rows = this.#deps.rowsForDrop();
    const group = parentId === undefined ? rows.rootEntries() : rows.entryOf(parentId)?.children();
    return (group ?? []).map((entry) => entry.id);
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

  /** Coalesces on the pipeline's own rAF — a drag's every pointermove replaces the scheduled
   *  draft, but only the last one before the next frame is ever painted. */
  #preview(proposal: GestureProposal | undefined, cursorX?: number): void {
    this.#scheduledProposal = proposal;
    this.#scheduledCursorX = proposal === undefined ? undefined : cursorX;
    this.#previewFrame.request();
  }

  /** Label snaps even while the bar preview is unsnapped. */
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
  #computePreview(proposal: GestureProposal | undefined): readonly BarPreview[] | undefined {
    if (!proposal || proposal.paints.size === 0) return undefined;
    const draft = proposal.paints;
    const extenderExtra = this.#extraFor(proposal.writes);
    // #425 ruling 5: a `place` drop's own Rollup ghost — the new parent's dates rolling up to cover
    // the entry it just gained — merges in beside whatever the extension hook already ghosted.
    // A time-only drag never asks: it keeps today's silence on purpose, a follow-up's job.
    const extra =
      proposal.drop.kind === 'place'
        ? mergeProposedEditsByEntry(extenderExtra, this.#rolledUpFor(proposal.writes))
        : extenderExtra;
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
    const offsets = previewOffsets({
      proposed: draft,
      extra,
      entries,
      scale: this.#deps.timeScale(),
      minBarWidthPx: this.#deps.minBarWidthPx(),
      barForEntry: (id) => this.#deps.barForEntry(id),
    });
    if (proposal.drop.kind !== 'place') return offsets;
    // #425: a `place` drop moves the whole rigid block by one and the same pixel offset — the
    // grabbed bar, any co-selected bar, and the subtree bars a parent's translation carries with it
    // (ADR 0013) — so every entry `draft` painted takes the one `dy` the drop computes. A ghost
    // offset — the extension hook's own cascade, or ruling 5's Rollup envelope on the target it just
    // gained — never moves rows: it stays `dy: 0`, painted in place over its own row.
    const dy = this.#dyForPlace(proposal.drop.place, proposal.grabbed);
    return dy === 0 ? offsets : offsets.map((offset) => (offset.extra ? offset : { ...offset, dy }));
  }

  /** #425: the pixel offset a `place` drop's Insertion line (or, for an `into` drop, the target
   *  row's own centre) sits at, above the grabbed bar's own row centre — what makes the dragged
   *  block ride to the row the pointer chose instead of trailing the mouse by whatever offset the
   *  grab started at. `place.parentId` is defined whenever `lineY` is not (`layout/
   *  row-drop-target.ts`'s own `intoPlace` is the only place that leaves `lineY` undefined) — the
   *  `undefined` fallback below is defensive, not a case a real drop reaches. */
  #dyForPlace(place: DropPlace, grabbedId: EntryId): number {
    const rows = this.#deps.rowsForDrop();
    const sourceIndex = this.#deps.rowIndexForEntry(grabbedId);
    const sourceMid = rows.rowTop(sourceIndex) + rows.rowHeightAt(sourceIndex) / 2;
    if (place.lineY !== undefined) return place.lineY - sourceMid;
    if (place.parentId === undefined) return 0;
    const targetIndex = this.#deps.rowIndexForEntry(place.parentId);
    return rows.rowTop(targetIndex) + rows.rowHeightAt(targetIndex) / 2 - sourceMid;
  }

  /** #425: `proposal.drop` as the paint layer reads it — `RowDrop`'s own `moves`/`reason` are a
   *  commit's business, never a backend's. `undefined` for a resize, a nudge, or a time-only drag. */
  #rowDropForPaint(drop: RowDrop | undefined): InteractionState['rowDrop'] {
    if (drop === undefined || drop.kind === 'timeOnly') return undefined;
    if (drop.kind === 'refused') {
      return { refusedRowId: drop.rowId, note: ROW_DROP_REFUSAL_TEXT[drop.reason] };
    }
    const { place } = drop;
    return { rowId: place.rowId, side: place.side, depth: place.depth, lineY: place.lineY };
  }

  /** `extra = extraEditsFor(draft)`, run on the pipeline's own rAF (`#preview`'s
   *  caller) rather than on every `pointermove`. No wired seam (P1's default) means no ghost, which
   *  is what an unoccupied hook writes anyway — behaviorally identical to before this hook existed.
   *  `api/gantt.ts` wires this dep to `api/dataset.ts`'s `extraEditsFor`, which builds the
   *  `EditRequest` (`data/edit-request.ts`'s `createEditRequest`, #466) and reads the occupant's loose
   *  writes through `toEditsReading`, the same call the commit path makes (ADR 0026 — `start`/`end`
   *  are ordinary Fields now, so there is no envelope reconciliation left for this file to redo). So a
   *  drag previews exactly what it commits (#212 fix-plan review) with no second pass here.
   *
   *  #332: a bug in the extender itself (a bare `Error`, `UnknownFieldError`, an inverted span) still
   *  throws out of `extraEditsFor`. The `try` below catches it, the one place on this rAF path that
   *  can — recovered the same way `render/dom`'s `callRenderer` recovers a bad renderer: this frame
   *  paints with no cascade ghost, same as no extender installed, and the drag carries on. */
  #extraFor(draft: ProposedEdits): ProposedEdits {
    const extraEditsFor = this.#deps.extraEditsFor;
    if (extraEditsFor === undefined) return NO_EXTRA_EDITS;
    try {
      return extraEditsFor(draft);
    } catch (error) {
      this.#reportExtenderFault(error);
      return NO_EXTRA_EDITS;
    }
  }

  /** #425 ruling 5: `rolledUpEditsFor = rolledUpEditsFor(draft)`, `#computePreview`'s door onto the
   *  Rollup alone — never the extension hook, never a commit. `undefined` (no wiring, or a test-built
   *  pipeline) ghosts nothing, the same silence an unwired `extraEditsFor` leaves.
   *
   *  A plugin's own `rollUp: fn` aggregator can still throw — it is plugin code, the same as an
   *  extender, not core's own — so this needs `#extraFor`'s own recovery: catch here, the one place
   *  on this rAF path that can, and paint no Rollup ghost for that frame. */
  #rolledUpFor(draft: ProposedEdits): ProposedEdits {
    const rolledUpEditsFor = this.#deps.rolledUpEditsFor;
    if (rolledUpEditsFor === undefined) return NO_EXTRA_EDITS;
    try {
      return rolledUpEditsFor(draft);
    } catch (error) {
      this.#reportRollupFault(error);
      return NO_EXTRA_EDITS;
    }
  }

  /** #332: `by: 'plugin'`, not a specific `PluginId` — `setExtender` composes, so the hook
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

  /** #425: `#extraFor`'s own report, for the Rollup's aggregator instead of an extender — a plugin's
   *  `rollUp: fn` is the thing that threw, so this reads the same `by: 'plugin'`, `severity:
   *  'warning'` shape `#reportExtenderFault` already gives an equivalent preview-only recovery. */
  #reportRollupFault(error: unknown): void {
    const message =
      'A rollUp aggregator threw while computing the drag preview — this frame paints with no Rollup ghost.';
    this.#deps.raiseError(
      { code: 'rollup-preview-failed', message, severity: 'warning', by: 'plugin', cause: error },
      () => console.error(`FreeGantt: ${message}`, error),
    );
  }
}
