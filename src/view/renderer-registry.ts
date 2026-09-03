// view/ — resolves which renderer paints one bar/cell/header/tooltip (S5.4, D-S5-11/12). Holds only
// plugin registrations; a consumer's own `GanttOptions.*Renderer` is read live by `GanttShell` and
// handed in on every `resolve*` call — config always wins over a plugin (D-S5-11), so this registry
// never has to know the consumer's current value ahead of time, the same posture `CommandRegistry`
// takes toward its own live `buildContext`.

import { RendererAlreadyRegisteredError } from '../model/index.js';
import type { PluginId } from '../model/index.js';
import type {
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererByKind,
  RendererPoint,
  RendererFor,
  ResolvedRenderer,
} from '../layout/index.js';

type AnyRenderer = BarRenderer | RendererByKind | CellRenderer | HeaderRenderer | TooltipRenderer;

function pickByKind(map: RendererByKind, kind: string): BarRenderer | undefined {
  return map[kind] ?? map['*'];
}

/** D-S5-12: a function is the single-renderer form; a record is the per-kind form — resolves the
 *  exact kind, then `'*'`, then "nothing" (the caller's own default). */
function forKind(renderer: BarRenderer | RendererByKind, kind: string): BarRenderer | undefined {
  return typeof renderer === 'function' ? renderer : pickByKind(renderer, kind);
}

/** Built once per `GanttShell` (or per test), the same lifetime `CommandRegistry` has. */
export class RendererRegistry {
  #renderers = new Map<RendererPoint, AnyRenderer>();
  #owners = new Map<RendererPoint, PluginId>();

  /** `ctx.view.registerRenderer(point, renderer)`. One slot per point (D-S5-11) — a second plugin
   *  claiming a point already taken throws, naming both plugin ids. */
  register<P extends RendererPoint>(point: P, renderer: RendererFor<P>, pluginId: PluginId): void {
    const existing = this.#owners.get(point);
    if (existing !== undefined) throw new RendererAlreadyRegisteredError(point, existing, pluginId);
    this.#renderers.set(point, renderer);
    this.#owners.set(point, pluginId);
  }

  #resolve<TRenderer>(
    point: RendererPoint,
    consumerRenderer: TRenderer | undefined,
  ): ResolvedRenderer<TRenderer> | undefined {
    if (consumerRenderer !== undefined) return { renderer: consumerRenderer };
    const plugin = this.#renderers.get(point) as TRenderer | undefined;
    const pluginId = this.#owners.get(point);
    if (plugin === undefined || pluginId === undefined) return undefined;
    return { renderer: plugin, pluginId };
  }

  /** D-S5-11: the consumer's own `barRenderer` always wins over a plugin's. D-S5-12: whichever side
   *  supplies the renderer, its per-kind map (if it is one) resolves against `kind` right here — the
   *  caller only ever sees one already-resolved `BarRenderer` function, or nothing. */
  resolveBar(
    kind: string,
    consumerRenderer: BarRenderer | RendererByKind | undefined,
  ): ResolvedRenderer<BarRenderer> | undefined {
    if (consumerRenderer !== undefined) {
      const renderer = forKind(consumerRenderer, kind);
      if (renderer !== undefined) return { renderer };
    }
    const plugin = this.#renderers.get('bar') as BarRenderer | RendererByKind | undefined;
    const pluginId = this.#owners.get('bar');
    if (plugin === undefined || pluginId === undefined) return undefined;
    const renderer = forKind(plugin, kind);
    return renderer === undefined ? undefined : { renderer, pluginId };
  }

  resolveCell(consumerRenderer: CellRenderer | undefined): ResolvedRenderer<CellRenderer> | undefined {
    return this.#resolve('cell', consumerRenderer);
  }

  resolveHeader(consumerRenderer: HeaderRenderer | undefined): ResolvedRenderer<HeaderRenderer> | undefined {
    return this.#resolve('header', consumerRenderer);
  }

  resolveTooltip(
    consumerRenderer: TooltipRenderer | undefined,
  ): ResolvedRenderer<TooltipRenderer> | undefined {
    return this.#resolve('tooltip', consumerRenderer);
  }
}
