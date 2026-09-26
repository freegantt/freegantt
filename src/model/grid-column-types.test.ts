import { describe, it, expect } from 'vitest';
import type { GridColumnInput } from './index.js';

// Same compile-first style as model/entry-delta-types.test.ts: this file exists to compile, not to
// run — the assertion below is the type checker's job alone. A column union that gives an inline
// renderer no contextual type fails here with an implicit `any`.
describe('GridColumnInput — an inline columnRenderer takes its context type from the column', () => {
  it('compiles: inline renderers over a core key and an open key, with no annotation', () => {
    const columns: readonly GridColumnInput[] = [
      { field: 'name', columnRenderer: ({ value }) => ({ text: value }) },
      { field: 'owner', columnRenderer: ({ fieldValue }) => ({ text: String(fieldValue) }) },
    ];
    expect(columns).toHaveLength(2);
  });
});
