import { describe, it, expect } from 'vitest';
import type { DatasetOptions } from './dataset.js';
import type { EntryInput } from './index.js';

// Same compile-first style as model/entry-delta-types.test.ts: this file exists to compile, not to
// run — the assertion below is the type checker's job alone. It names the real `DatasetOptions`
// from `api/dataset.ts`, so a narrower `entries` option fails this file, not a copy of it.
describe('DatasetOptions — the entries option the Dataset constructor takes', () => {
  it('compiles: entries takes a generic EntryInput<TProps>[] with no cast', () => {
    function optionsFor<TProps>(entries: readonly EntryInput<TProps>[]): DatasetOptions<TProps> {
      return { timeZone: 'UTC', entries };
    }
    expect(optionsFor).toBeDefined();
  });
});
