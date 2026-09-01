// data/ — one Field-source normalizer. Registry resolve and the schema-2 codec both ask here.

import { SOURCE_STRATEGY } from './source-strategy.js';
import type { Field, FieldSource } from '../../model/index.js';

/** Call: `storedSourceOf(field)`. Fills an omitted source as `{ from: 'meta', key }` (D-S4-35). */
export function storedSourceOf(field: Pick<Field, 'key' | 'source'>): FieldSource {
  const source = field.source;
  if (source === undefined) return SOURCE_STRATEGY.meta.normalize(field);
  return SOURCE_STRATEGY[source.from].normalize(field);
}
