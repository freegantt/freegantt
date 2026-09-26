import { describe, it, expect } from 'vitest';
import type { EntryDelta, EntryInput, EntryIngestInput } from './stored-entry.js';
import type { EntryStore } from './dataset.js';

// Same compile-first style as entry-delta-types.test.ts: this file exists to compile, not to run —
// the assertions below are the type checker's job alone. A change that breaks one of these must be a
// deliberate, reviewed change to `EntryIngestInput`.
describe('EntryIngestInput — a generic TProps caller hands ingest a plain EntryInput, no cast', () => {
  it('compiles: add() takes a generic EntryInput<TProps> with no cast', () => {
    function addOne<TProps>(entries: EntryStore<TProps>, input: EntryInput<TProps>) {
      return entries.add(input);
    }
    expect(addOne).toBeDefined();
  });

  it('compiles: load() takes a generic EntryInput<TProps>[] with no cast', () => {
    function loadAll<TProps>(entries: EntryStore<TProps>, inputs: readonly EntryInput<TProps>[]) {
      entries.load(inputs);
    }
    expect(loadAll).toBeDefined();
  });

  it('compiles: syncAll() takes a generic EntryInput<TProps>[] with no cast', () => {
    function syncAll<TProps>(entries: EntryStore<TProps>, inputs: readonly EntryInput<TProps>[]) {
      entries.syncAll(inputs);
    }
    expect(syncAll).toBeDefined();
  });

  it('compiles: EntryDelta.upsert takes a generic EntryInput<TProps>[] with no cast', () => {
    function upsertAll<TProps>(rows: readonly EntryInput<TProps>[]): EntryDelta<TProps> {
      return { upsert: rows };
    }
    expect(upsertAll).toBeDefined();
  });

  it('compiles with a concrete TProps: a flat declared key still checks (#281)', () => {
    const input: EntryIngestInput<{ owner: string }> = { id: 'a', owner: 'Sam' };
    expect(input).toBeDefined();
  });

  it('does not compile with a concrete TProps: a misspelled declared key still refuses (#281)', () => {
    // @ts-expect-error — 'ownr' names no declared key on TProps, and no plain EntryInput arm hides it.
    const input: EntryIngestInput<{ owner: string }> = { id: 'a', ownr: 'x' };
    expect(input).toBeDefined();
  });
});
