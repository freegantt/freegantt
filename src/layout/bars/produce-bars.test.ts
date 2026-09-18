import { describe, expect, it } from 'vitest';
import { emptyGroupDataset } from '../../../fixtures/empty-group-dataset.js';
import { barId, rowId } from '../../model/index.js';
import type { Entry, EntryId } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import type { PlannedRow } from '../rows/row-source.js';
import { produceBarsForRow } from './produce-bars.js';
import { wholeEntryBar } from './bar.js';
import { createVariantRegistry } from './variants.js';

describe('wholeEntryBar (review P3)', () => {
  it('covers the entry span, stamps the variant it is told, and owns the Bar id convention', () => {
    const t1 = spanEntry('t1', { name: 'Load test' });
    // No `label` (#421 C5, Q36): the built-in producer leaves it absent, so `placeFrame`'s bound
    // `barLabelFor` resolves the Entry's name through its Field — this Bar never restates it.
    expect(wholeEntryBar(t1, 'buffer')).toEqual({
      id: barId(t1.id, 0),
      entryId: t1.id,
      variant: 'buffer',
      start: t1.start,
      end: t1.end,
    });
  });

  // Retired (ADR 0026, #421): 'carries no segmentId, because it draws the whole Entry and stands
  // for no single Segment' pinned `Bar.segmentId`, which no longer exists — a Bar never carried a
  // second id to stand apart from. 'draws one Bar per Segment for a variant with no `bars` of its
  // own' pinned `followSegments`, deleted with the several-Segment single Entry it walked; a core
  // Entry now always draws exactly one Bar over its own span, so a variant with no `bars` of its own
  // gets `unclaimedSpan` instead — the same one-Bar answer the merged test below already covers.

  it('is what a variant with no `bars` of its own draws for an Entry (ADR 0023, ADR 0026)', () => {
    const t1 = spanEntry('t1');
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({ name: 'buffer', when: () => true });
    expect(produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), own)).toEqual([
      wholeEntryBar(t1, 'buffer'),
    ]);
  });
});

describe('a producer stamps the registration’s own name, not one it invents (ADR 0018, J3)', () => {
  it('receives the resolved variant’s name, so one producer registered under two names stamps each correctly', () => {
    const t1 = spanEntry('t1');
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const dispose = registry.addPluginVariant({
      name: 'phase',
      when: () => true,
      bars: (entry, variant) => [wholeEntryBar(entry, variant)],
    });

    expect(produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([
      wholeEntryBar(t1, 'phase'),
    ]);

    dispose();
    registry.addPluginVariant({
      name: 'stage',
      when: () => true,
      bars: (entry, variant) => [wholeEntryBar(entry, variant)],
    });
    expect(produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([
      wholeEntryBar(t1, 'stage'),
    ]);
  });
});

function spanEntry(id: string, extras: Partial<EntryDoubleValues> = {}): Entry {
  return entryDouble({ id, start: 0, end: 10, ...extras });
}

function planned(entryIds: readonly EntryId[], kind: 'entry' | 'header' = 'entry'): PlannedRow {
  return {
    id: rowId(entryIds[0] !== undefined ? String(entryIds[0]) : 'header'),
    kind: entryIds.length === 0 ? 'header' : kind,
    index: 0,
    depth: 0,
    entryIds,
    expandable: false,
    expanded: true,
  };
}

function entryByIdFor(entries: readonly Entry[]): ReadonlyMap<EntryId, Entry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

const registry = createVariantRegistry({ fieldFor: () => undefined });

describe('produceBarsForRow', () => {
  // Retired (ADR 0026, #421): 'produces one Bar per Segment with ids t1:0, t1:1, t1:2' pinned a
  // several-Segment single Entry, which no longer exists — a core Entry always draws exactly one
  // Bar over its own span now. The surviving question, "what does an ordinary Entry draw," is the
  // test below, rewritten off `t1.segments[0]` onto the Entry's own span.

  it('produces t1:0 for an ordinary Entry — always exactly one Bar (#421, ADR 0026)', () => {
    const t1 = spanEntry('t1');
    const bars = produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.id).toBe(barId(t1.id, 0));
    expect(bars[0]?.start).toBe(t1.start);
    expect(bars[0]?.end).toBe(t1.end);
  });

  it('draws the leaf variant for a childless Entry no rule claims (ADR 0013)', () => {
    const t1 = spanEntry('t1');
    expect(() => produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).not.toThrow();
    const bars = produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.id).toBe(barId(t1.id, 0));
    expect(bars[0]?.variant).toBe('leaf');
  });

  it('draws the parent variant for an Entry with children no rule claims', () => {
    const [t1] = entryDoubles([
      { id: 't1', start: 0, end: 10 },
      { id: 'c1', parentId: 't1', start: 0, end: 10 },
    ]);
    const bars = produceBarsForRow(planned([t1!.id]), entryByIdFor([t1!]), registry);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.variant).toBe('summary');
  });

  it('an Entry with only a start date draws no bar (ADR 0012 Gate)', () => {
    const t1 = entryDouble({ id: 't1', start: 0 });
    expect(t1.end).toBeUndefined();
    const bars = produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(bars).toHaveLength(0);
  });

  it('[S4-A8] an entry with no children produces no Bar; a child gives it a real span (ADR 0012)', () => {
    const dataset = emptyGroupDataset();
    const empty = dataset.entries.get('g1')!;
    expect(empty.start).toBeUndefined();
    expect(empty.end).toBeUndefined();
    const emptyBars = produceBarsForRow(planned([empty.id]), entryByIdFor([empty]), registry);
    expect(emptyBars).toHaveLength(0);

    dataset.entries.add({
      id: 'c1',
      parentId: 'g1',
      name: 'c1',
      start: '2026-03-01',
      end: '2026-03-05',
    });
    const filled = dataset.entries.get('g1')!;
    const filledBars = produceBarsForRow(planned([filled.id]), entryByIdFor([filled]), registry);
    expect(filledBars).toHaveLength(1);
    expect(filledBars[0]?.start).toBe(filled.start);
    expect(filledBars[0]?.end).toBe(filled.end);
    expect(filledBars[0]?.start).not.toBe(filledBars[0]?.end);
  });

  it('passes `childrenAsSegments: true` only for a claimed row’s subject — nothing skips it (#421 C2, Q33)', () => {
    const [p1, c1] = entryDoubles([
      { id: 'p1', start: 0, end: 10 },
      { id: 'c1', parentId: 'p1', start: 0, end: 10 },
    ]);
    const seen: Array<{ id: string; childrenAsSegments: boolean | undefined }> = [];
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({
      name: 'watch',
      when: () => true,
      bars: (entry, variant, childrenAsSegments) => {
        seen.push({ id: entry.id, childrenAsSegments });
        return [wholeEntryBar(entry, variant)];
      },
    });

    const claimedRow: PlannedRow = { ...planned([p1!.id, c1!.id]), claimed: true };
    produceBarsForRow(claimedRow, entryByIdFor([p1!, c1!]), own);

    // The subject (entryIds[0]) is asked with `true`; the child it claims is asked with `false`.
    // Nothing is skipped — the producer runs, and answers, for both (Q33).
    expect(seen).toEqual([
      { id: 'p1', childrenAsSegments: true },
      { id: 'c1', childrenAsSegments: false },
    ]);
  });

  it('an unclaimed row never passes `childrenAsSegments: true`', () => {
    const t1 = spanEntry('t1');
    const seen: (boolean | undefined)[] = [];
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({
      name: 'watch',
      when: () => true,
      bars: (entry, variant, childrenAsSegments) => {
        seen.push(childrenAsSegments);
        return [wholeEntryBar(entry, variant)];
      },
    });

    produceBarsForRow(planned([t1.id]), entryByIdFor([t1]), own);
    expect(seen).toEqual([false]);
  });

  it('a header row (kind: header) produces no Bars', () => {
    const t1 = spanEntry('t1');
    const header: PlannedRow = {
      id: rowId('header'),
      kind: 'header',
      index: 0,
      depth: 0,
      entryIds: [],
      expandable: false,
      expanded: true,
      headerLabel: 'Team',
    };
    const bars = produceBarsForRow(header, entryByIdFor([t1]), registry);
    expect(bars).toEqual([]);
  });
});
