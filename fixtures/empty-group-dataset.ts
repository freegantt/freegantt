// Empty `'group'` for [S4-A8]: Dataset writes the zero-length span at the reference date.

import { Dataset } from '../src/api/dataset.js';

export function emptyGroupDataset(): Dataset {
  return new Dataset({
    entries: [{ id: 'g1', kind: 'group', name: 'g1' }],
    timeZone: 'UTC',
  });
}
