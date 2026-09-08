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

import { rollsUp } from '../data/fields/field-registry.js';
import type { BuiltInErrorCode, Entry, EntryKind, Field, FieldKey } from '../model/index.js';

/** A boolean pins every entry the same way; a predicate lets a consumer vary the answer per entry
 *  (U4: `interactions: { resize: e => e.kind !== 'group' }`). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean);

/** #256: the write rule takes the cell, because a write names one. Call:
 *  `interactions: { edit: (entry, field) => (entry.id === 'fixed' && field === 'end' ? false : undefined) }`.
 *
 *  `undefined` means "no opinion about this cell". The rules below then answer it, and a roll-up
 *  parent's derived cell stays refused. A predicate names one cell out of every (Entry × Field)
 *  pair on the page. So no opinion is the answer it gives most of the time.
 *
 *  A bare `boolean` over that whole space made a consumer restate every library rule to lock one
 *  cell. The harness's own first call site opened every derived cell by accident.
 *
 *  `undefined` reads the same way an `Aggregator`'s does (`model/field.ts`). A `before*` handler's
 *  reads that way too. A boolean pins every cell, with no fall-through.
 *
 *  `move`/`resize`/`select` keep a plain `CapabilityRule` on purpose. Each names one gesture over
 *  one Entry. A predicate that answers every Entry is a fair thing to ask for. */
export type WriteRule = boolean | ((entry: Entry, field: FieldKey) => boolean | undefined);

/** The gestures that arm and paint. A write is not one of them. It is the thing a gesture, a cell
 *  editor, or a keyboard nudge sets out to do, and `canWrite` decides it. */
export type GestureCapability = 'move' | 'resize' | 'select';

/** Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 *  key). */
export interface Interactions {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
  /** #256, S5.8, D-S5-19: the consumer's own answer to "may this cell's value change". It is the
   *  one override above `Field.editable`, and the only per-entry axis that key has.
   *
   *  It gates the inline cell editor, the bar's resize handles and the bar move alike. All three
   *  write a cell (I14). `Field.editable` states which Fields are writable at all. This states which
   *  of them are writable *here*. Answer `undefined` for a cell this rule says nothing about. */
  edit?: WriteRule;
}

/** Why a write is refused, when the refusal is worth words. A refusal that carries no reason is
 *  already visible: no handle paints, and no editor opens. The cell editor stays silent for it
 *  (`s5.8-inline-editing.md` §1, "Which refusals speak"). One spelling, shared with
 *  `model/error-report.ts`'s `BuiltInErrorCode` and the cell editor's own `REFUSAL_TEXT`. */
export type WriteRefusalReason = Extract<BuiltInErrorCode, 'derived-value'>;

/** May this cell's value change, and if not, is the refusal worth explaining? */
export type WriteVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason?: WriteRefusalReason };

// One verdict object per answer, frozen and shared. `canWrite` sits behind hover affordance
// resolution. A verdict built per hover would allocate where the hot path must not (I5). This is the
// shape `gesture-pipeline.ts`'s own `NO_EXTRA_EDITS` uses: a frozen constant, never a singleton that
// holds state (no module-level singletons, plans/01 §6).
const WRITABLE: WriteVerdict = Object.freeze({ ok: true });
const NOT_WRITABLE: WriteVerdict = Object.freeze({ ok: false });
const DERIVED: WriteVerdict = Object.freeze({ ok: false, reason: 'derived-value' as const });

export interface Capabilities {
  /** `edge` narrows a `'resize'` question to one handle (#142). With no edge, `'resize'` asks
   *  whether *either* handle may resize. Every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** #256: the one answer to "may this Field's value change on this Entry". Every writer asks it:
   *  the cell editor, the resize drag, the move drag and the keyboard nudge. */
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
}

/** S5.9, D-S5-22: `ctx.interaction.registerKindDefaults(kind, defaults)` is a plugin's per-kind
 *  answer. It sits one level below a consumer's own `interactions`, and one level above the library
 *  rules. It carries the same keys as `Interactions`, but a plain boolean only.
 *
 *  A registering plugin never sees an `entry`, and for `edit` it never sees a `field` either. So it
 *  has nothing to write a predicate against. This type is mapped from `Interactions` (#148), so a
 *  future gesture key (S7's `linkCreate`) cannot land on one interface and miss the other. */
export type KindDefaults = { [K in keyof Interactions]?: boolean };

/** What one Gantt's capability resolution reads. An object, not four positional arguments: the
 *  Field lookup joined a list that already read badly at the call site. */
export interface CapabilityInputs {
  interactions?: Interactions | undefined;
  /** From the bound `Dataset` — `GanttShell` passes `dataset.isRollUpKind` straight through, never
   *  `rollUpKinds` itself (S3, D-S3-9). */
  isRollUpKind: (kind: EntryKind) => boolean;
  /** From the bound `Dataset` — `dataset.field`. The library write rule reads three keys off it:
   *  `source`, `rollUp` and `editable`. */
  fieldFor: (key: FieldKey) => Field | undefined;
  /** S5.9, D-S5-22. */
  registeredDefaultsFor?: ((kind: EntryKind) => KindDefaults | undefined) | undefined;
}

/** The library's own last word on a cell. It is read when neither the consumer nor a plugin speaks.
 *
 *  The Rollup pass writes a roll-up parent's rolling-up Field off its children. A user write there
 *  would commit, and the next Rollup would overwrite it. That refusal is worth words, and they are
 *  the words the cell editor has always shown. `rollsUp` is the Rollup pass's own test, so this
 *  refuses exactly the set that pass would overwrite.
 *
 *  Everything else is the Field's own `editable`, which defaults to `false`. */
function libraryWriteRule(
  entry: Entry,
  field: Field,
  isRollUpKind: (kind: EntryKind) => boolean,
): WriteVerdict {
  if (isRollUpKind(entry.kind) && rollsUp(field)) return DERIVED;
  return field.editable === true ? WRITABLE : NOT_WRITABLE;
}

/** Is there a value here to write at all? This is structure, not policy. So it sits above every
 *  rule. No consumer predicate and no plugin default opens a cell with no stored home.
 *
 *  Two kinds of cell have none. An undeclared key names no Field. A `compute`-sourced Field computes
 *  on read and owns no home by declaration (ADR 0005); `duration` is the shipped one.
 *
 *  This check used to sit below the consumer rule. `interactions: { edit: true }` reads like "turn
 *  editing on", and it opened the Duration cell. The editor then took a typed value, and the write
 *  went nowhere. */
function hasSomewhereToWrite(field: Field | undefined): field is Field {
  return field !== undefined && field.source?.from !== 'compute';
}

/** Does this gesture mean anything for this Entry, before anyone asks what it would write? A
 *  milestone is zero-length by construction, so it has no edge to drag. `select` writes nothing, so
 *  it is always offered. I14's hide half is a vacant no-op for it (D-S3-9/D-S3-10). Every other
 *  kind is offered every gesture, shipped or consumer-defined. `canWrite` below then decides
 *  whether that gesture can carry its write out.
 *
 *  A roll-up kind is *not* named here, and needs no name. Its `start` and `end` both roll up, so
 *  `canWrite` closes both edges already. That closes move and resize with them. */
function gestureIsOffered(capability: GestureCapability, entry: Entry): boolean {
  if (capability === 'resize' && entry.kind === 'milestone') return false;
  return true;
}

/** Which dates does this gesture set, and may it set them? `move` shifts the whole bar. So it sets
 *  both dates and needs both. This is the hole #256 found: a locked `start` hid its own handle, and
 *  a move rewrote it anyway. `resize` sets the dragged edge's own Field. `select` sets nothing.
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
): boolean {
  switch (capability) {
    case 'select':
      return true;
    case 'move':
      return canWrite(entry, 'start').ok && canWrite(entry, 'end').ok;
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

/** Precedence, stated once, here. The consumer's own `interactions` wins over a plugin's registered
 *  per-kind default. That wins over the library rules above. One ladder serves a gesture and a
 *  write alike.
 *
 *  A gesture is the conjunction of two questions, and neither substitutes for the other.
 *  `interactions` and a plugin default answer *whether the gesture is offered*. `canWrite` answers
 *  *whether the values it sets may change*.
 *
 *  So `interactions: { resize: true }` opens the handle on a kind the library would have closed. It
 *  still cannot write a Field the consumer declared `editable: false`. To open that, open the Field,
 *  or answer `interactions.edit` for the cell. One home for "may this value change" is the whole
 *  point (#256). */
export function resolveCapabilities(inputs: CapabilityInputs): Capabilities {
  const { interactions, isRollUpKind, fieldFor, registeredDefaultsFor } = inputs;

  const canWrite = (entry: Entry, field: FieldKey): WriteVerdict => {
    const declared = fieldFor(field);
    if (!hasSomewhereToWrite(declared)) return NOT_WRITABLE;
    const rule = interactions?.edit;
    const answer = typeof rule === 'function' ? rule(entry, field) : rule;
    if (answer !== undefined) return answer ? WRITABLE : NOT_WRITABLE;
    const registered = registeredDefaultsFor?.(entry.kind)?.edit;
    if (registered !== undefined) return registered ? WRITABLE : NOT_WRITABLE;
    return libraryWriteRule(entry, declared, isRollUpKind);
  };

  const isOffered = (capability: GestureCapability, entry: Entry): boolean => {
    const rule = interactions?.[capability];
    if (rule !== undefined) return typeof rule === 'function' ? rule(entry) : rule;
    const registered = registeredDefaultsFor?.(entry.kind)?.[capability];
    if (registered !== undefined) return registered;
    return gestureIsOffered(capability, entry);
  };

  return {
    can(capability, entry, edge) {
      if (!isOffered(capability, entry)) return false;
      return mayWriteTheDatesItSets(capability, entry, edge, canWrite);
    },
    canWrite,
  };
}
