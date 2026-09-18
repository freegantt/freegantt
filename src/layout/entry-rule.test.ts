// layout/ — `compileEntryRule`'s own contract, pinned directly (#421 F7). Both callers
// (`items/variants.ts`'s `when`, `rows/entries-source.ts`'s `childrenAsSegments`) exercise this only
// incidentally, through a real Gantt render; this file pins the compiler's own two promises: a
// missing key reports once per rule, and a known key's Field is read fresh on every row.

import { describe, expect, it } from 'vitest';
import { DatasetState } from '../data/dataset-state.js';
import type { EntryRulePorts } from './entry-rule.js';
import { compileEntryRule } from './entry-rule.js';

function dataset(): DatasetState {
  return new DatasetState({
    timeZone: 'UTC',
    fields: [{ key: 'phase' }],
    entries: [
      { id: 'a', name: 'A', start: 0, end: 1, props: { phase: 'build' } },
      { id: 'b', name: 'B', start: 0, end: 1, props: { phase: 'plan' } },
    ],
  });
}

function ports(state: DatasetState, reported: string[]): EntryRulePorts {
  return {
    fieldFor: (key) => state.field(key),
    reportUnknownKey: (key) => reported.push(key),
  };
}

describe('compileEntryRule', () => {
  it('a function rule passes through untouched — no lookup, no report', () => {
    const state = dataset();
    const reported: string[] = [];
    const rule = (entry: { id: string }): boolean => entry.id === 'a';

    const predicate = compileEntryRule(rule, ports(state, reported));

    expect(predicate(state.entries.get('a')!)).toBe(true);
    expect(predicate(state.entries.get('b')!)).toBe(false);
    expect(reported).toEqual([]);
  });

  it('a field-match rule claims the row whose value equals, and no other', () => {
    const state = dataset();
    const predicate = compileEntryRule({ phase: 'build' }, ports(state, []));

    expect(predicate(state.entries.get('a')!)).toBe(true);
    expect(predicate(state.entries.get('b')!)).toBe(false);
  });

  it('a key no Field declares claims no row, and reports once for that key', () => {
    const state = dataset();
    const reported: string[] = [];
    const predicate = compileEntryRule({ notAField: 'build' }, ports(state, reported));

    expect(predicate(state.entries.get('a')!)).toBe(false);
    expect(predicate(state.entries.get('b')!)).toBe(false);
    // Two rows read the same missing key — one report, not two.
    expect(reported).toEqual(['notAField']);
  });

  it('one compiled rule dedupes its own report even across many separate calls', () => {
    const state = dataset();
    const reported: string[] = [];
    const predicate = compileEntryRule({ notAField: true }, ports(state, reported));

    for (let i = 0; i < 5; i++) predicate(state.entries.get('a')!);

    expect(reported).toEqual(['notAField']);
  });

  it('recompiling the rule reports again — the dedupe lives on the compiled rule, not the Field', () => {
    const state = dataset();
    const reported: string[] = [];
    const p = ports(state, reported);

    compileEntryRule({ notAField: true }, p)(state.entries.get('a')!);
    compileEntryRule({ notAField: true }, p)(state.entries.get('a')!);

    expect(reported).toEqual(['notAField', 'notAField']);
  });

  it("a Field's own `equals` decides the match, not `Object.is`", () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      fields: [{ key: 'tags', equals: (a, b) => Array.isArray(a) && a.includes(b) }],
      entries: [{ id: 'a', name: 'A', start: 0, end: 1, props: { tags: ['x', 'y'] } }],
    });
    const predicate = compileEntryRule({ tags: 'x' }, ports(state, []));

    expect(predicate(state.entries.get('a')!)).toBe(true);
  });

  it('the Field lookup runs per read — a rebound Dataset is answered fresh, not from a stale bind', () => {
    const first = dataset();
    const predicate = compileEntryRule(
      { phase: 'build' },
      {
        fieldFor: (key) => first.field(key),
        reportUnknownKey: () => {},
      },
    );

    expect(predicate(first.entries.get('a')!)).toBe(true);

    // A second Dataset with no `phase` Field at all: the same compiled predicate, handed a fresh
    // `fieldFor`, must answer through it — not through a Field it captured on its first call.
    const second = new DatasetState({ timeZone: 'UTC', entries: [{ id: 'c', name: 'C', start: 0, end: 1 }] });
    const reported: string[] = [];
    const rebound = compileEntryRule({ phase: 'build' }, ports(second, reported));

    expect(rebound(second.entries.get('c')!)).toBe(false);
    expect(reported).toEqual(['phase']);
  });

  it('several keys AND together — every named key must match', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      fields: [{ key: 'phase' }, { key: 'active' }],
      entries: [
        { id: 'a', name: 'A', start: 0, end: 1, props: { phase: 'build', active: true } },
        { id: 'b', name: 'B', start: 0, end: 1, props: { phase: 'build', active: false } },
      ],
    });
    const predicate = compileEntryRule({ phase: 'build', active: true }, ports(state, []));

    expect(predicate(state.entries.get('a')!)).toBe(true);
    expect(predicate(state.entries.get('b')!)).toBe(false);
  });
});
