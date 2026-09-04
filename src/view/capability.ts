// view/ — capabilities resolve once, here, over a per-kind default table (S3, D-S3-9). `interaction/`
// asks the same `can()` this file resolves (D-S3-5), and `render/dom` never asks it at all — the
// affordance ids `GanttShell` writes into `InteractionState` (D-S3-6/D-S3-8) are this resolution's
// only output on the paint side, so the same answer that hides a handle is the one that refuses the
// gesture (I14).

import type { Entry, EntryKind } from '../model/index.js';

/** A boolean pins every entry the same way; a predicate lets a consumer vary the answer per entry
 *  (U4: `interactions: { resize: e => e.kind !== 'group' }`). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean);

/** Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 *  key). */
export interface Interactions {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
  /** S5.8, D-S5-19. Defaults `true` for every kind, including a roll-up kind — unlike `move`/
   *  `resize`, a roll-up parent's own name/team/etc. cells are ordinary stored values; only its
   *  *rolling-up* Fields (`start`/`end`, a consumer's own `rollUp` field) are derived, and
   *  `inlineEditing()` refuses those per-cell, by asking the Field, not by asking the kind. */
  edit?: CapabilityRule;
}

export interface Capabilities {
  can(capability: keyof Interactions, entry: Entry): boolean;
}

/** S5.9, D-S5-22: `ctx.interaction.registerKindDefaults(kind, defaults)` — a plugin's per-kind
 *  answer, one level below a consumer's own `interactions` and one level above the library table
 *  below. Same four gestures as `Interactions`, but a plain boolean only (no predicate) — the
 *  registering plugin does not see a per-entry `entry`, only the `kind` it registered against. */
export interface KindDefaults {
  move?: boolean;
  resize?: boolean;
  select?: boolean;
  edit?: boolean;
}

/** The per-kind default table (D-S3-9), read when `interactions` says nothing for that gesture:
 *  `select` always defaults true — I14's hide half is a vacant no-op for it (D-S3-9/D-S3-10); a
 *  Rollup-derived kind (the 'group' row) refuses `move`/`resize` because the identity extender has
 *  nothing to write its children with, so a drag would commit and immediately roll back; `milestone`
 *  refuses `resize` only — it is zero-length by construction and has no edge to drag; every other
 *  kind, shipped or consumer-defined, defaults to the ordinary 'span' row. */
function defaultRule(
  capability: keyof Interactions,
  entry: Entry,
  isRollUpKind: (kind: EntryKind) => boolean,
): boolean {
  if (capability === 'select') return true;
  if (capability === 'edit') return true;
  if (isRollUpKind(entry.kind)) return false;
  if (capability === 'resize' && entry.kind === 'milestone') return false;
  return true;
}

/** `isRollUpKind` comes from the bound `Dataset` (S3, D-S3-9) — `GanttShell` passes
 *  `dataset.isRollUpKind` straight through, never `rollUpKinds` itself. `registeredDefaultsFor`
 *  (S5.9, D-S5-22) is the middle layer: the consumer's own `interactions` still wins over it, and
 *  it still wins over the library table, precedence stated once, here — `defaultRule` never sees a
 *  registered plugin default, so an unregistered kind still falls to its own row untouched. */
export function resolveCapabilities(
  interactions: Interactions | undefined,
  isRollUpKind: (kind: EntryKind) => boolean,
  registeredDefaultsFor?: (kind: EntryKind) => KindDefaults | undefined,
): Capabilities {
  return {
    can(capability, entry) {
      const rule = interactions?.[capability];
      if (rule !== undefined) return typeof rule === 'function' ? rule(entry) : rule;
      const registered = registeredDefaultsFor?.(entry.kind)?.[capability];
      if (registered !== undefined) return registered;
      return defaultRule(capability, entry, isRollUpKind);
    },
  };
}
