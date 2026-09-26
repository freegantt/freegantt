import { describe, it, expect } from 'vitest';
import type { EntryDelta } from './stored-entry.js';

// Same compile-first style as entry-edit-types.test.ts: this file exists to compile, not to run —
// the assertions below are the type checker's job alone. A change that breaks one of these must be a
// deliberate, reviewed change to `EntryDelta`.
describe('EntryDelta — the shape entries.syncChanges() takes', () => {
  it('compiles: {} — a delta that names nothing is legal', () => {
    const delta: EntryDelta = {};
    expect(delta).toBeDefined();
  });

  it("compiles: { remove: ['a'] }", () => {
    const delta: EntryDelta = { remove: ['a'] };
    expect(delta).toBeDefined();
  });

  it("compiles: { upsert: [{ id: 'a' }] } — only id is required on an upsert row", () => {
    const delta: EntryDelta = { upsert: [{ id: 'a' }] };
    expect(delta).toBeDefined();
  });

  it("compiles: { upsert: [{ id: 'a', name: undefined, start: undefined }] } — undefined clears", () => {
    const delta: EntryDelta = { upsert: [{ id: 'a', name: undefined, start: undefined }] };
    expect(delta).toBeDefined();
  });

  it('compiles with EntryDelta<{ owner: string }>: a declared prop sits flat', () => {
    const delta: EntryDelta<{ owner: string }> = { upsert: [{ id: 'a', owner: 'Sam' }] };
    expect(delta).toBeDefined();
  });

  it('compiles with EntryDelta<{ owner?: string | undefined }>: a declared prop nested under props clears with undefined', () => {
    const delta: EntryDelta<{ owner?: string | undefined }> = {
      upsert: [{ id: 'a', props: { owner: undefined } }],
    };
    expect(delta).toBeDefined();
  });

  it('does not compile: an upsert row with no id', () => {
    // @ts-expect-error — every upsert row must name the id it upserts.
    const delta: EntryDelta = { upsert: [{ name: 'x' }] };
    expect(delta).toBeDefined();
  });

  it('does not compile: EntryDelta<{ owner: string }> with a misspelled declared key', () => {
    // @ts-expect-error — 'ownr' names no declared key on TProps.
    const delta: EntryDelta<{ owner: string }> = { upsert: [{ id: 'a', ownr: 'x' }] };
    expect(delta).toBeDefined();
  });
});
