// layout/ — the one deep seam that turns a PlannedRow's entries into Bars. Header rows
// (`kind: 'header'`) produce no Bars.
//
// ADR 0018: which shape one row draws is one question with one answer — the variant this Gantt
// resolved for it (`variants.ts`). One resolution, one producer call, so no candidate's Bars are
// ever built and thrown away.

import { spansTime } from '../../model/index.js';
import type { Entry, EntryId } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { isPlannedHeaderRow } from '../rows/row-source.js';
import type { Bar, VariantBars } from './bar.js';

/** What one Entry draws: its variant, then that variant's own producer.
 *
 *  A variant with no producer of its own draws one whole-entry Bar, which the registry binds at
 *  registration. So this never answers "nothing" for a variant the registry knows.
 *
 *  Passes the resolved variant's own name to its producer (ADR 0018: a variant states its name
 *  once), so a producer never has to invent or hardcode the name its own Bars carry.
 *
 *  Passes `childrenAsSegments` straight through to the producer (#421 C2) — nothing here
 *  skips the Entry. A segmented row's subject still reaches its own variant's producer, so a
 *  consumer's own `bars` still runs and still wins. */
export function resolveBars(
  entry: Entry,
  registry: VariantBars,
  childrenAsSegments: boolean,
): readonly Bar[] {
  const variant = registry.resolveFor(entry);
  return variant === undefined ? [] : variant.bars(entry, variant.name, childrenAsSegments);
}

/** Call: `produceBarsForRow(planned, entryById, registry)`. The registry is required — one per
 *  Gantt (I2), never a fresh one per row. Structure comes off the row itself (`entry.hasChildren`,
 *  ADR 0017), so nothing threads a second answer beside it. */
export function produceBarsForRow(
  row: PlannedRow,
  entryById: ReadonlyMap<EntryId, Entry>,
  registry: VariantBars,
): readonly Bar[] {
  if (isPlannedHeaderRow(row)) return [];
  const bars: Bar[] = [];
  for (const id of row.entryIds) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    // An Entry draws nothing until it spans (`spansTime`, ADR 0012). This is the one gate: no
    // producer — shipped or a plugin's own — ever sees a non-spanning Entry, so `wholeEntryBar`
    // and the shipped producers may read `entry.start`/`entry.end` as always present
    // (ADR 0012's appendix).
    if (!spansTime(entry)) continue;
    // Nothing skips a segmented row's subject: the fact travels to the producer instead, so
    // a consumer's own `bars` still runs for it and still wins.
    const childrenAsSegments = row.childrenAsSegments === true && id === row.entryIds[0];
    bars.push(...resolveBars(entry, registry, childrenAsSegments));
  }
  return bars;
}
