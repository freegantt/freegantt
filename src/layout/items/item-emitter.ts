// layout/ — per-Kind Item emission (D-S4-24). The registry is built per Gantt, never module-level (I2).

import type { EntryKind } from '../../model/index.js';
import type { ItemEmitter } from './item.js';
import { emitGroup } from './group-emitter.js';
import { emitMilestone } from './milestone-emitter.js';
import { emitSpan } from './span-emitter.js';

export type { Item, ItemEmissionContext, ItemEmitter } from './item.js';

export interface ItemEmitterRegistry {
  /** The emitter for `kind`, or the `'span'` emitter when nothing is registered. Never throws. */
  emitterFor(kind: EntryKind): ItemEmitter;
}

/** Call: `createItemEmitterRegistry()` in the Gantt constructor; tests pass extras for a Kind. */
export function createItemEmitterRegistry(
  extras: Readonly<Record<string, ItemEmitter>> = {},
): ItemEmitterRegistry {
  const emitters = new Map<string, ItemEmitter>([
    ['span', emitSpan],
    ['group', emitGroup],
    ['milestone', emitMilestone],
  ]);
  for (const [kind, emitter] of Object.entries(extras)) emitters.set(kind, emitter);
  return {
    emitterFor(kind) {
      return emitters.get(kind) ?? emitSpan;
    },
  };
}
