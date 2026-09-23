# Bundle size growth exceptions

`scripts/check-bundle-growth.mjs` fails a pull request when a `.size-limit.json` entry grows more
than 1 kB (brotli) past `main`'s merge-base, unless a row below names it. A row covers a run only
when its recorded delta is at least the actual growth for that pull request and entry.

Decision record: issue #342.

| Pull request | Entry | Delta (bytes) | Reason |
| ------------ | ----- | ------------- | ------ |
