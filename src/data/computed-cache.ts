// data/ — memo for compute-sourced Fields (D-S4-10). Keyed by entry, field, and dataset revision.

import type { EntryId, FieldKey } from '../model/index.js';

export class ComputedFieldCache {
  #revision = -1;
  readonly #values = new Map<string, unknown>();

  read<T>(entryId: EntryId, fieldKey: FieldKey, datasetRevision: number, compute: () => T): T {
    if (this.#revision !== datasetRevision) {
      this.#revision = datasetRevision;
      this.#values.clear();
    }
    const key = `${entryId}:${String(fieldKey)}`;
    if (this.#values.has(key)) return this.#values.get(key) as T;
    const value = compute();
    this.#values.set(key, value);
    return value;
  }
}
