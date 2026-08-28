// view/ — the whole of the view's dependency on data change, in one removable file (D-S2-20).
// `dataset-change-subscription-is-removable` (.dependency-cruiser.cjs, D-S2-23) allows exactly one
// importer, `view/gantt-shell.ts`: delete this file and its one call site and a Gantt still
// constructs, lays out, renders and scrolls — it shows the data as it was at construction and never
// updates. A static image is the honest floor of this design.
//
// This is deliberately not an Attachment (CONTEXT.md): an Attachment wires a DOM element to a pure
// model, and this file touches no DOM at all — its first argument is a Dataset. It uses nothing a
// consumer could not use: `dataset.on('change')` and `entries.all` are both public (U8).

import type { ChangeSet, Dataset } from '../model/index.js';

export interface DatasetChangeSubscription {
  unsubscribe(): void;
}

/** Subscribes to the dataset's `change` event and calls `onChange` with the committed changeset. */
export function subscribeToDatasetChanges(
  dataset: Dataset,
  onChange: (changeSet: ChangeSet) => void,
): DatasetChangeSubscription {
  const handler = (payload: { changeSet: ChangeSet }): void => onChange(payload.changeSet);
  dataset.on('change', handler);
  return {
    unsubscribe: () => dataset.off('change', handler),
  };
}
