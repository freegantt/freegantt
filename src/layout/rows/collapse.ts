// layout/ — remove collapsed subtrees after filter and sort (D-S4-29).

import type { RowId } from '../../model/index.js';
import type { UnindexedRow } from './row-source.js';

/** Drops descendants of collapsed expandable rows and stamps `expanded` from `collapsed`. */
export function applyCollapse(rows: readonly UnindexedRow[], collapsed: ReadonlySet<string>): UnindexedRow[] {
  const hidden = new Set<RowId>();
  const out: UnindexedRow[] = [];

  for (const row of rows) {
    const parentHidden = row.parentRowId !== undefined && hidden.has(row.parentRowId);
    if (parentHidden) {
      hidden.add(row.id);
      continue;
    }

    const isCollapsed = row.expandable && collapsed.has(row.id);
    out.push({ ...row, expanded: row.expandable && !isCollapsed });
    if (isCollapsed) hidden.add(row.id);
  }

  return out;
}
