import { describe, it, expect } from 'vitest';
import type { EntryEdit } from './entry.js';

// ADR 0011, types.md: type tests, and each half is one. This file exists to compile, not to run —
// `it.skip` bodies never execute, so the assertions below are the type checker's job alone. A change
// that breaks one of these must be a deliberate, reviewed change to `EntryEdit`. ADR 0013 retired the
// `kind`-is-required half: `kind` is no longer a stored Entry field, so there is nothing left to
// refuse removing.
describe('EntryEdit — an edit removes exactly what a stored Entry may lack (ADR 0011)', () => {
  it('compiles: { start: undefined } — start is optional on a stored Entry (ADR 0012)', () => {
    const edit: EntryEdit = { start: undefined };
    expect(edit).toBeDefined();
  });

  it('compiles: { parentId: undefined } — a root Entry has none', () => {
    const edit: EntryEdit = { parentId: undefined };
    expect(edit).toBeDefined();
  });

  it('compiles: { owner: undefined } when owner is required on TProps — props is Partial everywhere', () => {
    const edit: EntryEdit<{ owner: string }> = { owner: undefined };
    expect(edit).toBeDefined();
  });

  it('does not compile: { name: undefined } — name is required on every stored Entry', () => {
    // @ts-expect-error — name is not removable; a stored Entry always holds one.
    const edit: EntryEdit = { name: undefined };
    expect(edit).toBeDefined();
  });

  it('does not compile: { segments: undefined } — segments is `[]`, never absent', () => {
    // @ts-expect-error — segments is not removable; an un-dated Entry stores `[]`, not absent.
    const edit: EntryEdit = { segments: undefined };
    expect(edit).toBeDefined();
  });

  it('does not compile: { props: { owner: "Sam" } } — a declared key sits flat, never nested', () => {
    // @ts-expect-error — props is refused on EntryEdit; write the declared key flat instead.
    const edit: EntryEdit<{ owner: string }> = { props: { owner: 'Sam' } };
    expect(edit).toBeDefined();
  });
});
