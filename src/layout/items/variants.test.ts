// ADR 0018: a variant is a rule. This file is the rule's own suite — which rule wins, what a field
// match compares, and what the diagnostic reports. `produce-items.test.ts` is next door and asks a
// different question: what the row pass draws once a variant has been resolved.

import { describe, expect, it } from 'vitest';
import { barId, segmentId } from '../../model/index.js';
import type { Entry, Field, FieldKey, Instant } from '../../model/index.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import { bar, createVariantRegistry, diamond, summary } from './variants.js';
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
  it('draws one whole-entry Bar with no `bars` of its own, and its own producer with one', () => {
    const registry = createVariantRegistry(declaring({ key: 'plain' }, { key: 'twin' }));
    const t1 = spanEntry('t1');

    registry.addPluginVariant({ name: 'plain', when: { plain: true } });
    registry.addPluginVariant({
      name: 'twin',
      when: { twin: true },
      bars: (entry) => [
        {
          id: barId(entry.id, 7),
          entryId: entry.id,
          variant: 'twin',
          label: entry.name ?? '',
          start: entry.start!,
          end: entry.end!,
        },
      ],
    });

    expect(registry.resolveFor(spanEntry('a', { plain: true })).bars(t1, 'plain')).toHaveLength(1);
    expect(registry.resolveFor(spanEntry('b', { twin: true })).bars(t1, 'twin')[0]?.id).toBe(barId(t1.id, 7));
  });

  it('answers the `paint` and `capabilities` of the rule that claimed the row, and nothing for core’s floor', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const paint = (): undefined => undefined;
    const capabilities = { resize: false };

    registry.addPluginVariant({
      name: 'buffer',
      when: (entry) => entry.id === 'claimed',
      paint,
      capabilities,
    });

    expect(registry.resolveFor(spanEntry('claimed')).paint).toBe(paint);
    expect(registry.resolveFor(spanEntry('claimed')).capabilities).toBe(capabilities);
    expect(registry.resolveFor(spanEntry('other')).paint).toBeUndefined();
    expect(registry.resolveFor(spanEntry('other')).capabilities).toBeUndefined();
  });

  it('answers its own `css`, and `undefined` for a rule with none (F1)', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const styled = '.fg-bar-buffer { color: red; }';

    registry.addPluginVariant({ name: 'buffer', when: (entry) => entry.id === 'styled', css: styled });
    registry.addPluginVariant({ name: 'plain', when: (entry) => entry.id === 'plain' });

    expect(registry.resolveFor(spanEntry('styled')).css).toBe(styled);
    expect(registry.resolveFor(spanEntry('plain')).css).toBeUndefined();
  });

  it('reads `paint` off the rule that won, never off another rule of the same name (F3)', () => {
    // Two rules share one name and split the rows between them. A lookup by name answered with the
    // newest rule's paint whichever one claimed the row.
    const registry = createVariantRegistry(declaring({ key: 'a' }));
    const first = (): undefined => undefined;
    const second = (): undefined => undefined;
    registry.addConsumerVariant({ name: 'x', when: { a: 1 }, paint: first, bars: () => [] });
    registry.addConsumerVariant({ name: 'x', when: { a: 2 }, paint: second });

    const one = registry.resolveFor(spanEntry('one', { a: 1 }));
    expect(one.name).toBe('x');
    expect(one.paint).toBe(first);
    expect(one.bars(spanEntry('one', { a: 1 }), 'x')).toEqual([]);
    expect(registry.resolveFor(spanEntry('two', { a: 2 })).paint).toBe(second);
  });

  it('lets a plugin re-skin core’s own `leaf`, and disposal restores core’s producer', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const t1 = spanEntry('t1');
    const shipped = registry.resolveFor(t1).bars;

    const dispose = registry.addPluginVariant({ name: 'leaf', bars: () => [] });
    expect(registry.resolveFor(t1).bars(t1, 'leaf')).toEqual([]);

    dispose();
    expect(registry.resolveFor(t1).bars).toBe(shipped);
  });
});

describe('core’s three shipped factories (ADR 0022 §1)', () => {
  it('bar() answers the floor: no `when`, and `followSegments` as its `items`', () => {
    const variant = bar();
    expect(variant.name).toBe('leaf');
    expect(variant.when).toBeUndefined();
    expect(variant.css).toBeUndefined();
    // followSegments, not the whole-entry default: a Segment on the row draws its own Bar.
    const [item] = variant.bars!(spanEntry('t1'), 'leaf');
    expect(item!.variant).toBe('leaf');
    expect(item!.segmentId).toBeDefined();
  });

  it('summary() claims a row by structure, carries the rail’s own class and css, and states one whole-entry Bar explicitly (ADR 0023)', () => {
    const variant = summary();
    const [parent, child] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', start: 0, end: 10, parentId: 'p' },
    ]);
    expect((variant.when as (entry: Entry) => boolean)(parent!)).toBe(true);
    expect((variant.when as (entry: Entry) => boolean)(child!)).toBe(false);
    expect((variant.paint as unknown as () => unknown)?.()).toEqual({ class: { 'fg-bar-summary': true } });
    expect(variant.css).toContain('.fg-bar-summary');

    // A parent may author several Segments of its own (`src/data/rollup.ts`). `summary()` still
    // draws one rail, because it states `ignoreSegments` explicitly rather than trusting the
    // registry's data-following default to agree.
    const busyParent = entryDouble({
      id: 'p2',
      start: 0,
      end: 10,
      segments: [
        { id: segmentId('p2-0'), start: 0 as Instant, end: 4 as Instant },
        { id: segmentId('p2-1'), start: 6 as Instant, end: 10 as Instant },
      ],
    });
    expect(variant.bars!(busyParent, 'summary')).toHaveLength(1);
  });

  it('summary()’s `ignoreSegments` draws no Bar for a claimed row’s subject (#421 C2, Q27)', () => {
    const variant = summary();
    const claimedParent = entryDouble({ id: 'p3', start: 0, end: 10 });
    expect(variant.bars!(claimedParent, 'summary', true)).toEqual([]);
    // The parameter is optional (a two-argument producer an author already wrote keeps compiling,
    // ADR 0018): omitted, it still draws the rail.
    expect(variant.bars!(claimedParent, 'summary')).toHaveLength(1);
  });

  it('bar()’s `followSegments` draws no Bar for a claimed row’s subject (#421 C2, Q27)', () => {
    const variant = bar();
    const claimedParent = spanEntry('p4');
    expect(variant.bars!(claimedParent, 'leaf', true)).toEqual([]);
    expect(variant.bars!(claimedParent, 'leaf')).toHaveLength(1);
  });

  it('diamond() claims a zero-duration row, draws a 13px fixed box, and carries its own css', () => {
    const variant = diamond();
    const point = entryDouble({ id: 'm', start: 5, end: 5 });
    expect((variant.when as (entry: Entry) => boolean)(point)).toBe(true);
    expect((variant.when as (entry: Entry) => boolean)(spanEntry('span'))).toBe(false);
    const [item] = variant.bars!(point, 'diamond');
    expect(item!.box).toEqual({ widthPx: 13, anchor: 'center' });
    expect((variant.paint as unknown as () => unknown)?.()).toEqual({ class: { 'fg-bar-diamond': true } });
    expect(variant.css).toContain('.fg-bar-diamond');
  });

  // #326: the box's own outline is cancelled so the glyph's ::before carries selection, but that
  // cancel must not also eat a keyboard-focused diamond's own focus ring.
  it('cancels the selected box outline only when the box is not the focus-visible target (#326)', () => {
    const variant = diamond();
    const selectedRule = variant
      .css!.split('\n')
      .find((line) => line.startsWith('.fg-bar-diamond[data-state~="selected"]:not'));
    expect(selectedRule).toContain(':not(:focus-visible)');
    expect(selectedRule).toContain('outline: none');
  });

  it('diamond() ships not resizable, so a resize cannot turn its point into a bar; an override opts back in', () => {
    const shipped = diamond();
    expect(shipped.capabilities).toEqual({ resize: false });

    const opted = diamond({ capabilities: { resize: true } });
    expect(opted.capabilities).toEqual({ resize: true });
  });

  it('diamond() is not seeded into a fresh registry — no row wears it until installed', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const point = entryDouble({ id: 'm', start: 5, end: 5 });
    expect(registry.resolveFor(point).name).not.toBe('diamond');
  });

  it('every key on `overrides` wins, `paint` included', () => {
    const paint = (): undefined => undefined;
    const variant = diamond({ name: 'checkpoint', when: { checkpoint: true }, paint });
    expect(variant.name).toBe('checkpoint');
    expect(variant.when).toEqual({ checkpoint: true });
    expect(variant.paint).toBe(paint);
    // Everything `overrides` left untouched still answers core's default.
    expect(variant.bars).toBeDefined();
    expect(variant.css).toContain('.fg-bar-diamond');
  });

  it('a fresh registry still resolves `summary()` for a row with children', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const [parent, child] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', start: 0, end: 10, parentId: 'p' },
    ]);
    expect(registry.resolveFor(parent!).name).toBe('summary');
    expect(registry.resolveFor(child!).name).toBe('leaf');
  });

  it('a when-less consumer variant still loses to `summary()` on a row it claims, even at a higher rank (J60)', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addConsumerVariant({ name: 'floor', paint: () => ({}) });
    const [parent, child] = entryDoubles([
      { id: 'p', start: 0, end: 10 },
      { id: 'c', start: 0, end: 10, parentId: 'p' },
    ]);
    expect(registry.resolveFor(parent!).name).toBe('summary');
    // The child has no claiming rule, so the newest when-less registration wins there instead.
    expect(registry.resolveFor(child!).name).toBe('floor');
  });

  it('installedCss() answers every installed variant’s css, core first, and skips one with none', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    expect(registry.installedCss()).toEqual([summary().css]);

    registry.addConsumerVariant(diamond());
    const css = registry.installedCss();
    expect(css).toHaveLength(2);
    expect(css[0]).toContain('.fg-bar-summary');
    expect(css[1]).toContain('.fg-bar-diamond');
  });

  it('installedCss() answers nothing once the css-bearing variant is disposed', () => {
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const dispose = registry.addConsumerVariant(diamond());
    expect(registry.installedCss()).toHaveLength(2);

    dispose();
    expect(registry.installedCss()).toEqual([summary().css]);
  });
});
