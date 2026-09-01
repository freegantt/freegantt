// layout/ — `{ source: 'custom' }`. Adapts public CustomRow once; PlannedRow stays internal (D-S4-21).

import { DuplicateRowIdError, entryId, rowId } from '../../model/index.js';
import type { CustomRowSource, PlannedRow, RowResolveInput } from './row-source.js';
import { heightModeOf } from './row-source.js';

export function resolveCustomSource(source: CustomRowSource, input: RowResolveInput): PlannedRow[] {
  const heightMode = heightModeOf(source);
  const customRows = source.resolve(input);
  const seen = new Set<string>();
  const rows: PlannedRow[] = [];
  for (const custom of customRows) {
    if (seen.has(custom.id)) throw new DuplicateRowIdError(custom.id);
    seen.add(custom.id);
    const entryIds = (custom.entryIds ?? []).map((id) => entryId(id));
    const isHeader = entryIds.length === 0;
    rows.push({
      id: rowId(custom.id),
      kind: isHeader ? 'header' : 'entry',
      index: 0,
      depth: 0,
      entryIds,
      expandable: false,
      expanded: false,
      heightMode,
      ...(isHeader ? { headerLabel: custom.label ?? '' } : {}),
    });
  }
  return rows;
}
