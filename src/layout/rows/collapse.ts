// layout/ — remove collapsed subtrees after filter and sort (D-S4-29).

import type { UnindexedRow } from './row-source.js';

/** Drops descendants of collapsed expandable rows and stamps `expanded` from `collapsed`. */
export function applyCollapse(rows: readonly UnindexedRow[], collapsed: ReadonlySet<string>): UnindexedRow[] {
  if (collapsed.size === 0) {
    return rows.map((row) => ({
      ...row,
      expanded: row.expandable,
    }));
  }

  const out: UnindexedRow[] = [];
  const hiddenBelowDepth: number[] = [];

  for (const row of rows) {
    while (hiddenBelowDepth.length > 0 && row.depth <= hiddenBelowDepth[hiddenBelowDepth.length - 1]!) {
      hiddenBelowDepth.pop();
    }
    if (hiddenBelowDepth.length > 0 && row.depth > hiddenBelowDepth[hiddenBelowDepth.length - 1]!) {
      continue;
    }

    const isCollapsed = row.expandable && collapsed.has(row.id);
    const expanded = row.expandable && !isCollapsed;
    out.push({ ...row, expanded });
    if (isCollapsed) hiddenBelowDepth.push(row.depth);
  }

  return out;
}
