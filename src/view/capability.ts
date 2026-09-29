// view/ — capabilities resolve once, here. `interaction/` asks the same `can()` this file resolves.
// `render/dom` never asks it at all. The affordance ids `GanttShell` writes into
// `InteractionState` are this resolution's only output on the paint side. So one
// answer both hides a handle and refuses the gesture (I14).
//
// #256: a write names a cell. That is one Entry and one Field, which is the changeset's own shape.
// So `canWrite` is the primitive here, and a gesture asks it about the values it sets.
//
// Before this, "may this value change" had three answers at three units. `Field.editable` answered
// per Field. `Capabilities.edit` answered per Entry. The cell editor kept a third rule per cell. No
// two of them could meet. A bar move wrote `start` and `end` and asked neither Field.

import { libraryWriteRule, resolveWriteTarget, NOT_WRITABLE, WRITABLE } from '../data/write-rule.js';
import { editableOf } from '../data/fields/field-registry.js';
import type { FieldWriteRefusalReason, FieldWriteVerdict } from '../data/write-rule.js';
import type { Entry, EntryId, Field, FieldEditable, FieldKey } from '../model/index.js';
import type { CapabilityRule, GestureCapability, Capabilities, WriteRule } from '../model/index.js';

// ADR 0018: the four vocabulary types moved down to `model/`, so `EntryVariant.can` (a `layout/`
// type) can name the same `Capabilities` a consumer writes. This file still owns the resolution,
// and it republishes the names a plugin author reads off this seam.
export type { CapabilityRule, GestureCapability, Capabilities, WriteRule };

/** Why a write is refused, when the refusal is worth words. A refusal that carries no reason is
 *  already visible: no handle paints, and no editor opens. The cell editor stays silent for it
 *  (`s5.8-inline-editing.md` §1, "Which refusals speak"). `data/write-rule.ts` owns the type — the
 *  resolver moved there in ADR 0011 — and this is the name the app-author surface publishes it
 *  under. */
export type WriteRefusalReason = FieldWriteRefusalReason;

/** May this cell's value change, and if not, is the refusal worth explaining? */
export type WriteVerdict = FieldWriteVerdict;

export interface ResolvedCapabilities {
  /** `edge` narrows a `'resize'` question to one handle (#142). With no edge, `'resize'` asks
   *  whether *either* handle may resize. Every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** #256: the one answer to "may this Field's value change on this Entry". Every writer asks it:
   *  the cell editor, the resize drag, the move drag and the keyboard nudge. */
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
  /** ADR 0013, amended #470: which Entries a move of this bar writes. An ordinary bar writes itself.
   *  A parent whose `start`/`end` roll up from its children always writes the dated descendants
   *  below it, and the Rollup moves its own envelope at commit. A parent that owns its dates is an
   *  ordinary bar too: a Field there declares `rollUp: 'none'`. That move writes the parent's own
   *  dates **and** the dated descendants below it, so the whole grabbed subtree lands where the drag
   *  showed it.
   *
   *  Empty means the move writes nothing, and that is exactly what `can('move', entry)` refuses. */
  entriesMovedBy(entry: Entry): readonly Entry[];
  /** May this Entry land under this parent? A bar drag and a grid row drag both ask this. A drop
   *  within its own current parent needs only `reorder`. A drop under a different parent also needs
   *  `parentId` open. A plugin's place rule (ADR 0038) gets the final say either way. A locked
   *  `parentId` or a place rule's own refusal both refuse a drag the way `entries.update()` refuses. */
  canPlace(entry: Entry, parentId: EntryId | undefined): boolean;
}

/** What one Gantt's capability resolution reads. An object, not four positional arguments: the
 *  Field lookup joined a list that already read badly at the call site. */
export interface CapabilityInputs {
  capabilities?: Capabilities | undefined;
  /** From the bound `Dataset` — `dataset.field`. The library write rule reads the Field's own
   *  `rollUp` and `editable`. */
  fieldFor: (key: FieldKey) => Field | undefined;
  /** ADR 0018: what this row's own variant allows — the variant's `can`, for the variant this Gantt
   *  resolved for this Entry. It is one question, so it is one member. The shell resolves the
   *  variant and reads its `can` in one step, and this file never learns a variant's name. That is
   *  what keeps `plans/01` §2.5 — no `if (variant === …)` in core — true here by construction.
   *
   *  It sits one level below the consumer's own `capabilities`, and one level above the library
   *  rules. */
  variantCapabilitiesFor?: ((entry: Entry) => Capabilities | undefined) | undefined;
  /** From the bound `Dataset` — `dataset.editableOf`. The effective lock on one cell (#473): a
   *  plugin's per-entry lock rule's own answer, or the Field's own `editable` when the rule has no
   *  opinion. `canWrite` reads this **before** `capabilities`/`variantCapabilitiesFor`, and refuses
   *  outright whenever it is not `'anywhere'` — an `'api'` cell and a `'never'` cell both refuse this
   *  way. `capabilities.edit` narrows what the data layer already allows; it does not widen it. Absent
   *  in a hand-built test fixture, `canWrite` falls back to the declared Field's own `editable`
   *  unchanged. */
  editableOf?: ((id: string, key: FieldKey) => FieldEditable) | undefined;
  /** From the bound `Dataset` — the friend function `api/dataset.ts`'s `placeableOf` (ADR 0038). The
   *  effective place rule answer for a drop, same-parent and cross-parent alike: a plugin's place
   *  rule's own answer, or `'anywhere'` when the rule has no opinion. `canPlace` refuses outright
   *  whenever it is not `'anywhere'`. Absent in a hand-built test fixture, `canPlace` keeps today's
   *  `parentId`-cell-only answer. */
  placeableOf?: ((id: string, parentId: EntryId | undefined) => FieldEditable) | undefined;
}

/** One frozen empty list, so the common "this bar's move writes nothing" answer allocates nothing on
 *  the hover path (I5). */
const NOTHING_MOVES: readonly Entry[] = Object.freeze([]);

/** Is there a value here to write at all? This is structure, not policy. So it sits above every
 *  rule. No consumer predicate and no plugin default opens a cell with no stored home.
 *
 *  Two kinds of cell have none. An undeclared key names no Field. A `compute` Field computes
 *  on read and owns no home by declaration (ADR 0011); `duration` is the shipped one.
 *
 *  This check used to sit below the consumer rule. `capabilities: { edit: true }` reads like "turn
 *  editing on", and it opened the Duration cell. The editor then took a typed value, and the write
 *  went nowhere. */
function hasSomewhereToWrite(field: Field | undefined): field is Field {
  return field !== undefined && !('compute' in field);
}

/** Does this gesture mean anything for this Entry, before anyone asks what it would write? Every
 *  Entry is offered every gesture, shipped or consumer-defined — there is no stored classification
 *  left to special-case a gesture off of (ADR 0013). `canWrite` below decides whether that gesture
 *  can carry its write out.
 *
 *  A parent is *not* named here, and needs no name. Whether a *move* owns the dates it translates is
 *  `canWrite`'s question, gated by `ownsField` (#470). A *resize* asks `canWrite` alone, with no
 *  `ownsField` gate. A deriving parent's edge refuses there too, so no handle paints on a cell the
 *  data layer already refuses. This function stays one answer for every Entry, deriving or owning
 *  alike. */
function gestureIsOffered(): boolean {
  return true;
}

/** Which Fields does this gesture set, and may it set them? `move` shifts the whole bar. A leaf bar
 *  sets both dates and needs both. That is the hole #256 found: a locked `start` hid its own handle,
 *  and a move rewrote it anyway. A parent bar sets no date of its own, so it asks what its
 *  move writes instead (`moveWritesSomething`). `resize` sets the dragged edge's own Field. `select`
 *  sets nothing. `activate` (#434) sets nothing either — it opens or fires, and never itself writes
 *  a Field. `reorder` (#425) sets `siblingIndex`, and a drop that also re-parents needs `parentId` too
 *  — `canPlace` below asks that second half.
 *
 *  A leaf bar is one child Entry (ADR 0026). A drag writes that Entry's own `start`/`end` directly.
 *  There is no separate envelope Field to keep in step with it, the way `segments` once needed
 *  (`layout/gesture-draft.ts`'s `draftForResize`/`draftForMove`).
 *
 *  `data/` owns what may be written there. A write past the dragged edge's fixed side is refused
 *  before it reaches a changeset. */
function mayWriteWhatItSets(
  capability: GestureCapability,
  entry: Entry,
  edge: 'start' | 'end' | undefined,
  canWrite: (entry: Entry, field: FieldKey) => WriteVerdict,
  moveWritesSomething: (entry: Entry) => boolean,
): boolean {
  switch (capability) {
    case 'select':
    case 'activate':
      return true;
    case 'move':
      return moveWritesSomething(entry);
    case 'resize':
      // No edge asked means "either handle" — the affordance pass asks each edge by name.
      if (edge !== undefined) return canWrite(entry, edge).ok;
      return canWrite(entry, 'start').ok || canWrite(entry, 'end').ok;
    case 'reorder':
      return canWrite(entry, 'siblingIndex').ok;
    default:
      // S7's `linkCreate` must name the cells it writes here, rather than inherit an answer.
      return assertEveryGestureNamesItsWrites(capability);
  }
}

function assertEveryGestureNamesItsWrites(capability: never): never {
  throw new Error(`no write rule for gesture ${String(capability)}`);
}

/** One rule's answer, or `undefined` for "no opinion". A boolean pins every entry; a predicate may
 *  answer `undefined` and fall through to the next level. One function, so the gesture
 *  ladder and the write ladder below ask a rule the same way. */
function askCapabilityRule(rule: CapabilityRule | undefined, entry: Entry): boolean | undefined {
  return typeof rule === 'function' ? rule(entry) : rule;
}

/** The same question for a cell: one Entry and one Field (#256). */
function askWriteRule(rule: WriteRule | undefined, entry: Entry, field: FieldKey): boolean | undefined {
  return typeof rule === 'function' ? rule(entry, field) : rule;
}

/** Precedence, stated once, here. The consumer's own `capabilities` wins over the variant's own
 *  `can`. That wins over the library rules above. One ladder serves a gesture and a
 *  write alike.
 *
 *  A gesture is the conjunction of two questions, and neither substitutes for the other.
 *  `capabilities` and a variant's own `capabilities` answer *whether the gesture is offered*. `canWrite` answers
 *  *whether the values it sets may change*.
 *
 *  So `capabilities: { resize: true }` opens the handle on a variant the library would have closed. It
 *  still cannot write a Field the effective `editable` refuses — `'never'` or `'api'` alike. That
 *  refusal is decided before `capabilities`/`variantCapabilitiesFor` get a say, and neither may widen
 *  it. Only a per-entry lock rule reopens the cell. `capabilities.edit` only narrows an `'anywhere'`
 *  cell. One home for "may this value change" is the whole point (#256). */
export function resolveCapabilities(inputs: CapabilityInputs): ResolvedCapabilities {
  const { capabilities, fieldFor, variantCapabilitiesFor } = inputs;

  const canWrite = (entry: Entry, field: FieldKey): WriteVerdict => {
    const declared = fieldFor(field);
    if (!hasSomewhereToWrite(declared)) return NOT_WRITABLE;
    // The data layer refuses first, for a locked cell and a derived one alike. The consumer and
    // variant rules only narrow a cell the data layer already left open. Only a per-entry lock rule
    // reopens one — its answer is what `effectiveEditable` already holds.
    const effectiveEditable = inputs.editableOf?.(entry.id, field) ?? editableOf(declared);
    const libraryVerdict = libraryWriteRule(entry.hasChildren, declared, effectiveEditable);
    if (!libraryVerdict.ok) return libraryVerdict;
    const consumerAnswer = askWriteRule(capabilities?.edit, entry, field);
    if (consumerAnswer !== undefined) return consumerAnswer ? WRITABLE : NOT_WRITABLE;
    const variantAnswer = askWriteRule(variantCapabilitiesFor?.(entry)?.edit, entry, field);
    if (variantAnswer !== undefined) return variantAnswer ? WRITABLE : NOT_WRITABLE;
    return WRITABLE;
  };

  /** #470: does this row own the Field at all? `resolveWriteTarget` answers from the Field and
   *  structure alone. It answers before `capabilities.edit` or a variant's own `edit` gets a say,
   *  because `canWrite` puts those first. So this sits **above** `canWrite` on purpose. A consumer
   *  who answers `edit: true` must not make a deriving parent's cell look ownable: that cell still
   *  commits into `DerivedFieldNotWritableError`. Every reader of this question uses the one
   *  resolver (I14), and this is `view/`'s. */
  const ownsField = (entry: Entry, field: FieldKey): boolean =>
    resolveWriteTarget(entry.hasChildren, fieldFor(field)) === 'entry';

  /** The leaf rule, unchanged since #256: a bar that holds its own dates moves when it owns both of
   *  them and both may change. It asks about the Fields, never about the values, so a dateless leaf
   *  answers the same as a dated one. `ownsField` is a no-op for a leaf, because a childless row
   *  always owns its own Fields. On a row with children, it is what lets an owning parent's own bar
   *  move like an ordinary one (#470). */
  const movesItsOwnDates = (entry: Entry): boolean =>
    ownsField(entry, 'start') &&
    canWrite(entry, 'start').ok &&
    ownsField(entry, 'end') &&
    canWrite(entry, 'end').ok;

  /** Does `entry` hold no date that fails `test`? A date it never had cannot fail anything, so an
   *  absent `start`/`end` passes on its own. Shared by the two questions below, one per test. */
  const everyDateItHolds = (entry: Entry, test: (entry: Entry, field: FieldKey) => boolean): boolean =>
    (entry.start === undefined || test(entry, 'start')) && (entry.end === undefined || test(entry, 'end'));

  /** ADR 0013: a descendant travels with the parent bar when every date it holds may change. It is
   *  not the leaf rule above. A child with a `start` and no `end` moves that `start`. A closed `end`
   *  it never had must not stop it. */
  const mayTranslateTheDatesItHolds = (entry: Entry): boolean =>
    everyDateItHolds(entry, (e, field) => canWrite(e, field).ok);

  /** #470: does this row own every date it holds? The descendant walk below passes over an
   *  intermediate row that derives, the way `descendant.hasChildren` used to. The test is ownership
   *  now, not structure. So a Dataset that opts a Field out of the Rollup moves an intermediate
   *  owning row with the rest, instead of always skipping it. */
  const ownsTheDatesItHolds = (entry: Entry): boolean => everyDateItHolds(entry, ownsField);

  /** #470: does `entry` own any date it holds? A mixed Field, one date `rollUp: 'none'`
   *  and the other rolled up, counts too. An owned date needs this move to write it. No Rollup
   *  restores it afterward, the way a derived date does. */
  const ownsADateItHolds = (entry: Entry): boolean =>
    (entry.start !== undefined && ownsField(entry, 'start')) ||
    (entry.end !== undefined && ownsField(entry, 'end'));

  const entriesMovedBy = (entry: Entry): readonly Entry[] => {
    if (!entry.hasChildren) return movesItsOwnDates(entry) ? [entry] : NOTHING_MOVES;
    // One locked date on an owning bar refuses the whole gesture, the same as one locked descendant
    // does below. Painting the bar anyway would drag it for the whole gesture. The date it owns
    // would then go stale, since nothing rolls an owned date back up.
    if (ownsADateItHolds(entry) && !movesItsOwnDates(entry)) return NOTHING_MOVES;
    const moved: Entry[] = [];
    // #470: the leaf rule above reads an owning parent as an ordinary bar. Its own dates move with
    // its subtree, on top of the translate ADR 0013 already gives that subtree.
    if (movesItsOwnDates(entry)) moved.push(entry);
    for (const descendant of entry.descendants()) {
      // The walk passes over a descendant that derives the dates it holds, and reaches the rows
      // below it. One that owns them moves with the rest (#470) — a leaf always does.
      if (!ownsTheDatesItHolds(descendant)) continue;
      // "Children with neither date are skipped" (ADR 0013) — there is nothing to translate.
      if (descendant.start === undefined && descendant.end === undefined) continue;
      // One locked descendant refuses the whole gesture. A parent bar that moved part of its own
      // subtree would land somewhere the gesture never showed. The envelope it paints while dragging
      // is the whole subtree translated. The Rollup would then compute a different one.
      if (!mayTranslateTheDatesItHolds(descendant)) return NOTHING_MOVES;
      moved.push(descendant);
    }
    return moved;
  };

  /** Does this bar's move write anything at all? `entriesMovedBy` says *what* it writes; this says
   *  *whether*. The hover path asks this one (`can('move', …)` resolves an affordance), so an
   *  ordinary bar answers it without building a list (I5). */
  const moveWritesSomething = (entry: Entry): boolean =>
    entry.hasChildren ? entriesMovedBy(entry).length > 0 : movesItsOwnDates(entry);

  const isOffered = (capability: GestureCapability, entry: Entry): boolean => {
    const consumerAnswer = askCapabilityRule(capabilities?.[capability], entry);
    if (consumerAnswer !== undefined) return consumerAnswer;
    const variantAnswer = askCapabilityRule(variantCapabilitiesFor?.(entry)?.[capability], entry);
    if (variantAnswer !== undefined) return variantAnswer;
    return gestureIsOffered();
  };

  /** #425: does a drop under `parentId` also need `entry`'s own `parentId` cell open? Not when the
   *  drop keeps `entry` under its current parent (ADR 0024's own answer, the tree ADR 0034 checks).
   *  A same-parent reorder writes only `siblingIndex`. ADR 0038: the place rule still gets a say on
   *  a same-parent drop. The rule, not this seam, decides whether it ever narrows one. */
  const canPlace = (entry: Entry, parentId: EntryId | undefined): boolean => {
    if (
      !isOffered('reorder', entry) ||
      !mayWriteWhatItSets('reorder', entry, undefined, canWrite, moveWritesSomething)
    ) {
      return false;
    }
    if (entry.parent()?.id !== parentId && !canWrite(entry, 'parentId').ok) return false;
    return (inputs.placeableOf?.(entry.id, parentId) ?? 'anywhere') === 'anywhere';
  };

  return {
    can(capability, entry, edge) {
      if (!isOffered(capability, entry)) return false;
      return mayWriteWhatItSets(capability, entry, edge, canWrite, moveWritesSomething);
    },
    canWrite,
    entriesMovedBy,
    canPlace,
  };
}
