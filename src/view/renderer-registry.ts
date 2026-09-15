// view/ — resolves which renderer paints one bar/cell/header/tooltip (S5.4, D-S5-11/12). Holds only
// plugin registrations; a consumer's own `GanttOptions.*Renderer` is read live by `GanttShell` and
// handed in on every `resolve*` call — config always wins over a plugin (D-S5-11), so this registry
// never has to know the consumer's current value ahead of time, the same posture `CommandRegistry`
// takes toward its own live `buildContext`.

import { RendererAlreadyRegisteredError } from '../model/index.js';
import type { Disposer, PluginId } from '../model/index.js';
import { createRegistrationTable } from '../layout/registration-table.js';
import type {
  BarRenderer,
  GridCellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererPoint,
  RendererFor,
  ResolvedRenderer,
} from '../layout/index.js';

type AnyRenderer = BarRenderer | GridCellRenderer | HeaderRenderer | TooltipRenderer;

interface Registration {
  renderer: AnyRenderer;
  pluginId: PluginId;
}

/** Built once per `GanttShell` (or per test), the same lifetime `CommandRegistry` has. */
export class RendererRegistry {
  /** The shared registration table (#154, #155), keyed by point. A point holds at most one live
   *  registration — `register` refuses a second — so the stack is never deeper than one. It is still
   *  the right home: the table is what makes a registration removable by identity, which is the
   *  whole of #155's fix. */
  #registrations = createRegistrationTable<RendererPoint, Registration>();

  /** `ctx.view.registerRenderer(point, renderer)`. One slot per point (D-S5-11). A second plugin
   *  claiming a point already taken throws, naming the point and both plugin ids. The returned
   *  `Disposer` frees the slot: a plugin's registration lives exactly as long as the plugin does, so
   *  uninstalling and re-installing the same plugin is a legal sequence, not a collision with its
   *  own dead registration (#155).
   *
   *  ADR 0018: the `bar` point held one slot **per variant name** until this build, so two plugins
   *  that each defined a variant both installed here. They install through `ctx.variants.add` now,
   *  and each variant carries its own `paint`. So `bar` is an ordinary point again. */
  register<P extends RendererPoint>(point: P, renderer: RendererFor<P>, pluginId: PluginId): Disposer {
    return this.#claim(point, renderer, pluginId);
  }

  /** D-S5-11: the consumer's own renderer always wins over a plugin's; with neither, "nothing" (the
   *  caller's own default). Call: `registry.resolve('gridCell', gantt.gridCellRenderer)`. */
  resolve<P extends RendererPoint>(
    point: P,
    consumerRenderer: RendererFor<P> | undefined,
  ): ResolvedRenderer<RendererFor<P>> | undefined {
    if (consumerRenderer !== undefined) return { renderer: consumerRenderer };
    const registration = this.#registrations.get(point);
    if (registration === undefined) return undefined;
    return { renderer: registration.renderer as RendererFor<P>, pluginId: registration.pluginId };
  }

  #claim(point: RendererPoint, renderer: AnyRenderer, pluginId: PluginId): Disposer {
    const existing = this.#registrations.get(point);
    if (existing !== undefined) {
      throw new RendererAlreadyRegisteredError(point, existing.pluginId, pluginId);
    }
    return this.#registrations.register(point, { renderer, pluginId });
  }
}
