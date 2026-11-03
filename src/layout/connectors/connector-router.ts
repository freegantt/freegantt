// layout/ — turns registered connector providers into the frame's connectors. It finds both end
// bars for any Entry (culled or not), routes the path once, and clips it to the window per frame.
// A scroll only filters and clips. Providers run again after a dataset change only.
// A drag preview routes again only the connectors with an end on a moved bar.

import type { Entry, EntryId } from '../../model/index.js';
import type { TimeScale } from '../../time/index.js';
import type { Bar } from '../bars/bar.js';
import type { ConnectorEnd, ConnectorFlags, ConnectorInput, ConnectorProvider } from '../connector-input.js';
import { CONNECTOR_FLAG_KEYS } from '../connector-input.js';
import type { BarPreview } from '../bar-preview.js';
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
  /** Where the bar shows while a drag preview moves it. `frame.ts` owns this rule too. */
  previewedBarBox: (bar: Bar, preview: BarPreview) => { x: number; width: number; dy: number };
  /** The drag in flight. Empty outside a drag, and the connectors keep their committed places. */
  previews: readonly BarPreview[];
  /** Changes when anything the box depends on changes (bar min width, bar height). */
  paintKey: string;
  window: ConnectorWindow;
}

/** The Entry a connector end sits on, and the row that Entry draws in. */
interface ResolvedEnd {
  entryId: EntryId;
  rowIndex: number;
}

interface RoutedConnector {
  input: ConnectorInput;
  flags: ConnectorFlags;
  flagTokens: string;
  /** The Entries whose bars the two ends sit on. A collapsed end names its nearest ancestor with a row. */
  endEntryIds: readonly [EntryId, EntryId];
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
  /** Bar avoidance of the committed routing. A drag preview reuses it, so a preview frame never
   *  reads the moved bars' places for avoidance. */
  #placeVertical: VerticalPlacer | undefined;
  #connectorsOfEntry = new Map<EntryId, RoutedConnector[]>();
  #plan: readonly PlannedRow[] | undefined;
  #rowIndexOfEntry = new Map<EntryId, number>();
  #framedFor: { routed: readonly RoutedConnector[]; window: string } | undefined;
  #framed: readonly FrameConnector[] = [];

  run(input: ConnectorRunInput): readonly FrameConnector[] {
    if (input.providers.length === 0) return [];
    const inputs = this.#providedInputs(input);
    const routed = this.#routedFor(input, inputs);
    const committed = this.#committedFramed(routed, input);
    return input.previews.length === 0 ? committed : this.#previewedFramed(committed, input);
  }

  #committedFramed(routed: readonly RoutedConnector[], input: ConnectorRunInput): readonly FrameConnector[] {
    const windowKey = `${input.window.left}|${input.window.right}|${input.window.top}|${input.window.bottom}`;
    if (this.#framedFor?.routed === routed && this.#framedFor.window === windowKey) return this.#framed;
    this.#framed = routed
      .filter((connector) => boundsTouchWindow(connector.bounds, input.window))
      .map((connector) => this.#frameConnector(connector, input.window))
      .filter((connector) => connector.path.length > 0);
    this.#framedFor = { routed, window: windowKey };
    return this.#framed;
  }

  /** The committed frame connectors, except those with an end on a moved bar. Those route again to the
   *  previewed places. An unmoved connector keeps its object, so the paint finds it unchanged. */
  #previewedFramed(
    committed: readonly FrameConnector[],
    input: ConnectorRunInput,
  ): readonly FrameConnector[] {
    const previewOfEntry = new Map<EntryId, BarPreview>();
    for (const preview of input.previews) previewOfEntry.set(preview.entryId, preview);
    const moved = new Map<string, RoutedConnector>();
    for (const entryId of previewOfEntry.keys()) {
      for (const connector of this.#connectorsOfEntry.get(entryId) ?? [])
        moved.set(connector.input.id, connector);
    }
    if (moved.size === 0) return committed;
    const replacements = new Map<string, FrameConnector | undefined>();
    for (const connector of moved.values()) {
      const route = this.#route(connector.input, input, this.#placeVertical, previewOfEntry);
      const framed =
        route !== undefined && boundsTouchWindow(route.bounds, input.window)
          ? this.#frameConnector(route, input.window)
          : undefined;
      replacements.set(
        connector.input.id,
        framed !== undefined && framed.path.length > 0 ? framed : undefined,
      );
    }
    const result: FrameConnector[] = [];
    for (const connector of committed) {
      if (!replacements.has(connector.id)) result.push(connector);
      else {
        const replacement = replacements.get(connector.id);
        if (replacement !== undefined) result.push(replacement);
        replacements.delete(connector.id);
      }
    }
    for (const replacement of replacements.values()) if (replacement !== undefined) result.push(replacement);
    return result;
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
    this.#placeVertical = routing.avoidBars ? this.#barIndexFor(input, routing.maxAvoidRows) : undefined;
    this.#routed = inputs.flatMap((connector) => {
      const routed = this.#route(connector, input, this.#placeVertical);
      return routed === undefined ? [] : [routed];
    });
    this.#indexConnectorsByEntry();
    return this.#routed;
  }

  #indexConnectorsByEntry(): void {
    this.#connectorsOfEntry.clear();
    for (const connector of this.#routed) {
      for (const entryId of new Set(connector.endEntryIds)) {
        const list = this.#connectorsOfEntry.get(entryId);
        if (list === undefined) this.#connectorsOfEntry.set(entryId, [connector]);
        else list.push(connector);
      }
    }
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
    previewOfEntry?: ReadonlyMap<EntryId, BarPreview>,
  ): RoutedConnector | undefined {
    const fromEnd = this.#resolveEnd(connector.from, input);
    const toEnd = this.#resolveEnd(connector.to, input);
    if (fromEnd === undefined || toEnd === undefined) return undefined;
    const from = this.#anchorOn(connector.from, fromEnd, input, previewOfEntry?.get(fromEnd.entryId));
    const to = this.#anchorOn(connector.to, toEnd, input, previewOfEntry?.get(toEnd.entryId));
    if (from === undefined || to === undefined) return undefined;
    const points = routeConnector(from, to, placeVertical);
    const flags = trueFlagsOf(connector.flags);
    const labelAnchor = connector.showLabel === true && connector.label ? midpointOf(points) : undefined;
    return {
      input: connector,
      flags,
      flagTokens: flagTokensOf(flags),
      endEntryIds: [fromEnd.entryId, toEnd.entryId],
      points,
      bounds: boundsOf(points),
      ...(labelAnchor !== undefined ? { labelAnchor } : {}),
    };
  }

  /** An end in a collapsed group attaches to its nearest ancestor with a row.
   *  An unknown Entry has no end, so the connector draws nothing. */
  #resolveEnd(end: ConnectorEnd, input: ConnectorRunInput): ResolvedEnd | undefined {
    let entry: Entry | undefined = input.memory.entryById.get(end.entryId);
    while (entry !== undefined) {
      const rowIndex = this.#rowIndexOfEntry.get(entry.id);
      if (rowIndex !== undefined) return { entryId: entry.id, rowIndex };
      entry = entry.parent();
    }
    return undefined;
  }

  /** The end's own bar edge, at the place the drag preview gives it, else the committed place. */
  #anchorOn(
    end: ConnectorEnd,
    resolved: ResolvedEnd,
    input: ConnectorRunInput,
    preview: BarPreview | undefined,
  ): ConnectorAnchor | undefined {
    const { memory, plan } = input;
    const bar = firstBarOf(resolved.entryId, memory.rowMemory(plan[resolved.rowIndex]!.id).bars);
    if (bar === undefined) return undefined;
    const { x, width, dy } =
      preview === undefined ? { ...input.barBox(bar), dy: 0 } : input.previewedBarBox(bar, preview);
    if (width <= 0) return undefined;
    const committedTop = memory.heights.topAt(resolved.rowIndex);
    const y = committedTop + input.rowHeight / 2 + dy;
    const rowIndex = dy === 0 ? resolved.rowIndex : rowIndexAt(y, input);
    const rowTop = memory.heights.topAt(rowIndex);
    return {
      x: end.edge === 'start' ? x : x + width,
      y,
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

/** The row a previewed bar's centre lies in, kept inside the plan. */
function rowIndexAt(y: number, input: ConnectorRunInput): number {
  return Math.min(Math.max(input.memory.heights.indexAtY(y), 0), input.plan.length - 1);
}

/** One Entry draws one Bar on a segmented row too. A producer that draws several gives its first. */
function firstBarOf(entryId: EntryId, bars: readonly Bar[]): Bar | undefined {
  return bars.find((bar) => bar.entryId === entryId);
}
