// layout/ — `compileEntryRule`'s own contract, pinned directly (#421 F7). Both callers
// (`bars/variants.ts`'s `when`, `rows/entries-source.ts`'s `childrenAsSegments`) exercise this only
// incidentally, through a real Gantt render; this file pins the compiler's own two promises: a
// missing key reports once per rule, and a known key's Field is read fresh on every row.
//
// `layout/` may depend on `time/` and `model/` alone (layout-boundary). A fake `Entry` and a bare
// `Field` map stand in for a real Dataset, which lives in `data/` and is off-limits here.

import { describe, expect, it } from 'vitest';
import type { Entry, Field, FieldKey } from '../model/index.js';
import { entryId } from '../model/index.js';
import type { EntryRulePorts } from './entry-rule.js';
import { compileEntryRule } from './entry-rule.js';

/** The least an `Entry` needs to answer `compileEntryRule`'s two questions: what its id is, and
 *  what a key reads. Everything else on the interface is a no-op stub — no test here calls it. */
function fakeEntry(id: string, props: Record<string, unknown> = {}): Entry {
  return {
    id: entryId(id),
    name: '',
    read: ((key: FieldKey) => props[key]) as Entry['read'],
    duration: () => undefined,
    hasChildren: false,
    children: () => [],
    parent: () => undefined,
    descendants: () => [],
    depth: 0,
    toInput: () => {
      throw new Error('fakeEntry.toInput() is not exercised by these tests');
    },
  };
}

function fieldRegistry(fields: Field[]): Map<FieldKey, Field> {
  return new Map(fields.map((field) => [field.key, field]));
}

function ports(fields: Map<FieldKey, Field>, reported: string[]): EntryRulePorts {
  return {
    fieldFor: (key) => fields.get(key),
    reportUnknownKey: (key) => reported.push(key),
  };
}

describe('compileEntryRule', () => {
  it('a function rule passes through untouched — no lookup, no report', () => {
    const a = fakeEntry('a');
    const b = fakeEntry('b');
    const reported: string[] = [];
    const rule = (entry: Entry): boolean => entry.id === entryId('a');

    const predicate = compileEntryRule(rule, ports(fieldRegistry([]), reported));

    expect(predicate(a)).toBe(true);
    expect(predicate(b)).toBe(false);
    expect(reported).toEqual([]);
  });

  it('a field-match rule claims the row whose value equals, and no other', () => {
    const fields = fieldRegistry([{ key: 'phase' }]);
    const a = fakeEntry('a', { phase: 'build' });
    const b = fakeEntry('b', { phase: 'plan' });
    const predicate = compileEntryRule({ phase: 'build' }, ports(fields, []));

    expect(predicate(a)).toBe(true);
    expect(predicate(b)).toBe(false);
  });

  it('a key no Field declares claims no row, and reports once for that key', () => {
    const fields = fieldRegistry([{ key: 'phase' }]);
    const a = fakeEntry('a', { phase: 'build' });
    const b = fakeEntry('b', { phase: 'plan' });
    const reported: string[] = [];
    const predicate = compileEntryRule({ notAField: 'build' }, ports(fields, reported));

    expect(predicate(a)).toBe(false);
    expect(predicate(b)).toBe(false);
    // Two rows read the same missing key — one report, not two.
    expect(reported).toEqual(['notAField']);
  });

  it('one compiled rule dedupes its own report even across many separate calls', () => {
    const fields = fieldRegistry([{ key: 'phase' }]);
    const a = fakeEntry('a', { phase: 'build' });
    const reported: string[] = [];
    const predicate = compileEntryRule({ notAField: true }, ports(fields, reported));

    for (let i = 0; i < 5; i++) predicate(a);

    expect(reported).toEqual(['notAField']);
  });

  it('recompiling the rule reports again — the dedupe lives on the compiled rule, not the Field', () => {
    const fields = fieldRegistry([{ key: 'phase' }]);
    const a = fakeEntry('a', { phase: 'build' });
    const reported: string[] = [];
    const p = ports(fields, reported);

    compileEntryRule({ notAField: true }, p)(a);
    compileEntryRule({ notAField: true }, p)(a);

    expect(reported).toEqual(['notAField', 'notAField']);
  });

  it("a Field's own `equals` decides the match, not `Object.is`", () => {
    const fields = fieldRegistry([
      { key: 'tags', equals: (a, b) => Array.isArray(a) && (a as unknown[]).includes(b) },
    ]);
    const a = fakeEntry('a', { tags: ['x', 'y'] });
    const predicate = compileEntryRule({ tags: 'x' }, ports(fields, []));

    expect(predicate(a)).toBe(true);
  });

  it('the Field lookup runs per read — a rebound Dataset is answered fresh, not from a stale bind', () => {
    const firstFields = fieldRegistry([{ key: 'phase' }]);
    const a = fakeEntry('a', { phase: 'build' });
    const predicate = compileEntryRule(
      { phase: 'build' },
      { fieldFor: (key) => firstFields.get(key), reportUnknownKey: () => {} },
    );

    expect(predicate(a)).toBe(true);

    // A second, fieldless registry: the same compiled predicate, handed a fresh `fieldFor`, must
    // answer through it — not through a Field it captured on its first call.
    const secondFields = fieldRegistry([]);
    const c = fakeEntry('c');
    const reported: string[] = [];
    const rebound = compileEntryRule({ phase: 'build' }, ports(secondFields, reported));

    expect(rebound(c)).toBe(false);
    expect(reported).toEqual(['phase']);
  });

  it('several keys AND together — every named key must match', () => {
    const fields = fieldRegistry([{ key: 'phase' }, { key: 'active' }]);
    const a = fakeEntry('a', { phase: 'build', active: true });
    const b = fakeEntry('b', { phase: 'build', active: false });
    const predicate = compileEntryRule({ phase: 'build', active: true }, ports(fields, []));

    expect(predicate(a)).toBe(true);
    expect(predicate(b)).toBe(false);
  });
});
