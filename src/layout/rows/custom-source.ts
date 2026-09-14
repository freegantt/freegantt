// layout/ — `{ source: 'custom' }`. Adapts public CustomRow once; PlannedRow stays internal (D-S4-21).

import { DuplicateRowIdError, entryId, rowId } from '../../model/index.js';
import type { CustomRowInput, CustomRowSource, UnindexedRow } from './row-source.js';
import { PLANNED_ROW_KIND } from './row-source.js';

export function resolveCustomSource(source: CustomRowSource, input: CustomRowInput): UnindexedRow[] {
  const customRows = source.resolve(input);
  const seen = new Set<string>();
  const rows: UnindexedRow[] = [];
  for (const custom of customRows) {
    if (seen.has(custom.id)) throw new DuplicateRowIdError(custom.id);
    seen.add(custom.id);
    const entryIds = (custom.entryIds ?? []).map((id) => entryId(id));
    const kind = entryIds.length === 0 ? PLANNED_ROW_KIND.header : PLANNED_ROW_KIND.entry;
    rows.push({
      id: rowId(custom.id),
      kind,
      depth: 0,
      entryIds,
      expandable: false,
      expanded: false,
      ...(kind === PLANNED_ROW_KIND.header ? { headerLabel: custom.label ?? '' } : {}),
    });
  }
  return rows;
}
