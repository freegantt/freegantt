// view/ — capabilities resolve once, here. `interaction/` asks the same `can()` this file resolves
// (D-S3-5), and `render/dom` never asks it at all — the affordance ids `GanttShell` writes into
// `InteractionState` (D-S3-6/D-S3-8) are this resolution's only output on the paint side, so the
// same answer that hides a handle is the one that refuses the gesture (I14).
//
// #256: a write's unit is the cell — one Entry, one Field, which is the changeset's own shape. So
// `canWrite` is the primitive here, and every gesture that writes a value is a conjunction over the
// cells it writes. Before this, "may this value change" was answered at three units that could not
// meet: per Field (`Field.editable`), per Entry (`Interactions.edit`), and per cell (a rule the cell
// editor kept to itself). A bar move wrote `start` and `end` without asking either Field.

import type { Entry, EntryKind, Field, FieldKey } from '../model/index.js';

/** A boolean pins every entry the same way; a predicate lets a consumer vary the answer per entry
 *  (U4: `interactions: { resize: e => e.kind !== 'group' }`). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean);

/** #256: the write rule takes the cell, because a write names one. Call:
 *  `interactions: { edit: (entry, field) => entry.id !== 'locked' || field !== 'end' }`. A boolean
 *  pins every cell the same way. */
export type WriteRule = boolean | ((entry: Entry, field: FieldKey) => boolean);

/** The gestures that arm and paint. A write is not one of them — it is what a gesture, a cell
 *  editor, or a keyboard nudge asks permission to do, and `canWrite` answers that. */
export type GestureCapability = 'move' | 'resize' | 'select';

/** Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 *  key). */
export interface Interactions {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
  /** #256, S5.8, D-S5-19: the consumer's own answer to "may this cell's value change" — the one
   *  override above `Field.editable`, and the only per-entry axis that key has. It gates the inline
   *  cell editor, the bar's resize handles, and the bar move alike, because all three write a cell
   *  (I14). `Field.editable` states which Fields are writable at all; this states which of them are
   *  writable *here*. */
  edit?: WriteRule;
}

/** Why a write is refused, when the refusal is worth words. A cell whose refusal carries no reason
 *  already shows it — no handle painted, no editor offered — so the cell editor stays silent for it
 *  (`s5.8-inline-editing.md` §1, "Which refusals speak"). One spelling, shared with
 *  `model/error-report.ts`'s `BuiltInErrorCode` and the cell editor's own `REFUSAL_TEXT`. */
export type WriteRefusalReason = 'derived-value';

/** May this cell's value change, and if not, is the refusal worth explaining? */
export type WriteVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason?: WriteRefusalReason };

// One verdict object per answer, frozen and shared: `canWrite` sits behind hover affordance
// resolution, and a verdict allocated per hover would be an allocation the hot path does not need
// (I5). The same shape `gesture-pipeline.ts`'s own `NO_EXTRA_EDITS` uses — a frozen constant, not a
// singleton holding state (no module-level singletons, plans/01 §6).
const WRITABLE: WriteVerdict = Object.freeze({ ok: true });
const NOT_WRITABLE: WriteVerdict = Object.freeze({ ok: false });
const DERIVED: WriteVerdict = Object.freeze({ ok: false, reason: 'derived-value' as const });

export interface Capabilities {
  /** `edge` narrows a `'resize'` question to one handle (#142). With no edge, `'resize'` asks
   *  whether *either* handle may resize. Every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** #256: the one answer to "may this Field's value change on this Entry", asked by every writer —
   *  the cell editor, the resize drag, the move drag, the keyboard nudge. */
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
}

/** S5.9, D-S5-22: `ctx.interaction.registerKindDefaults(kind, defaults)` — a plugin's per-kind
 *  answer, one level below a consumer's own `interactions` and one level above the library rules
 *  below. Same keys as `Interactions`, but a plain boolean only (no predicate) — the registering
 *  plugin does not see a per-entry `entry`, and for `edit` it does not see a per-cell `field`
 *  either. Mapped from `Interactions` (#148) so a future gesture key (S7's `linkCreate`) cannot land
 *  on one interface and be forgotten on the other. */
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

/** The library's own last word on a cell, read when neither the consumer nor a plugin says anything.
 *
 *  A `compute`-sourced Field is computed on read and owns no stored home (ADR 0005), so there is
 *  nothing to write — `duration` needs no `editable: false` to say so. A roll-up parent's rolling-up
 *  Field is written by the Rollup pass off its children, so a user write there would commit and be
 *  overwritten; that refusal is worth words, and it is the same one the cell editor has always
 *  shown. Everything else is the Field's own `editable`, which defaults to `false`. */
function libraryWriteRule(
  entry: Entry,
  field: Field | undefined,
  isRollUpKind: (kind: EntryKind) => boolean,
): WriteVerdict {
  if (field === undefined) return NOT_WRITABLE;
  if (field.source?.from === 'compute') return NOT_WRITABLE;
  if (isRollUpKind(entry.kind) && field.rollUp !== undefined) return DERIVED;
  return field.editable === true ? WRITABLE : NOT_WRITABLE;
}

/** Does this gesture mean anything for this Entry, before anyone asks what it would write? A
 *  milestone is zero-length by construction, so it has no edge to drag. `select` writes nothing, so
 *  it is always offered — I14's hide half is a vacant no-op for it (D-S3-9/D-S3-10). Every other
 *  kind, shipped or consumer-defined, is offered every gesture, and `canWrite` below decides whether
 *  it can carry one out.
 *
 *  A roll-up kind is *not* named here, and does not need to be: its `start` and `end` both roll up,
 *  so `canWrite` already closes both edges, which closes move and resize alike. */
function gestureIsOffered(capability: GestureCapability, entry: Entry): boolean {
  if (capability === 'resize' && entry.kind === 'milestone') return false;
  return true;
}

/** Which cells a gesture writes. `move` shifts the whole bar, so it writes both dates and needs both
 *  (this is the hole #256 opened: a locked `start` hid its handle and a move rewrote it anyway).
 *  `resize` writes the dragged edge's own Field. `select` writes nothing. */
function gestureCanWriteWhatItNeeds(
  capability: GestureCapability,
  entry: Entry,
  edge: 'start' | 'end' | undefined,
  canWrite: (entry: Entry, field: FieldKey) => WriteVerdict,
): boolean {
  if (capability === 'select') return true;
  if (capability === 'move') return canWrite(entry, 'start').ok && canWrite(entry, 'end').ok;
  if (edge !== undefined) return canWrite(entry, edge).ok;
  return canWrite(entry, 'start').ok || canWrite(entry, 'end').ok;
}

/** Precedence, stated once, here: the consumer's own `interactions` wins over a plugin's registered
 *  per-kind default, which wins over the library rules above. It is the same ladder for a gesture and
 *  for a write.
 *
 *  A gesture is the conjunction of the two questions, never a substitute for either: `interactions`
 *  and a plugin default answer *whether the gesture is offered*, and `canWrite` answers *whether the
 *  values it writes may change*. So `interactions: { resize: true }` opens the handle on a kind the
 *  library would have closed, and still cannot write a Field the consumer declared `editable: false`
 *  — to open that, open the Field, or answer `interactions.edit` for the cell. One home for "may this
 *  value change" is the whole point (#256). */
export function resolveCapabilities(inputs: CapabilityInputs): Capabilities {
  const { interactions, isRollUpKind, fieldFor, registeredDefaultsFor } = inputs;

  const canWrite = (entry: Entry, field: FieldKey): WriteVerdict => {
    const rule = interactions?.edit;
    if (rule !== undefined) {
      const allowed = typeof rule === 'function' ? rule(entry, field) : rule;
      return allowed ? WRITABLE : NOT_WRITABLE;
    }
    const registered = registeredDefaultsFor?.(entry.kind)?.edit;
    if (registered !== undefined) return registered ? WRITABLE : NOT_WRITABLE;
    return libraryWriteRule(entry, fieldFor(field), isRollUpKind);
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
      return gestureCanWriteWhatItNeeds(capability, entry, edge, canWrite);
    },
    canWrite,
  };
}
