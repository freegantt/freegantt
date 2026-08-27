// data/ — normalized stores, transactions, undo/redo, changesets, serialization (plans/01 §6).
// DOM-free. Barrel exports nothing outside data/ that api/ does not re-export.
export { DatasetState } from './dataset-state.js';
export type { DatasetStateOptions } from './dataset-state.js';
export { EntryStore } from './entry-store.js';
