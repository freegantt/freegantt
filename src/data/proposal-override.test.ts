import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { overridingProposed } from './edit-extension.js';
import { entryId } from '../model/index.js';
import { toInstant } from '../time/index.js';
import type { EntryEdit, EntryEdits } from '../model/index.js';

const placed = toInstant('UTC', '2026-01-05', 'test');
const proposedStart = toInstant('UTC', '2026-01-02', 'test');
const originalStart = toInstant('UTC', '2026-01-01', 'test');

function stateWith(edit: EntryEdit): DatasetState {
  return new DatasetState({
    entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-10' }],
    timeZone: 'UTC',
    editExtender: (): EntryEdits => new Map([[entryId('t1'), edit]]),
  });
}

describe('an extender result that marks an override (ADR 0042)', () => {
  it('replaces the Field the body proposed', () => {
    const state = stateWith(overridingProposed(['start'], { start: placed }));

    state.entries.update('t1', { start: proposedStart });

    expect(state.entries.get('t1')?.start).toBe(placed);
  });

  it('restores the previous value with one undo and the override with redo', () => {
    const state = stateWith(overridingProposed(['start'], { start: placed }));
    state.entries.update('t1', { start: proposedStart });

    state.undo();
    expect(state.entries.get('t1')?.start).toBe(originalStart);

    state.redo();
    expect(state.entries.get('t1')?.start).toBe(placed);
  });

  it('still throws for a Field it does not mark', () => {
    const state = stateWith(overridingProposed(['end'], { start: placed }));

    expect(() => state.entries.update('t1', { start: proposedStart })).toThrow(/I4/);
  });
});

describe('an extender result with no mark', () => {
  it('still throws for a Field the body proposed', () => {
    const state = stateWith({ start: placed });

    expect(() => state.entries.update('t1', { start: proposedStart })).toThrow(/I4/);
  });
});
