// #170: the invalidation matrix for the plugin registration seams, in one place. Before this
// file the answers lived in `buildPluginPorts`, one layer away from the registration itself, and the
// decoration seam's own lifetime was hand-written in a closure inside `GanttShell`.
//
// Two questions per seam. What runs again when a plugin registers, and what runs again when it
// disposes (#155 — the registration that wins after a disposal has to be shown too).

import { describe, expect, it } from 'vitest';
import { PluginRegistrations } from './plugin-registrations.js';
import type { PluginRegistrationPorts } from './plugin-registrations.js';
import { createVariantRegistry } from '../layout/index.js';
import { entryDouble } from '../layout/entry-double.js';
import type { Disposer, GridColumnInput, PluginId } from '../model/index.js';

const PLUGIN: PluginId = 'demo.plugin';

interface Harness {
  registrations: PluginRegistrations;
  counts: { frames: number; items: number; capabilities: number; variantStyles: number };
  /** Every Grid column `ColumnChrome` was asked for, in order — that seam is a delegation. */
  columns: GridColumnInput[];
}

function harness(): Harness {
  const counts = { frames: 0, items: 0, capabilities: 0, variantStyles: 0 };
  const columns: GridColumnInput[] = [];
  const ports: PluginRegistrationPorts = {
    requestFrame: () => {
      counts.frames += 1;
    },
    invalidateItems: () => {
      counts.items += 1;
    },
    refreshCapabilities: () => {
      counts.capabilities += 1;
    },
    refreshVariantStyles: () => {
      counts.variantStyles += 1;
    },
    registerGridColumn: (column): Disposer => {
      columns.push(column);
      return () => {
        const index = columns.indexOf(column);
        if (index >= 0) columns.splice(index, 1);
      };
    },
  };
  return {
    registrations: new PluginRegistrations(ports, createVariantRegistry({ fieldFor: () => undefined })),
    counts,
    columns,
  };
}

describe('PluginRegistrations — what each seam invalidates', () => {
  it('a renderer claim repaints on the way in and on the way out', () => {
    const { registrations, counts } = harness();

    const dispose = registrations.registerRenderer('gridCell', () => ({ text: '' }), PLUGIN);
    expect(counts).toMatchObject({ frames: 1, items: 0, capabilities: 0 });

    dispose();
    expect(counts.frames).toBe(2);
  });

  it('a decoration provider repaints on both edges', () => {
    const { registrations, counts } = harness();

    const dispose = registrations.registerDecoration('underBars', () => []);
    expect(counts).toMatchObject({ frames: 1, items: 0, capabilities: 0 });

    dispose();
    expect(counts.frames).toBe(2);
  });

  // ADR 0018 and ADR 0022 §5: one variant answers five questions, so one registration invalidates
  // all three passes — the Items every row produces, every capability, and the frame — and rewrites
  // its own `css`, which reaches the document on this same edge.
  it('a variant re-produces every row, re-resolves every capability, rewrites its own css and repaints, on both edges', () => {
    const { registrations, counts } = harness();

    const dispose = registrations.registerVariant({ name: 'buffer', when: () => true }, PLUGIN);
    expect(counts).toMatchObject({ items: 1, frames: 1, capabilities: 1, variantStyles: 1 });

    dispose();
    expect(counts).toMatchObject({ items: 2, frames: 2, capabilities: 2, variantStyles: 2 });
  });

  it('a Grid column asks for nothing here — `ColumnChrome` owns that seam’s own refresh', () => {
    const { registrations, counts, columns } = harness();

    const dispose = registrations.registerGridColumn('cost', 'acme/costs');
    expect(columns).toEqual(['cost']);
    expect(counts).toMatchObject({ frames: 0, items: 0, capabilities: 0 });

    dispose();
    expect(columns).toEqual([]);
  });
});

describe('PluginRegistrations — the tables it reads back', () => {
  it('answers a variant’s own `can`, and undefined for a row no rule claimed', () => {
    const { registrations } = harness();
    const can = { move: false };

    registrations.registerVariant({ name: 'buffer', when: (entry) => entry.id === 'claimed', can }, PLUGIN);

    expect(registrations.variants.resolveFor(entryDouble({ id: 'claimed' })).can).toBe(can);
    expect(registrations.variants.resolveFor(entryDouble({ id: 'other' })).can).toBeUndefined();
  });

  it('a second plugin on one variant name wins, and disposing it restores the first (#154)', () => {
    const { registrations } = harness();
    const first = { move: false };
    const second = { move: true };

    registrations.registerVariant({ name: 'buffer', when: () => true, can: first }, PLUGIN);
    const disposeSecond = registrations.registerVariant(
      { name: 'buffer', when: () => true, can: second },
      'demo.other',
    );
    expect(registrations.variants.resolveFor(entryDouble({ id: 't1' })).can).toBe(second);

    disposeSecond();
    expect(registrations.variants.resolveFor(entryDouble({ id: 't1' })).can).toBe(first);
  });

  it('every decoration provider paints, in registration order — not only the newest', () => {
    const { registrations } = harness();
    const first = (): [] => [];
    const second = (): [] => [];

    registrations.registerDecoration('underBars', first);
    registrations.registerDecoration('overBars', second);

    expect(registrations.decorationProviders()).toEqual([
      { layer: 'underBars', provider: first },
      { layer: 'overBars', provider: second },
    ]);
  });

  // #188: `computeFrame` reads this list on every frame, and frames fire on scroll. So the walk of
  // the table runs on a registration change, and the frames between two changes read one instance.
  it('hands out the same list on two reads, so a frame allocates none of it (#188)', () => {
    const { registrations } = harness();
    registrations.registerDecoration('underBars', () => []);

    expect(registrations.decorationProviders()).toBe(registrations.decorationProviders());
  });

  it('hands out a new list after a registration, and after a disposal (#188)', () => {
    const { registrations } = harness();
    const before = registrations.decorationProviders();

    const dispose = registrations.registerDecoration('underBars', () => []);
    const afterRegister = registrations.decorationProviders();
    expect(afterRegister).not.toBe(before);
    expect(afterRegister).toHaveLength(1);

    dispose();
    const afterDispose = registrations.decorationProviders();
    expect(afterDispose).not.toBe(afterRegister);
    expect(afterDispose).toEqual([]);
  });

  it('a decoration disposer removes exactly its own provider, in any order (#155)', () => {
    const { registrations } = harness();
    const first = (): [] => [];
    const second = (): [] => [];
    const third = (): [] => [];

    registrations.registerDecoration('underBars', first);
    const disposeSecond = registrations.registerDecoration('underBars', second);
    registrations.registerDecoration('underBars', third);

    disposeSecond();
    expect(registrations.decorationProviders().map((p) => p.provider)).toEqual([first, third]);
  });

  it('two plugins registering the same provider on the same layer stay two registrations', () => {
    const { registrations } = harness();
    const shared = (): [] => [];

    const disposeFirst = registrations.registerDecoration('underBars', shared);
    registrations.registerDecoration('underBars', shared);
    expect(registrations.decorationProviders()).toHaveLength(2);

    disposeFirst();
    expect(registrations.decorationProviders()).toHaveLength(1);
  });

  it('calling a decoration disposer twice is safe', () => {
    const { registrations, counts } = harness();

    const dispose = registrations.registerDecoration('underBars', () => []);
    dispose();
    dispose();

    expect(registrations.decorationProviders()).toEqual([]);
    expect(counts.frames).toBe(3);
  });

  it('two Gantts share no registrations (I2)', () => {
    const first = harness();
    const second = harness();

    first.registrations.registerDecoration('underBars', () => []);

    expect(first.registrations.decorationProviders()).toHaveLength(1);
    expect(second.registrations.decorationProviders()).toHaveLength(0);
    expect(second.counts.frames).toBe(0);
  });

  it('a refused renderer claim asks for no repaint — nothing changed to show', () => {
    const { registrations, counts } = harness();

    registrations.registerRenderer('gridCell', () => ({ text: '' }), PLUGIN);
    expect(counts.frames).toBe(1);

    expect(() => registrations.registerRenderer('gridCell', () => ({ text: '' }), 'other.plugin')).toThrow();
    expect(counts.frames).toBe(1);
  });
});
