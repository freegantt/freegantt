// ADR 0018: a variant is a rule. This file is the rule's own suite — which rule wins, what a field
// match compares, and what the diagnostic reports. `produce-items.test.ts` is next door and asks a
// different question: what the row pass draws once a variant has been resolved.

import { describe, expect, it } from 'vitest';
import { itemId } from '../../model/index.js';
import type { Entry, Field, FieldKey } from '../../model/index.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import { createVariantRegistry } from './variants.js';
import type { DoubleVariantClaim } from './variants.js';

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

    expect(registry.variantFor(parent!)).toBe('parent');
    expect(registry.variantFor(child!)).toBe('leaf');
  });

  it('lets a plugin variant override core’s own `parent` on a row with children (Q5)', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', parentId: 'p', start: 0, end: 10 },
    ]);

    registry.addPluginVariant({ name: 'phase', when: (entry) => entry.hasChildren });

    expect(registry.variantFor(parent!)).toBe('phase');
  });

  it('lets the newest of two plugin rules win, and disposing it restores the older one', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'buffer', when: () => true });
    const disposeNewest = registry.addPluginVariant({ name: 'risk', when: () => true });
    expect(registry.variantFor(t1)).toBe('risk');

    disposeNewest();
    expect(registry.variantFor(t1)).toBe('buffer');
  });

  it('lets a consumer variant win over a plugin’s, even though the plugin registered later', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');

    registry.addConsumerVariant({ name: 'mine', when: () => true });
    registry.addPluginVariant({ name: 'theirs', when: () => true });

    expect(registry.variantFor(t1)).toBe('mine');
  });

  it('claims a row added after the rule was installed — the bug the id set caused', () => {
    const registry = createVariantRegistry(declaring({ key: 'buffer' }));
    registry.addPluginVariant({ name: 'buffer', when: { buffer: true } });

    const later = spanEntry('added-later', { buffer: true });

    expect(registry.variantFor(later)).toBe('buffer');
  });

  it('treats a variant with no `when` as the last resort, and every row still resolves', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'everything' });

    expect(registry.variantFor(t1)).toBe('everything');
    expect(registry.variantFor(spanEntry('t2'))).toBe('everything');
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

    expect(registry.variantFor(spanEntry('a', { milestone: true }))).toBe('milestone');
    expect(registry.variantFor(spanEntry('b', { milestone: false }))).toBe('leaf');
  });

  it('never means "has a value": `{ flag: true }` passes over `flag: "yes"`', () => {
    const registry = createVariantRegistry(declaring({ key: 'flag' }));
    registry.addPluginVariant({ name: 'flagged', when: { flag: true } });

    expect(registry.variantFor(spanEntry('a', { flag: 'yes' }))).toBe('leaf');
    expect(registry.variantFor(spanEntry('b', { flag: true }))).toBe('flagged');
  });

  it('ANDs its keys', () => {
    const registry = createVariantRegistry(declaring({ key: 'milestone' }, { key: 'locked' }));
    registry.addPluginVariant({ name: 'both', when: { milestone: true, locked: false } });

    expect(registry.variantFor(spanEntry('a', { milestone: true, locked: false }))).toBe('both');
    expect(registry.variantFor(spanEntry('b', { milestone: true, locked: true }))).toBe('leaf');
  });

  it('compares through the Field’s own `equals`, and falls back to Object.is with none', () => {
    const caseInsensitive: Field = {
      key: 'status',
      equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
    };
    const registry = createVariantRegistry(declaring(caseInsensitive));
    registry.addPluginVariant({ name: 'blocked', when: { status: 'BLOCKED' } });

    expect(registry.variantFor(spanEntry('a', { status: 'blocked' }))).toBe('blocked');

    const strict = createVariantRegistry(declaring({ key: 'status' }));
    strict.addPluginVariant({ name: 'blocked', when: { status: 'BLOCKED' } });
    expect(strict.variantFor(spanEntry('a', { status: 'blocked' }))).toBe('leaf');
  });

  it('claims no row at all when no Field declares the key (F2)', () => {
    // `entry.read` throws on a key no Field declares, and this runs on every row of every layout
    // pass. A typo — and the one rule a chrome plugin cannot declare for itself — answers no.
    const registry = createVariantRegistry(declaring({ key: 'milestone' }));
    registry.addPluginVariant({ name: 'typo', when: { mileStone: true } });

    expect(registry.variantFor(spanEntry('a', { mileStone: true }))).toBe('leaf');
  });

  it('reads a predicate for "has a value", which is the question a match does not ask', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addPluginVariant({
      name: 'phased',
      when: (entry) => entry.read('demo:phaseId') !== undefined,
    });

    expect(registry.variantFor(spanEntry('a', { 'demo:phaseId': 'p1' }))).toBe('phased');
    expect(registry.variantFor(spanEntry('b'))).toBe('leaf');
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

    expect(registry.variantFor(t1)).toBe('risk');
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

    expect(registry.variantFor(parent!)).toBe('phase');
    expect(seen).toEqual([]);
  });

  it('stays silent when a consumer rule overrides a plugin’s', () => {
    const { registry, seen } = collecting();

    registry.addPluginVariant({ name: 'theirs', when: () => true }, 'demo.theirs');
    registry.addConsumerVariant({ name: 'mine', when: () => true });

    expect(registry.variantFor(spanEntry('t1'))).toBe('mine');
    expect(seen).toEqual([]);
  });
});

describe('what a variant answers about itself', () => {
  it('draws one whole-entry Item with no `items` of its own, and its own producer with one', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
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

    expect(registry.itemsFor('plain')?.(t1)).toHaveLength(1);
    expect(registry.itemsFor('twin')?.(t1)[0]?.id).toBe(itemId(t1.id, 7));
  });

  it('answers its own `paint` and `can` by name, and nothing for a name nobody registered', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const paint = (): undefined => undefined;
    const can = { resize: false };

    registry.addPluginVariant({ name: 'buffer', when: () => true, paint, can });

    expect(registry.paintFor('buffer')).toBe(paint);
    expect(registry.interactionsFor('buffer')).toBe(can);
    expect(registry.paintFor('nobody')).toBeUndefined();
    expect(registry.interactionsFor('nobody')).toBeUndefined();
  });

  it('lets a plugin re-skin core’s own `leaf`, and disposal restores core’s producer', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');
    const shipped = registry.itemsFor('leaf');

    const dispose = registry.addPluginVariant({ name: 'leaf', items: () => [] });
    expect(registry.itemsFor('leaf')?.(t1)).toEqual([]);

    dispose();
    expect(registry.itemsFor('leaf')).toBe(shipped);
  });
});
