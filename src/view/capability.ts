// view/ — capabilities resolve once, here. `interaction/` asks the same `can()` this file resolves
// (D-S3-5). `render/dom` never asks it at all. The affordance ids `GanttShell` writes into
// `InteractionState` (D-S3-6/D-S3-8) are this resolution's only output on the paint side. So one
// answer both hides a handle and refuses the gesture (I14).
//
// #256: a write names a cell. That is one Entry and one Field, which is the changeset's own shape.
// So `canWrite` is the primitive here, and a gesture asks it about the values it sets.
//
// Before this, "may this value change" had three answers at three units. `Field.editable` answered
// per Field. `Interactions.edit` answered per Entry. The cell editor kept a third rule per cell. No
// two of them could meet. A bar move wrote `start` and `end` and asked neither Field.

import { libraryWriteRule, WRITABLE, NOT_WRITABLE } from '../data/write-rule.js';
import type { FieldWriteRefusalReason, FieldWriteVerdict } from '../data/write-rule.js';
import type { Entry, Field, FieldKey } from '../model/index.js';
import type { CapabilityRule, GestureCapability, Interactions, WriteRule } from '../model/index.js';

// ADR 0018: the four vocabulary types moved down to `model/`, so `EntryVariant.can` (a `layout/`
// type) can name the same `Interactions` a consumer writes. This file still owns the resolution,
// and it republishes the names a plugin author reads off this seam.
export type { CapabilityRule, GestureCapability, Interactions, WriteRule };

/** Why a write is refused, when the refusal is worth words. A refusal that carries no reason is
 *  already visible: no handle paints, and no editor opens. The cell editor stays silent for it
 *  (`s5.8-inline-editing.md` §1, "Which refusals speak"). `data/write-rule.ts` owns the type — the
 *  resolver moved there in ADR 0011 — and this is the name the app-author surface publishes it
 *  under. */
export type WriteRefusalReason = FieldWriteRefusalReason;

/** May this cell's value change, and if not, is the refusal worth explaining? */
export type WriteVerdict = FieldWriteVerdict;

export interface Capabilities {
  /** `edge` narrows a `'resize'` question to one handle (#142). With no edge, `'resize'` asks
   *  whether *either* handle may resize. Every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** #256: the one answer to "may this Field's value change on this Entry". Every writer asks it:
   *  the cell editor, the resize drag, the move drag and the keyboard nudge. */
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
  /** ADR 0013: which Entries a move of this bar writes. An ordinary bar writes itself. A parent's
   *  own `start`/`end` roll up from its children. So a parent bar writes the dated descendants below
   *  it instead, and the Rollup moves the parent's own envelope at commit.
   *
   *  Empty means the move writes nothing, and that is exactly what `can('move', entry)` refuses. */
  entriesMovedBy(entry: Entry): readonly Entry[];
}

/** What one Gantt's capability resolution reads. An object, not four positional arguments: the
 *  Field lookup joined a list that already read badly at the call site. */
export interface CapabilityInputs {
  interactions?: Interactions | undefined;
  /** From the bound `Dataset` — `dataset.field`. The library write rule reads the Field's own
   *  `rollUp` and `editable`. */
  fieldFor: (key: FieldKey) => Field | undefined;
  /** ADR 0018: what this row's own variant allows — the variant's `can`, for the variant this Gantt
   *  resolved for this Entry. It is one question, so it is one member. The shell resolves the
   *  variant and reads its `can` in one step, and this file never learns a variant's name. That is
   *  what keeps `plans/01` §2.5 — no `if (variant === …)` in core — true here by construction.
   *
   *  It sits one level below the consumer's own `interactions`, and one level above the library
   *  rules. */
  variantInteractionsFor?: ((entry: Entry) => Interactions | undefined) | undefined;
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
 *  This check used to sit below the consumer rule. `interactions: { edit: true }` reads like "turn
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
 *  A parent is *not* named here, and needs no name. Its `start` and `end` both roll up, so it writes
 *  no date of its own. What a parent bar's move writes is the subtree below it (ADR 0013), and
 *  `entriesMovedBy` answers that. Resize stays closed on a parent: one edge of a derived envelope
 *  names no descendant to resize. */
function gestureIsOffered(): boolean {
  return true;
}

/** Which dates does this gesture set, and may it set them? `move` shifts the whole bar. A leaf bar
 *  sets both dates and needs both. That is the hole #256 found: a locked `start` hid its own handle,
 *  and a move rewrote it anyway. A parent bar sets no date of its own, so it asks what its
 *  move writes instead (`moveWritesSomething`). `resize` sets the dragged edge's own Field. `select`
 *  sets nothing.
 *
 *  A drag also writes `segments`, and this asks nothing about that Field. `segments` is not a second
 *  value the user aims at. It is where the same span is stored, and `draftForResize` recomputes the
 *  envelope from it (`layout/gesture-draft.ts`).
 *
 *  `data/` owns what may be written there. A direct envelope write on a multi-Segment Entry raises
 *  `SegmentsOutOfSyncError`, because an envelope alone names no Segment to move. */
function mayWriteTheDatesItSets(
  capability: GestureCapability,
  entry: Entry,
  edge: 'start' | 'end' | undefined,
  canWrite: (entry: Entry, field: FieldKey) => WriteVerdict,
  moveWritesSomething: (entry: Entry) => boolean,
): boolean {
  switch (capability) {
    case 'select':
      return true;
    case 'move':
      return moveWritesSomething(entry);
    case 'resize':
      // No edge asked means "either handle" — the affordance pass asks each edge by name.
      if (edge !== undefined) return canWrite(entry, edge).ok;
      return canWrite(entry, 'start').ok || canWrite(entry, 'end').ok;
    default:
      // S7's `linkCreate` must name the cells it writes here, rather than inherit an answer.
      return assertEveryGestureNamesItsWrites(capability);
  }
}

function assertEveryGestureNamesItsWrites(capability: never): never {
  throw new Error(`no write rule for gesture ${String(capability)}`);
}

/** One rule's answer, or `undefined` for "no opinion". A boolean pins every entry; a predicate may
 *  answer `undefined` and fall through to the next level (`J13`). One function, so the gesture
 *  ladder and the write ladder below ask a rule the same way. */
function askCapabilityRule(rule: CapabilityRule | undefined, entry: Entry): boolean | undefined {
  return typeof rule === 'function' ? rule(entry) : rule;
}

/** The same question for a cell: one Entry and one Field (#256). */
function askWriteRule(rule: WriteRule | undefined, entry: Entry, field: FieldKey): boolean | undefined {
  return typeof rule === 'function' ? rule(entry, field) : rule;
}

/** Precedence, stated once, here. The consumer's own `interactions` wins over the variant's own
 *  `can`. That wins over the library rules above. One ladder serves a gesture and a
 *  write alike.
 *
 *  A gesture is the conjunction of two questions, and neither substitutes for the other.
 *  `interactions` and a variant's `can` answer *whether the gesture is offered*. `canWrite` answers
 *  *whether the values it sets may change*.
 *
 *  So `interactions: { resize: true }` opens the handle on a variant the library would have closed. It
 *  still cannot write a Field the consumer declared `editable: false`. To open that, open the Field,
 *  or answer `interactions.edit` for the cell. One home for "may this value change" is the whole
 *  point (#256). */
export function resolveCapabilities(inputs: CapabilityInputs): Capabilities {
  const { interactions, fieldFor, variantInteractionsFor } = inputs;

  const canWrite = (entry: Entry, field: FieldKey): WriteVerdict => {
    const declared = fieldFor(field);
    if (!hasSomewhereToWrite(declared)) return NOT_WRITABLE;
    const consumerAnswer = askWriteRule(interactions?.edit, entry, field);
    if (consumerAnswer !== undefined) return consumerAnswer ? WRITABLE : NOT_WRITABLE;
    const variantAnswer = askWriteRule(variantInteractionsFor?.(entry)?.edit, entry, field);
    if (variantAnswer !== undefined) return variantAnswer ? WRITABLE : NOT_WRITABLE;
    return libraryWriteRule(entry.hasChildren, declared);
  };

  /** The leaf rule, unchanged since #256: a bar that holds its own dates moves when both of them may
   *  change. It asks about the Fields, never about the values, so a dateless leaf answers the same
   *  as a dated one. */
  const movesItsOwnDates = (entry: Entry): boolean =>
    canWrite(entry, 'start').ok && canWrite(entry, 'end').ok;

  /** ADR 0013: a descendant travels with the parent bar when every date it holds may change. It is
   *  not the leaf rule above. A child with a `start` and no `end` moves that `start`. A closed `end`
   *  it never had must not stop it. */
  const mayTranslateTheDatesItHolds = (entry: Entry): boolean =>
    (entry.start === undefined || canWrite(entry, 'start').ok) &&
    (entry.end === undefined || canWrite(entry, 'end').ok);

  const entriesMovedBy = (entry: Entry): readonly Entry[] => {
    if (!entry.hasChildren) return movesItsOwnDates(entry) ? [entry] : NOTHING_MOVES;
    const moved: Entry[] = [];
    for (const descendant of entry.descendants()) {
      // A descendant with children of its own derives its dates the same way this parent does.
      // The walk passes over it, and reaches the dated rows below it.
      if (descendant.hasChildren) continue;
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
    const consumerAnswer = askCapabilityRule(interactions?.[capability], entry);
    if (consumerAnswer !== undefined) return consumerAnswer;
    const variantAnswer = askCapabilityRule(variantInteractionsFor?.(entry)?.[capability], entry);
    if (variantAnswer !== undefined) return variantAnswer;
    return gestureIsOffered();
  };

  return {
    can(capability, entry, edge) {
      if (!isOffered(capability, entry)) return false;
      return mayWriteTheDatesItSets(capability, entry, edge, canWrite, moveWritesSomething);
    },
    canWrite,
    entriesMovedBy,
  };
}
