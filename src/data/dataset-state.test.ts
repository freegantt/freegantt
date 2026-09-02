import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { identityExtender } from './edit-extension.js';
import type { EditExtender } from './edit-extension.js';
import { instant, now } from '../time/index.js';

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

describe('DatasetState referenceDate option (issue #112)', () => {
  it('defaults to the real clock when omitted', () => {
    const before = now();
    const state = new DatasetState({ entries: [], timeZone: 'UTC' });
    const after = now();
    expect(state.referenceDate).toBeGreaterThanOrEqual(before);
    expect(state.referenceDate).toBeLessThanOrEqual(after);
  });

  it('freezes to the given referenceDate without touching the real clock', () => {
    const frozen = instant('2020-01-01T00:00:00Z');
    const state = new DatasetState({ entries: [], timeZone: 'UTC', referenceDate: frozen });
    expect(state.referenceDate).toBe(frozen);
  });
});
