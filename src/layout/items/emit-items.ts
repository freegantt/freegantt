// layout/ — Items for one PlannedRow (D-S4-19, D-S4-24). Header rows (empty entryIds) emit none.

import type { PlannedRow } from '../rows/row-source.js';
import type { Item, ItemEmissionContext, ItemEmitterRegistry } from './item-emitter.js';
import { createItemEmitterRegistry } from './item-emitter.js';

export type { Item, ItemEmissionContext, ItemEmitter, ItemEmitterRegistry } from './item-emitter.js';
export { createItemEmitterRegistry } from './item-emitter.js';

/** Call: `emitRow(planned, { entryById }, registry)`. */
export function emitRow(
  row: PlannedRow,
  ctx: ItemEmissionContext,
  registry: ItemEmitterRegistry = createItemEmitterRegistry(),
): readonly Item[] {
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = ctx.entryById.get(id);
    if (entry === undefined) continue;
    items.push(...registry.emitterFor(entry.kind)(entry, ctx));
  }
  return items;
}
