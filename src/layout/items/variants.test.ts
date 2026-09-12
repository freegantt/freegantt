// ADR 0018: a variant is a rule. This file is the rule's own suite — which rule wins, what a field
// match compares, and what the diagnostic reports. `produce-items.test.ts` is next door and asks a
// different question: what the row pass draws once a variant has been resolved.

import { describe, expect, it } from 'vitest';
import { itemId } from '../../model/index.js';
import type { Entry, Field, FieldKey } from '../../model/index.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import { createVariantRegistry } from './variants.js';
import type { DoubleVariantClaim, UnknownFieldMatch } from './variants.js';

function spanEntry(id: string, props: Record<string, unknown> = {}): Entry {
  return entryDouble({ id, start: 0, end: 10, props });
}

describe('which rule wins', () => {
  it('answers the leaf variant for a row nothing claims, and the parent variant for a row with children', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent, child] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);

    expect(registry.resolveFor(parent!).name).toBe('summary');
    expect(registry.resolveFor(child!).name).toBe('leaf');
  });

  it('lets a plugin variant override core’s own `parent` on a row with children (Q5)', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);

    registry.addPluginVariant({ name: 'phase', when: (entry) => entry.hasChildren });

    expect(registry.resolveFor(parent!).name).toBe('phase');
  });

  it('lets the newest of two plugin rules win, and disposing it restores the older one', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'buffer', when: () => true });
    const disposeNewest = registry.addPluginVariant({ name: 'risk', when: () => true });
    expect(registry.resolveFor(t1).name).toBe('risk');

    disposeNewest();
    expect(registry.resolveFor(t1).name).toBe('buffer');
  });

  it('lets a consumer variant win over a plugin’s, even though the plugin registered later', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');

    registry.addConsumerVariant({ name: 'mine', when: () => true });
    registry.addPluginVariant({ name: 'theirs', when: () => true });

    expect(registry.resolveFor(t1).name).toBe('mine');
  });

  it('claims a row added after the rule was installed — the bug the id set caused', () => {
    const registry = createVariantRegistry(declaring({ key: 'buffer' }));
    registry.addPluginVariant({ name: 'buffer', when: { buffer: true } });

    const later = spanEntry('added-later', { buffer: true });

    expect(registry.resolveFor(later).name).toBe('buffer');
  });

  it('treats a variant with no `when` as the last resort, and every row still resolves', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });

    registry.addPluginVariant({ name: 'everything' });

    expect(registry.resolveFor(spanEntry('t1')).name).toBe('everything');
    expect(registry.resolveFor(spanEntry('t2')).name).toBe('everything');
  });

  it('keeps core’s `parent` on a summary row when a plugin re-skins the floor (P2-3)', () => {
    // `ctx.variants.add({ name: 'leaf', paint })` is the documented re-skin, and it states no
    // `when`. Rank alone put it over core's `parent`, and every summary rail stopped drawing.
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent, child] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);
    const paint = (): undefined => undefined;

    registry.addPluginVariant({ name: 'leaf', paint });

    expect(registry.resolveFor(parent!).name).toBe('summary');
    expect(registry.resolveFor(parent!).paint).not.toBe(paint);
    expect(registry.resolveFor(child!).name).toBe('leaf');
    expect(registry.resolveFor(child!).paint).toBe(paint);
  });

  it('claims every row, core’s summary included, when the rule says so out loud', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);

    registry.addPluginVariant({ name: 'everything', when: () => true });

    expect(registry.resolveFor(parent!).name).toBe('everything');
  });
});

/** A Dataset that declares these keys and nothing else. A field match reads the registry, so a
 *  suite that matches on a key must say the key is declared — `() => undefined` is the answer for a
 *  Dataset with no Fields at all, and no match ever claims a row under it. */
function declaring(...fields: readonly Field[]): { fieldFor: (key: FieldKey) => Field | undefined } {
  const byKey = new Map<FieldKey, Field>(fields.map((field) => [field.key, field]));
  return { fieldFor: (key) => byKey.get(key) };
}

describe('what a field match compares (J6)', () => {
  it('claims the row whose value equals the one beside the key', () => {
    const registry = createVariantRegistry(declaring({ key: 'milestone' }));
    registry.addPluginVariant({ name: 'milestone', when: { milestone: true } });

    expect(registry.resolveFor(spanEntry('a', { milestone: true })).name).toBe('milestone');
    expect(registry.resolveFor(spanEntry('b', { milestone: false })).name).toBe('leaf');
  });

  it('never means "has a value": `{ flag: true }` passes over `flag: "yes"`', () => {
    const registry = createVariantRegistry(declaring({ key: 'flag' }));
    registry.addPluginVariant({ name: 'flagged', when: { flag: true } });

    expect(registry.resolveFor(spanEntry('a', { flag: 'yes' })).name).toBe('leaf');
    expect(registry.resolveFor(spanEntry('b', { flag: true })).name).toBe('flagged');
  });

  it('ANDs its keys', () => {
    const registry = createVariantRegistry(declaring({ key: 'milestone' }, { key: 'locked' }));
    registry.addPluginVariant({ name: 'both', when: { milestone: true, locked: false } });

    expect(registry.resolveFor(spanEntry('a', { milestone: true, locked: false })).name).toBe('both');
    expect(registry.resolveFor(spanEntry('b', { milestone: true, locked: true })).name).toBe('leaf');
  });

  it('compares through the Field’s own `equals`, and falls back to Object.is with none', () => {
    const caseInsensitive: Field = {
      key: 'status',
      equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
    };
    const registry = createVariantRegistry(declaring(caseInsensitive));
    registry.addPluginVariant({ name: 'blocked', when: { status: 'BLOCKED' } });

    expect(registry.resolveFor(spanEntry('a', { status: 'blocked' })).name).toBe('blocked');

    const strict = createVariantRegistry(declaring({ key: 'status' }));
    strict.addPluginVariant({ name: 'blocked', when: { status: 'BLOCKED' } });
    expect(strict.resolveFor(spanEntry('a', { status: 'blocked' })).name).toBe('leaf');
  });

  it('claims no row at all when no Field declares the key (F2)', () => {
    // `entry.read` throws on a key no Field declares, and this runs on every row of every layout
    // pass. A typo — and the one rule a chrome plugin cannot declare for itself — answers no.
    const registry = createVariantRegistry(declaring({ key: 'milestone' }));
    registry.addPluginVariant({ name: 'typo', when: { mileStone: true } });

    expect(registry.resolveFor(spanEntry('a', { mileStone: true })).name).toBe('leaf');
  });

  it('names the rule and the key when a match reads a key no Field declares (J59)', () => {
    const seen: UnknownFieldMatch[] = [];
    const registry = createVariantRegistry({
      ...declaring({ key: 'milestone' }),
      reportUnknownFieldMatch: (match) => seen.push(match),
    });
    registry.addPluginVariant({ name: 'typo', when: { mileStone: true } }, 'demo.typo');

    expect(registry.resolveFor(spanEntry('a', { mileStone: true })).name).toBe('leaf');
    // One report per rule and key, however many rows the rule is asked about.
    registry.resolveFor(spanEntry('b', { mileStone: true }));
    expect(seen).toEqual([{ rule: { variant: 'typo', pluginId: 'demo.typo' }, key: 'mileStone' }]);
  });

  it('reads a predicate for "has a value", which is the question a match does not ask', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addPluginVariant({
      name: 'phased',
      when: (entry) => entry.read('demo:phaseId') !== undefined,
    });

    expect(registry.resolveFor(spanEntry('a', { 'demo:phaseId': 'p1' })).name).toBe('phased');
    expect(registry.resolveFor(spanEntry('b')).name).toBe('leaf');
  });
});

describe('what the double-claim diagnostic reports (J36)', () => {
  function collecting(): { registry: ReturnType<typeof createVariantRegistry>; seen: DoubleVariantClaim[] } {
    const seen: DoubleVariantClaim[] = [];
    return {
      registry: createVariantRegistry({ fieldFor: () => undefined, reportDoubleClaim: (c) => seen.push(c) }),
      seen,
    };
  }

  it('names both sides when two plugin rules cover one row, and the newest still paints', () => {
    const { registry, seen } = collecting();
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'buffer', when: () => true }, 'demo.buffer');
    registry.addPluginVariant({ name: 'risk', when: () => true }, 'demo.risk');

    expect(registry.resolveFor(t1).name).toBe('risk');
    expect(seen).toEqual([
      {
        entryId: t1.id,
        painted: { variant: 'risk', pluginId: 'demo.risk' },
        ignored: { variant: 'buffer', pluginId: 'demo.buffer' },
      },
    ]);
  });

  it('stays silent when a plugin rule overrides core’s own `parent` — that is the design working', () => {
    const { registry, seen } = collecting();
    const [parent] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);

    registry.addPluginVariant({ name: 'phase', when: (entry) => entry.hasChildren }, 'demo.phase');

    expect(registry.resolveFor(parent!).name).toBe('phase');
    expect(seen).toEqual([]);
  });

  it('stays silent when a consumer rule overrides a plugin’s', () => {
    const { registry, seen } = collecting();

    registry.addPluginVariant({ name: 'theirs', when: () => true }, 'demo.theirs');
    registry.addConsumerVariant({ name: 'mine', when: () => true });

    expect(registry.resolveFor(spanEntry('t1')).name).toBe('mine');
    expect(seen).toEqual([]);
  });
});

describe('what a variant answers about itself', () => {
  it('draws one whole-entry Item with no `items` of its own, and its own producer with one', () => {
    const registry = createVariantRegistry(declaring({ key: 'plain' }, { key: 'twin' }));
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'plain', when: { plain: true } });
    registry.addPluginVariant({
      name: 'twin',
      when: { twin: true },
      items: (entry) => [
        {
          id: itemId(entry.id, 7),
          entryId: entry.id,
          variant: 'twin',
          label: entry.name,
          start: entry.start!,
          end: entry.end!,
        },
      ],
    });

    expect(registry.resolveFor(spanEntry('a', { plain: true })).items(t1, 'plain')).toHaveLength(1);
    expect(registry.resolveFor(spanEntry('b', { twin: true })).items(t1, 'twin')[0]?.id).toBe(
      itemId(t1.id, 7),
    );
  });

  it('answers the `paint` and `can` of the rule that claimed the row, and nothing for core’s floor', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const paint = (): undefined => undefined;
    const can = { resize: false };

    registry.addPluginVariant({ name: 'buffer', when: (entry) => entry.id === 'claimed', paint, can });

    expect(registry.resolveFor(spanEntry('claimed')).paint).toBe(paint);
    expect(registry.resolveFor(spanEntry('claimed')).can).toBe(can);
    expect(registry.resolveFor(spanEntry('other')).paint).toBeUndefined();
    expect(registry.resolveFor(spanEntry('other')).can).toBeUndefined();
  });

  it('reads `paint` off the rule that won, never off another rule of the same name (F3)', () => {
    // Two rules share one name and split the rows between them. A lookup by name answered with the
    // newest rule's paint whichever one claimed the row.
    const registry = createVariantRegistry(declaring({ key: 'a' }));
    const first = (): undefined => undefined;
    const second = (): undefined => undefined;
    registry.addConsumerVariant({ name: 'x', when: { a: 1 }, paint: first, items: () => [] });
    registry.addConsumerVariant({ name: 'x', when: { a: 2 }, paint: second });

    const one = registry.resolveFor(spanEntry('one', { a: 1 }));
    expect(one.name).toBe('x');
    expect(one.paint).toBe(first);
    expect(one.items(spanEntry('one', { a: 1 }), 'x')).toEqual([]);
    expect(registry.resolveFor(spanEntry('two', { a: 2 })).paint).toBe(second);
  });

  it('lets a plugin re-skin core’s own `leaf`, and disposal restores core’s producer', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');
    const shipped = registry.resolveFor(t1).items;

    const dispose = registry.addPluginVariant({ name: 'leaf', items: () => [] });
    expect(registry.resolveFor(t1).items(t1, 'leaf')).toEqual([]);

    dispose();
    expect(registry.resolveFor(t1).items).toBe(shipped);
  });
});
