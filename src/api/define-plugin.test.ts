// api/ — ADR 0019's own acceptance: one plugin, two halves, one install site. Everything here goes
// through the public surface a consumer reaches, because the install site is the thing under test.

import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import { definePlugin } from './define-plugin.js';
import { DuplicatePluginIdError, PluginNotInstalledError, PluginSetupError } from '../model/index.js';
import type { ChromePlugin, DataPlugin } from './index.js';

const entries = [
  { id: 'p1', name: 'Sitework', start: '2026-09-01', end: '2026-09-02' },
  { id: 't1', name: 'Design', parentId: 'p1', start: '2026-09-01', end: '2026-09-02', props: { cost: 500 } },
];

function newDataset(plugins: readonly (ChromePlugin | DataPlugin)[] = []): Dataset {
  return new Dataset({ timeZone: 'UTC', entries, plugins });
}

function mount(
  dataset: Dataset,
  plugins?: readonly ChromePlugin[],
): { gantt: Gantt; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.append(container);
  const gantt = new Gantt({ dataset, container, ...(plugins ? { plugins } : {}) });
  return { gantt, container };
}

/** Which variant each painted bar wears, by Bar id. The rendered `data-variant` attribute is the
 *  one public reading of a resolved variant. */
function variantsOn(container: HTMLElement): Record<string, string> {
  const painted: Record<string, string> = {};
  for (const bar of Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'))) {
    const id = bar.getAttribute('data-bar-id');
    const variant = bar.getAttribute('data-variant');
    if (id !== null && variant !== null) painted[id] = variant;
  }
  return painted;
}

/** Both halves in one object: the `data` half declares a rolling-up Field, the `view` half paints
 *  the rows that carry it. This is the shape ADR 0019 exists for. */
function costing(seen: string[], ganttsSeen: unknown[] = []) {
  return definePlugin({
    id: 'demo.costing',
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
    data() {
      seen.push('data');
    },
    view(ctx) {
      seen.push('view');
      ganttsSeen.push(ctx.gantt);
      ctx.variants.add({
        name: 'costed',
        when: (entry) => entry.read('cost') !== undefined,
        paint: () => ({ class: { 'demo-costed-bar': true } }),
      });
    },
  });
}

describe('one plugin, two halves, one install site (ADR 0019)', () => {
  it('runs the data half as the Dataset constructs, so its Field is there for the first Rollup', () => {
    const seen: string[] = [];
    const dataset = newDataset([costing(seen)]);

    expect(seen).toEqual(['data']);
    expect(dataset.field('cost')?.type).toBe('money');
    expect(dataset.entries.get('p1')?.read('cost')).toBe(500);
  });

  it('runs the view half once per Gantt bound to that Dataset, each with its own context (I2)', () => {
    const seen: string[] = [];
    const ganttsSeen: unknown[] = [];
    const dataset = newDataset([costing(seen, ganttsSeen)]);
    const first = mount(dataset);
    const second = mount(dataset);

    expect(seen).toEqual(['data', 'view', 'view']);
    // One `view(ctx)` call is one Gantt's worth of state: each half saw its own Gantt.
    expect(ganttsSeen).toEqual([first.gantt, second.gantt]);
    // Neither Gantt reports the Dataset's plugin as its own, because neither installed it.
    expect(first.gantt.plugins).toEqual([]);
    expect(second.gantt.plugins).toEqual([]);
  });

  it('paints a Dataset plugin variant on the first frame, with no Gantt-side install', async () => {
    const { container } = mount(newDataset([costing([])]));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(variantsOn(container)['t1:0']).toBe('costed');
    const bar = container.querySelector<HTMLElement>('.fg-bar[data-variant="costed"]')!;
    expect(bar.classList.contains('demo-costed-bar')).toBe(true);
  });

  it('leaves a chrome-only plugin on the Gantt, and reconfigures it live', () => {
    const installed: string[] = [];
    const shading = () =>
      definePlugin({
        id: 'demo.shading',
        view() {
          installed.push('shading');
          return () => installed.push('shading disposed');
        },
      });

    const { gantt } = mount(newDataset(), [shading()]);
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.shading']);

    gantt.plugins = [];
    expect(installed).toEqual(['shading', 'shading disposed']);

    gantt.installPlugin(shading());
    expect(gantt.hasPlugin('demo.shading')).toBe(true);
    gantt.uninstallPlugin('demo.shading');
    expect(gantt.hasPlugin('demo.shading')).toBe(false);
  });

  it('refuses to uninstall a Dataset plugin from a Gantt, because the Gantt did not install it', () => {
    const { gantt } = mount(newDataset([costing([])]));
    expect(() => gantt.uninstallPlugin('demo.costing')).toThrow(PluginNotInstalledError);
  });

  it('gives every Gantt on a Dataset a chrome-only plugin installed there', () => {
    const installed: string[] = [];
    const shading = definePlugin({
      id: 'demo.shading',
      view() {
        installed.push('shading');
      },
    });
    const dataset = newDataset([shading]);
    mount(dataset);
    mount(dataset);
    expect(installed).toEqual(['shading', 'shading']);
  });
});

describe('the wrong install site (ADR 0019, Q4)', () => {
  const costed = costing([]);

  it('throws PluginSetupError, and the message says where to install it', () => {
    const dataset = newDataset();
    // The compiler refuses this first — see the `@ts-expect-error` case below. This is the caller
    // the compiler never met: plain JavaScript, or a list a helper widened.
    const widened = [costed] as unknown as readonly ChromePlugin[];

    let thrown: unknown;
    try {
      mount(dataset, widened);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(PluginSetupError);
    expect((thrown as PluginSetupError).pluginId).toBe('demo.costing');
    expect((thrown as Error).message).toMatch(/installs on the Dataset, not on the Gantt/);
    // The id is quoted, and the site is shown with no fake call around it (`F26`).
    expect((thrown as Error).message).toContain('id "demo.costing"');
    expect((thrown as Error).message).toMatch(/new Dataset\(\{ entries, plugins: \[…\] \}\)/);
  });

  it('throws the same error from the live setter and from installPlugin', () => {
    const { gantt } = mount(newDataset());
    const widened = costed as unknown as ChromePlugin;
    expect(() => {
      gantt.plugins = [widened];
    }).toThrow(PluginSetupError);
    expect(() => gantt.installPlugin(widened)).toThrow(PluginSetupError);
  });

  it('does not typecheck, and this @ts-expect-error is what stops that refusal regressing', () => {
    const dataset = newDataset();
    const container = document.createElement('div');
    expect(
      () =>
        new Gantt({
          dataset,
          container,
          // @ts-expect-error ADR 0019: a plugin with a `data` half installs on the Dataset.
          plugins: [costed],
        }),
    ).toThrow(PluginSetupError);
  });

  it('refuses a chrome id that a Dataset plugin already holds', () => {
    const dataset = newDataset([costing([])]);
    const clash = definePlugin({ id: 'demo.costing', view() {} });
    expect(() => mount(dataset, [clash])).toThrow(DuplicatePluginIdError);
  });
});

describe('requires covers both halves (D-S5-31)', () => {
  it('orders a chrome plugin after the Dataset plugin it requires', () => {
    const order: string[] = [];
    const base = definePlugin({
      id: 'demo.base',
      data() {
        order.push('base data');
      },
      view() {
        order.push('base view');
      },
    });
    const rider = definePlugin({
      id: 'demo.rider',
      requires: ['demo.base'],
      view() {
        order.push('rider view');
      },
    });

    mount(newDataset([base]), [rider]);
    expect(order).toEqual(['base data', 'base view', 'rider view']);
  });

  it('lets a chrome plugin require a plugin whose only half is data', () => {
    const order: string[] = [];
    const headless = definePlugin({
      id: 'demo.headless',
      data() {
        order.push('headless data');
      },
    });
    const rider = definePlugin({
      id: 'demo.rider',
      requires: ['demo.headless'],
      view() {
        order.push('rider view');
      },
    });

    const { gantt } = mount(newDataset([headless]), [rider]);
    expect(order).toEqual(['headless data', 'rider view']);
    // A plugin with no `view` half runs nothing on the Gantt, and stays off the Gantt's own list.
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.rider']);
  });
});

describe('a failed install unwinds what it set up before it', () => {
  it('disposes the data halves already installed, and rethrows PluginSetupError', () => {
    const log: string[] = [];
    const good = definePlugin({
      id: 'demo.good',
      data() {
        log.push('good');
        return () => log.push('good disposed');
      },
    });
    const bad = definePlugin({
      id: 'demo.bad',
      requires: ['demo.good'],
      data() {
        throw new Error('bad data half');
      },
    });

    expect(() => newDataset([good, bad])).toThrow(PluginSetupError);
    expect(log).toEqual(['good', 'good disposed']);
  });

  it('disposes the view halves already installed, and leaves the Dataset alone', () => {
    const log: string[] = [];
    const good = definePlugin({
      id: 'demo.good',
      view() {
        log.push('good');
        return () => log.push('good disposed');
      },
    });
    const bad = definePlugin({
      id: 'demo.bad',
      requires: ['demo.good'],
      view() {
        throw new Error('bad view half');
      },
    });

    const dataset = newDataset();
    expect(() => mount(dataset, [good, bad])).toThrow(PluginSetupError);
    expect(log).toEqual(['good', 'good disposed']);
    expect(dataset.entries.get('t1')?.name).toBe('Design');
  });
});
