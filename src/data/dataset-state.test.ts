import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { identityExtender } from './edit-extension.js';
import type { EditExtender } from './edit-extension.js';

describe('DatasetState editExtender option', () => {
  it('defaults to identityExtender when none is given', () => {
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    expect(state.editExtender).toBe(identityExtender);
  });

  it('uses the given extender when one is provided', () => {
    const extender: EditExtender = () => new Map();
    const state = new DatasetState({ entries: [], timeZone: 'UTC', editExtender: extender });
    expect(state.editExtender).toBe(extender);
  });
});
