// view/ — capabilities resolve once, here, over a per-kind default table (S3, D-S3-9). `interaction/`
// asks the same `can()` this file resolves (D-S3-5), and `render/dom` never asks it at all — the
// affordance ids `GanttShell` writes into `InteractionState` (D-S3-6/D-S3-8) are this resolution's
// only output on the paint side, so the same answer that hides a handle is the one that refuses the
// gesture (I14).

import type { Entry, EntryKind } from '../model/index.js';

/** A boolean pins every entry the same way; a predicate lets a consumer vary the answer per entry
 *  (U4: `interactions: { resize: e => e.kind !== 'group' }`). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean);

/** Live (S3, D-S3-9). `linkCreate`/`edit` stay off this type until S7/S5 (I11: no unimplemented
 *  public key). */
export interface Interactions {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
}

export interface Capabilities {
  can(capability: keyof Interactions, entry: Entry): boolean;
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
  isDerivedSpanKind: (kind: EntryKind) => boolean,
): boolean {
  if (capability === 'select') return true;
  if (isDerivedSpanKind(entry.kind)) return false;
  if (capability === 'resize' && entry.kind === 'milestone') return false;
  return true;
}

/** `isDerivedSpanKind` comes from the bound `Dataset` (S3, D-S3-9) — `GanttShell` passes
 *  `dataset.isDerivedSpanKind` straight through, never `derivedSpanKinds` itself. */
export function resolveCapabilities(
  interactions: Interactions | undefined,
  isDerivedSpanKind: (kind: EntryKind) => boolean,
): Capabilities {
  return {
    can(capability, entry) {
      const rule = interactions?.[capability];
      if (rule === undefined) return defaultRule(capability, entry, isDerivedSpanKind);
      return typeof rule === 'function' ? rule(entry) : rule;
    },
  };
}
