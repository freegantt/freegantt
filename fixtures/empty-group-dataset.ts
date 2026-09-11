// Empty `'group'` for [S4-A8]: a childless group holds no dates at all (ADR 0012) — it neither
// spans nor draws a bar until a child gives the Rollup pass something to derive from.

import { Dataset } from '../src/api/dataset.js';

export function emptyGroupDataset(): Dataset {
  return new Dataset({
    entries: [{ id: 'g1', kind: 'group', name: 'g1' }],
    timeZone: 'UTC',
  });
}
