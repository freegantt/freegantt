// data/ — the #249 width/flex-pair merge invariant, in one place. `field-registry.ts`'s Field-column
// merge and `view/grid-columns.ts`'s Gantt-column merge each answer "does this declaration size
// itself at all", and each fixed the same bug independently once already (#249) by keeping `width`
// and `flex` as one pair rather than merging them key by key. `view/` may import `data/`, so this is
// the one function both call, instead of two copies drifting apart a second time.

import type { GridColumnSizing } from '../../model/index.js';

/** Either half of a `GridColumnSizing` pair, read-only and non-exclusive — what a caller has in hand
 *  before it knows which one (if either) is actually set. */
export interface ColumnSizingCandidate {
  readonly width?: number;
  readonly flex?: number;
}

/** The `width`/`flex` pair a column ends up with: `own`'s pair if it names either, `fallback`'s
 *  otherwise — never mixed key by key. A column that sizes itself at all replaces the other
 *  declaration's sizing whole, so a Gantt asking for `flex: 1` never silently loses to a `width` the
 *  fallback happened to declare. */
export function sizingOfColumn(
  own: ColumnSizingCandidate,
  fallback: ColumnSizingCandidate | undefined,
): GridColumnSizing {
  const sizesItself = own.width !== undefined || own.flex !== undefined;
  const source = sizesItself ? own : fallback;
  if (source?.width !== undefined) return { width: source.width };
  if (source?.flex !== undefined) return { flex: source.flex };
  return {};
}
