import { describe, expect, it, vi } from 'vitest';
import { barId, entryId } from '../../model/index.js';
import { createTimeScale, dayPreset, instant } from '../../time/index.js';
import { entryDoubles } from '../entry-double.js';
import { createVariantRegistry } from '../bars/variants.js';
import { FrameLayout } from '../frame-layout.js';
import type { LayoutInput } from '../frame.js';
import type { BarPreview } from '../bar-preview.js';
import type { ConnectorInput, ConnectorProvider } from '../connector-input.js';

const MS_PER_BAR = 1_000_000;
const ENTRY_COUNT = 10_000;
// No budget in `plans/` covers connector routing yet (the S6 budget question is still open), so
// this limit only catches a routing pass that turns quadratic.
const ROUTING_LIMIT_MS = 3_000;
// A drag preview frame reroutes the few connectors on the moved Entry, so it costs far less.
const PREVIEW_FRAME_LIMIT_MS = 4;

const scale = createTimeScale({
  timeZone: 'UTC',
  range: { start: instant(0), end: instant(40 * MS_PER_BAR) },
  pxPerMs: 0.001,
});
const variants = createVariantRegistry({ fieldFor: () => undefined });
const entries = entryDoubles(
  Array.from({ length: ENTRY_COUNT }, (_unused, index) => ({
    id: `e${index}`,
    name: `E${index}`,
    start: (index % 30) * MS_PER_BAR,
    end: ((index % 30) + 1) * MS_PER_BAR,
  })),
);
const connectors: readonly ConnectorInput[] = Array.from({ length: ENTRY_COUNT }, (_unused, index) => ({
  id: `c${index}`,
  from: { entryId: entryId(`e${index}`), edge: index % 2 === 0 ? 'end' : 'start' },
  to: { entryId: entryId(`e${(index * 7 + 13) % ENTRY_COUNT}`), edge: index % 3 === 0 ? 'end' : 'start' },
}));

function inputOf(providers: readonly ConnectorProvider[], patch: Partial<LayoutInput>): LayoutInput {
  return {
    entries,
    scale,
    preset: dayPreset,
    visible: { x: 0, y: 0, width: 2000, height: 600 },
    rowHeight: 32,
    revision: 0,
    datasetRevision: 0,
    variants,
    connectorProviders: providers,
    ...patch,
  };
}

function frameOf(providers: readonly ConnectorProvider[], layout: FrameLayout, patch: Partial<LayoutInput>) {
  return layout.computeFrame(inputOf(providers, patch));
}

describe('connector routing cost', () => {
  it('routes 10 000 connectors over 10 000 Entries with bar avoidance on, inside the limit', () => {
    const provider = vi.fn<ConnectorProvider>(() => connectors);
    const layout = new FrameLayout();
    const started = performance.now();
    frameOf([provider], layout, { connectorRouting: { avoidBars: true } });
    const elapsed = performance.now() - started;
    console.info(`routed ${connectors.length} connectors, avoidance on: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(ROUTING_LIMIT_MS);
  });

  it('does not route again when an unchanged Dataset scrolls', () => {
    const provider = vi.fn<ConnectorProvider>(() => connectors);
    const providers = [provider];
    const layout = new FrameLayout();
    frameOf(providers, layout, {});
    const started = performance.now();
    frameOf(providers, layout, { revision: 1, visible: { x: 500, y: 3000, width: 2000, height: 600 } });
    const elapsed = performance.now() - started;
    console.info(`scroll frame with 10 000 connectors: ${elapsed.toFixed(0)} ms`);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(ROUTING_LIMIT_MS / 5);
  });

  it('paints a drag preview frame fast, whatever the connector count', () => {
    const chain: ConnectorInput[] = connectors.map((connector, index) => ({
      ...connector,
      from: { entryId: entryId(`e${index}`), edge: 'end' },
      to: { entryId: entryId(`e${(index + 1) % ENTRY_COUNT}`), edge: 'start' },
    }));
    // e0 now has 5 connectors: two from the chain and three more.
    const fanOut: ConnectorInput[] = [100, 200, 300].map((to) => ({
      id: `fan${to}`,
      from: { entryId: entryId('e0'), edge: 'end' },
      to: { entryId: entryId(`e${to}`), edge: 'start' },
    }));
    const providers = [() => [...chain, ...fanOut]];
    const layout = new FrameLayout();
    frameOf(providers, layout, {});
    const times: number[] = [];
    for (let frame = 0; frame < 21; frame += 1) {
      const preview: BarPreview = {
        entryId: entryId('e0'),
        barId: barId(entryId('e0')),
        dx: 40 + frame,
        dy: 0,
        dWidth: 0,
        extra: false,
      };
      const started = performance.now();
      layout.computeConnectors(inputOf(providers, { barPreviews: [preview] }));
      times.push(performance.now() - started);
    }
    const median = times.sort((a, b) => a - b)[10]!;
    console.info(
      `drag preview frame with ${chain.length + fanOut.length} connectors: ${median.toFixed(2)} ms`,
    );
    expect(median).toBeLessThan(PREVIEW_FRAME_LIMIT_MS);
  });
});
