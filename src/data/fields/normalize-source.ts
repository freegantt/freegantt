// data/ — one Field-source normalizer. Registry resolve and the schema-2 codec both ask here.

import type { Field, FieldSource } from '../../model/index.js';

/** Call: `storedSourceOf(field)`. Fills an omitted source as `{ from: 'meta', key }` (D-S4-35). */
export function storedSourceOf(field: Pick<Field, 'key' | 'source'>): FieldSource {
  const source = field.source;
  if (source === undefined) return { from: 'meta', key: String(field.key) };
  if (source.from === 'meta') return { from: 'meta', key: source.key ?? String(field.key) };
  return source;
}
