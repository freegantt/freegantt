// data/ — memo for compute-sourced Fields. Keyed by entry, field, and dataset revision.

import type { EntryId, FieldKey } from '../model/index.js';

export class ComputedFieldCache {
  #revision = -1;
  readonly #values = new Map<EntryId, Map<string, unknown>>();

  read<T>(entryId: EntryId, fieldKey: FieldKey, datasetRevision: number, compute: () => T): T {
    if (this.#revision !== datasetRevision) {
      this.#revision = datasetRevision;
      this.#values.clear();
    }
    let byField = this.#values.get(entryId);
    if (!byField) {
      byField = new Map();
      this.#values.set(entryId, byField);
    }
    const key = String(fieldKey);
    if (byField.has(key)) return byField.get(key) as T;
    const value = compute();
    byField.set(key, value);
    return value;
  }
}
