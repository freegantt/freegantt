// Childless entry for [S4-A8]: a row with no children holds no dates at all (ADR 0012) — it neither
// spans nor draws a bar until a child gives the Rollup pass something to derive from. ADR 0013: it
// is not a "group" — there is no stored classification, and it looks like a plain Entry either way.

import { Dataset } from '../src/api/dataset.js';

export function emptyGroupDataset(): Dataset {
  return new Dataset({
    entries: [{ id: 'g1', name: 'g1' }],
    timeZone: 'UTC',
  });
}
