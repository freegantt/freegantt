// data/ — one Field-source normalizer. Registry resolve and the schema-2 codec both ask here.

import { SOURCE_STRATEGY } from './source-strategy.js';
import type { SourceStrategy } from './source-strategy.js';
import { InvalidFieldSourceError } from '../../model/index.js';
import type { Field, FieldSource } from '../../model/index.js';

/** Call: `storedSourceOf(field)`. Fills an omitted source as `{ from: 'meta', key }` (D-S4-35).
 *  Throws `InvalidFieldSourceError` for a source that names no strategy (#196). */
export function storedSourceOf(field: Pick<Field, 'key' | 'source'>): FieldSource {
  const source = field.source;
  if (source === undefined) return SOURCE_STRATEGY.meta.normalize(field);
  const strategy = declaredStrategyFor(source);
  if (strategy === undefined) throw new InvalidFieldSourceError(String(field.key), source);
  return strategy.normalize(field);
}

/** `undefined` for anything that is not one of the three declared sources. TypeScript refuses those
 *  shapes already. A JS caller does not, and `ctx.fields.register(field)` is public surface as of
 *  S5.10 — `source: 'meta'` instead of `{ from: 'meta' }` is the mistake #196 reports. */
function declaredStrategyFor(source: FieldSource): SourceStrategy | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  if (!Object.hasOwn(SOURCE_STRATEGY, source.from)) return undefined;
  return SOURCE_STRATEGY[source.from];
}
