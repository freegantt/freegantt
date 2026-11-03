// layout/ — turns registered connector providers into the frame's connectors. It finds both end
// bars for any Entry (culled or not), routes the path once, and clips it to the window per frame.
// A scroll only filters and clips. Providers run again after a dataset change only.

import type { Entry, EntryId } from '../../model/index.js';
import type { TimeScale } from '../../time/index.js';
import type { Bar } from '../bars/bar.js';
import type { ConnectorEnd, ConnectorFlags, ConnectorInput, ConnectorProvider } from '../connector-input.js';
import { CONNECTOR_FLAG_KEYS } from '../connector-input.js';
import type { FrameMemory } from '../frame-memory.js';
import type { PlannedRow } from '../rows/row-source.js';
import type { FrameConnector } from './frame-connector.js';
import { boundsOf, boundsTouchWindow, clipPath } from './clip-path.js';
import type { ConnectorWindow } from './clip-path.js';
import { BarIndex } from './bar-index.js';
import type { VerticalPlacer } from './bar-index.js';
import { resolveConnectorRouting } from './connector-routing.js';
import type { ConnectorRouting } from './connector-routing.js';
import { midpointOf, routeConnector } from './route-connector.js';
import type { ConnectorAnchor, Point } from './route-connector.js';

export interface ConnectorRunInput {
  providers: readonly ConnectorProvider[];
  /** Omitted → avoid bars, capped at the default row count. */
  routing?: ConnectorRouting | undefined;
  datasetRevision: number;
  plan: readonly PlannedRow[];
  memory: FrameMemory;
  scale: TimeScale;
  rowHeight: number;
  /** The bar's painted box. `frame.ts` owns the rule, so the router asks instead of copying it. */
  barBox: (bar: Bar) => { x: number; width: number };
  /** Changes when anything the box depends on changes (bar min width, bar height). */
  paintKey: string;
  window: ConnectorWindow;
}

interface RoutedConnector {
  input: ConnectorInput;
  flags: ConnectorFlags;
  flagTokens: string;
  points: readonly Point[];
  bounds: ConnectorWindow;
  labelAnchor?: Point;
}

/** Call: `mergeSameId(inputs)`. The first provider owns an id. A later one can only add `true` flags. */
export function mergeSameId(inputs: readonly ConnectorInput[]): ConnectorInput[] {
  const byId = new Map<string, ConnectorInput>();
  for (const input of inputs) {
    const owner = byId.get(input.id);
    if (owner === undefined) {
      byId.set(input.id, input);
      continue;
    }
    const added = trueFlagsOf(input.flags);
    if (Object.keys(added).length === 0) continue;
    byId.set(input.id, { ...owner, flags: { ...owner.flags, ...added } });
  }
  return [...byId.values()];
}

function trueFlagsOf(flags: ConnectorFlags | undefined): ConnectorFlags {
  const added: ConnectorFlags = {};
  for (const key of CONNECTOR_FLAG_KEYS) if (flags?.[key] === true) added[key] = true;
  return added;
}

function flagTokensOf(flags: ConnectorFlags): string {
  return CONNECTOR_FLAG_KEYS.filter((key) => flags[key]).join(' ');
}

/** One instance per Gantt (I2), held beside its `FrameLayout`. */
export class ConnectorRouter {
  #inputsKey: { providers: readonly ConnectorProvider[]; revision: number } | undefined;
  #inputs: readonly ConnectorInput[] = [];
  #routedKey: string | undefined;
  #routedInputs: readonly ConnectorInput[] | undefined;
  #routed: readonly RoutedConnector[] = [];
  #plan: readonly PlannedRow[] | undefined;
  #rowIndexOfEntry = new Map<EntryId, number>();
  #framedFor: { routed: readonly RoutedConnector[]; window: string } | undefined;
  #framed: readonly FrameConnector[] = [];

  run(input: ConnectorRunInput): readonly FrameConnector[] {
    if (input.providers.length === 0) return [];
    const inputs = this.#providedInputs(input);
    const routed = this.#routedFor(input, inputs);
    const windowKey = `${input.window.left}|${input.window.right}|${input.window.top}|${input.window.bottom}`;
    if (this.#framedFor?.routed === routed && this.#framedFor.window === windowKey) return this.#framed;
    this.#framed = routed
      .filter((connector) => boundsTouchWindow(connector.bounds, input.window))
      .map((connector) => this.#frameConnector(connector, input.window))
      .filter((connector) => connector.path.length > 0);
    this.#framedFor = { routed, window: windowKey };
    return this.#framed;
  }

  #providedInputs(input: ConnectorRunInput): readonly ConnectorInput[] {
    const key = this.#inputsKey;
    if (key?.providers === input.providers && key.revision === input.datasetRevision) return this.#inputs;
    this.#inputsKey = { providers: input.providers, revision: input.datasetRevision };
    this.#inputs = mergeSameId(input.providers.flatMap((provider) => provider()));
    return this.#inputs;
  }

  #routedFor(input: ConnectorRunInput, inputs: readonly ConnectorInput[]): readonly RoutedConnector[] {
    const { scale } = input;
    const routing = resolveConnectorRouting(input.routing);
    const content = scale.spanForPixels({ x: 0, width: scale.contentWidth });
    const key = [
      input.datasetRevision,
      input.memory.producedRevision,
      input.rowHeight,
      input.paintKey,
      content.start,
      content.end,
      scale.contentWidth,
      scale.timeZone,
      routing.avoidBars,
      routing.maxAvoidRows,
    ].join('|');
    if (this.#routedInputs === inputs && this.#routedKey === key && this.#plan === input.plan) {
      return this.#routed;
    }
    this.#indexRows(input.plan);
    this.#routedKey = key;
    this.#routedInputs = inputs;
    const placeVertical = routing.avoidBars ? this.#barIndexFor(input, routing.maxAvoidRows) : undefined;
    this.#routed = inputs.flatMap((connector) => {
      const routed = this.#route(connector, input, placeVertical);
      return routed === undefined ? [] : [routed];
    });
    return this.#routed;
  }

  #indexRows(plan: readonly PlannedRow[]): void {
    if (this.#plan === plan) return;
    this.#plan = plan;
    this.#rowIndexOfEntry.clear();
    plan.forEach((row, index) => {
      for (const id of row.entryIds) if (!this.#rowIndexOfEntry.has(id)) this.#rowIndexOfEntry.set(id, index);
    });
  }

  /** One index per routing pass, so a row reads its bars once however many verticals cross it. */
  #barIndexFor(input: ConnectorRunInput, maxRows: number): VerticalPlacer {
    const index = new BarIndex((rowIndex) => {
      const row = input.plan[rowIndex];
      if (row === undefined) return [];
      return input.memory.rowMemory(row.id).bars.map((bar) => {
        const { x, width } = input.barBox(bar);
        return { left: x, right: x + width };
      });
    }, maxRows);
    return (request) => index.freeX(request);
  }

  #route(
    connector: ConnectorInput,
    input: ConnectorRunInput,
    placeVertical: VerticalPlacer | undefined,
  ): RoutedConnector | undefined {
    const from = this.#anchorOf(connector.from, input);
    const to = this.#anchorOf(connector.to, input);
    if (from === undefined || to === undefined) return undefined;
    const points = routeConnector(from, to, placeVertical);
    const flags = trueFlagsOf(connector.flags);
    const labelAnchor = connector.showLabel === true && connector.label ? midpointOf(points) : undefined;
    return {
      input: connector,
      flags,
      flagTokens: flagTokensOf(flags),
      points,
      bounds: boundsOf(points),
      ...(labelAnchor !== undefined ? { labelAnchor } : {}),
    };
  }

  /** The end's own bar edge. An end in a collapsed group attaches to its nearest ancestor with a row.
   *  An unknown Entry has no anchor, so the connector draws nothing. */
  #anchorOf(end: ConnectorEnd, input: ConnectorRunInput): ConnectorAnchor | undefined {
    const { memory } = input;
    let entry: Entry | undefined = memory.entryById.get(end.entryId);
    while (entry !== undefined) {
      const rowIndex = this.#rowIndexOfEntry.get(entry.id);
      if (rowIndex !== undefined) return this.#anchorOnRow(end, entry.id, rowIndex, input);
      entry = entry.parent();
    }
    return undefined;
  }

  #anchorOnRow(
    end: ConnectorEnd,
    entryId: EntryId,
    rowIndex: number,
    input: ConnectorRunInput,
  ): ConnectorAnchor | undefined {
    const { memory, plan } = input;
    const bar = firstBarOf(entryId, memory.rowMemory(plan[rowIndex]!.id).bars);
    if (bar === undefined) return undefined;
    const { x, width } = input.barBox(bar);
    if (width <= 0) return undefined;
    const rowTop = memory.heights.topAt(rowIndex);
    return {
      x: end.edge === 'start' ? x : x + width,
      y: rowTop + input.rowHeight / 2,
      edge: end.edge,
      rowIndex,
      rowTop,
      rowBottom: rowTop + memory.heights.heightAt(rowIndex),
    };
  }

  #frameConnector(connector: RoutedConnector, window: ConnectorWindow): FrameConnector {
    const { input } = connector;
    return {
      id: input.id,
      path: clipPath(connector.points, window),
      flags: connector.flags,
      flagTokens: connector.flagTokens,
      ...(input.class !== undefined ? { class: input.class } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(connector.labelAnchor !== undefined ? { labelAnchor: connector.labelAnchor } : {}),
    };
  }
}

/** One Entry draws one Bar on a segmented row too. A producer that draws several gives its first. */
function firstBarOf(entryId: EntryId, bars: readonly Bar[]): Bar | undefined {
  return bars.find((bar) => bar.entryId === entryId);
}
