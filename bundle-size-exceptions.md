# Bundle size growth exceptions

`scripts/check-bundle-growth.mjs` fails a pull request when a `.size-limit.json` entry grows more
than 1 kB (brotli) past `main`'s merge-base, unless a row below names it. A row covers a run only
when its recorded delta is at least the actual growth for that pull request and entry.

Decision record: issue #342.

| Pull request               | Entry                                         | Delta (bytes) | Reason                                                                                                                                                                 |
| -------------------------- | --------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pawel-IT/528-sibling-index | core + tooltips + contextMenu + inlineEditing | 1100          | The sibling-order renumber pass (ADR 0034): a write-set log in `EntryStore`, the `buildCommitChangeSet` replay after the Rollup, and each call site's own range check. |
