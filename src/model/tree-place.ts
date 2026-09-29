// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// Where one Entry sits in the tree, as a value a resolver hands back and an event payload can carry
// (#425). `view/row-drop.ts` computes it; the `entryMove` payload republishes it once the pipeline
// wires the drop through (#425 step 10).

import type { EntryId } from './ids.js';

/** Where one Entry sits in the tree: its parent, and its rank among that parent's children
 *  (`siblingIndex`, ADR 0034). An `entryMove` payload carries `place` (where the Entry lands) and
 *  `currentPlace` (where it sat before the drop) only when a drop changes the tree; a time-only
 *  drag carries neither key. */
export interface TreePlace {
  readonly parentId: EntryId | undefined;
  readonly siblingIndex: number;
}
