# Bundle size growth exceptions

`scripts/check-bundle-growth.mjs` fails a pull request when a `.size-limit.json` entry grows more
than 1 kB (brotli) past `main`'s merge-base, unless a row below names it. A row covers a run only
when its recorded delta is at least the actual growth for that pull request and entry.

Decision record: issue #342.

| Pull request      | Entry                                         | Delta (bytes) | Reason                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #540              | core + tooltips + contextMenu + inlineEditing | 1300          | The sibling-order renumber pass (ADR 0034): a write-set log in `EntryStore`, the `buildCommitChangeSet` replay after the Rollup, and each call site's own range check.                                                                                                                 |
| #540              | core (Dataset + Gantt)                        | 1100          | The same sibling-order renumber pass (ADR 0034) — `Dataset` and `Gantt` alone already carry `EntryStore` and `buildCommitChangeSet`, so this entry grows for the same reason as the row above.                                                                                         |
| Pawel-IT/517-sync | core + tooltips + contextMenu + inlineEditing | 1600          | Replay (`changesToReplay`, #517) reuses `renumberSiblingGroups` to renumber each sibling group undo and redo touch, plus `mergeUpdatedRows` folding a commit's same-key rows to their net effect, plus `changesToReplay` re-rolling the parents it touches through `rollUpFreshBatch`. |
| Pawel-IT/517-sync | core (Dataset + Gantt)                        | 1500          | The same three changes — `Dataset` alone already carries `EntryStore`, `changesToReplay`, `buildCommitChangeSet` and the Rollup, so this entry grows for the same reasons as the row above.                                                                                            |
