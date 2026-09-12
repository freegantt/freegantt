// view/ — resolves which renderer paints one bar/cell/header/tooltip (S5.4, D-S5-11/12). Holds only
// plugin registrations; a consumer's own `GanttOptions.*Renderer` is read live by `GanttShell` and
// handed in on every `resolve*` call — config always wins over a plugin (D-S5-11), so this registry
// never has to know the consumer's current value ahead of time, the same posture `CommandRegistry`
// takes toward its own live `buildContext`.

import { RendererAlreadyRegisteredError } from '../model/index.js';
import type { Disposer, PluginId } from '../model/index.js';
import { createRegistrationTable } from '../layout/registration-table.js';
import { DisposableStore } from '../extensions/disposables.js';
import type {
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererByLook,
  RendererPoint,
  RendererFor,
  ResolvedRenderer,
} from '../layout/index.js';

type AnyRenderer = BarRenderer | CellRenderer | HeaderRenderer | TooltipRenderer;

/** Every point but `bar`. A cell belongs to a column and a header to a band, so neither has a kind
 *  to key on: one plugin claims the whole point. `bar` is the exception, and `resolveBar` is its
 *  own method because it resolves the kind as well (review P6). */
type UnkeyedRendererPoint = Exclude<RendererPoint, 'bar'>;

/** What one registration claims. A `bar` per-kind map (D-S5-12) claims one slot per kind, so two
 *  plugins that each define their own kind both install (review P2). Every other form claims its
 *  whole point. */
type RendererSlot = RendererPoint | `bar:${string}`;

function barSlot(kind: string): RendererSlot {
  return `bar:${kind}`;
}

function isBarSlot(slot: RendererSlot): boolean {
  return slot === 'bar' || slot.startsWith('bar:');
}

function pickByKind(map: RendererByLook, kind: string): BarRenderer | undefined {
  return map[kind] ?? map['*'];
}

/** D-S5-12: a function is the single-renderer form; a record is the per-kind form — resolves the
 *  exact kind, then `'*'`, then "nothing" (the caller's own default). */
function forKind(renderer: BarRenderer | RendererByLook, kind: string): BarRenderer | undefined {
  return typeof renderer === 'function' ? renderer : pickByKind(renderer, kind);
}

interface Registration {
  renderer: AnyRenderer;
  pluginId: PluginId;
}

/** Built once per `GanttShell` (or per test), the same lifetime `CommandRegistry` has. */
export class RendererRegistry {
  /** The shared registration table (#154, #155), keyed by slot. A slot holds at most one live
   *  registration — `register` refuses a second — so the stack is never deeper than one. It is still
   *  the right home: the table is what makes a registration removable by identity, which is the
   *  whole of #155's fix. */
  #registrations = createRegistrationTable<RendererSlot, Registration>();

  /** `ctx.view.registerRenderer(point, renderer)`. One slot per point (D-S5-11), except the `bar`
   *  point's per-kind map, which claims one slot per kind (D-S5-12, review P2) — two plugins that
   *  each define their own kind are not in conflict, so both install. A second plugin claiming a
   *  slot already taken throws, naming the slot and both plugin ids. The returned `Disposer` frees
   *  every slot this call claimed: a plugin's registration lives exactly as long as the plugin does,
   *  so uninstalling and re-installing the same plugin is a legal sequence, not a collision with its
   *  own dead registration (#155). */
  register<P extends RendererPoint>(point: P, renderer: RendererFor<P>, pluginId: PluginId): Disposer {
    // The two forms D-S5-12 names are told apart here, once, rather than at every use below.
    // `RendererFor<P>` gives the map form to the `bar` point alone, so a non-function is one.
    const claimed: AnyRenderer | RendererByLook = renderer;
    if (typeof claimed !== 'function') return this.#registerBarKinds(claimed, pluginId);
    if (point === 'bar') this.#refuseEveryBarSlot(pluginId);
    return this.#claim(point, claimed, pluginId);
  }

  /** D-S5-11: the consumer's own renderer always wins over a plugin's; with neither, "nothing" (the
   *  caller's own default). Call: `registry.resolve('cell', gantt.cellRenderer)`. `bar` has its own
   *  `resolveBar`, which resolves the kind too. */
  resolve<P extends UnkeyedRendererPoint>(
    point: P,
    consumerRenderer: RendererFor<P> | undefined,
  ): ResolvedRenderer<RendererFor<P>> | undefined {
    if (consumerRenderer !== undefined) return { renderer: consumerRenderer };
    const registration = this.#registrations.get(point);
    if (registration === undefined) return undefined;
    return { renderer: registration.renderer as RendererFor<P>, pluginId: registration.pluginId };
  }

  /** D-S5-11 picks whichever side wins; D-S5-12 then resolves that side's per-kind form against
   *  `kind` — a consumer map that misses `kind` (and has no `'*'`) resolves to nothing, never falling
   *  through to a plugin. The caller only ever sees one already-resolved `BarRenderer` function, or
   *  nothing. */
  resolveBar(
    kind: string,
    consumerRenderer: BarRenderer | RendererByLook | undefined,
  ): ResolvedRenderer<BarRenderer> | undefined {
    if (consumerRenderer !== undefined) {
      const renderer = forKind(consumerRenderer, kind);
      return renderer === undefined ? undefined : { renderer };
    }
    const registration = this.#barRegistrationFor(kind);
    if (registration === undefined) return undefined;
    return { renderer: registration.renderer as BarRenderer, pluginId: registration.pluginId };
  }

  /** The plugin side of D-S5-12, over the slots `register` split the two forms into: the exact kind
   *  first, then `'*'`, then a whole-point claim. */
  #barRegistrationFor(kind: string): Registration | undefined {
    return (
      this.#registrations.get(barSlot(kind)) ??
      this.#registrations.get(barSlot('*')) ??
      this.#registrations.get('bar')
    );
  }

  /** The per-kind form (D-S5-12). Every kind is checked before the first one registers, so a refusal
   *  leaves nothing half-registered. A whole-point `bar` claim already paints every kind, so it
   *  refuses this one too. */
  #registerBarKinds(byKind: RendererByLook, pluginId: PluginId): Disposer {
    const claims = Object.entries(byKind).map(([kind, renderer]) => [barSlot(kind), renderer] as const);
    this.#refuseIfTaken('bar', pluginId);
    for (const [slot] of claims) this.#refuseIfTaken(slot, pluginId);
    // One `Disposer` frees every slot this one call claimed. `DisposableStore` is the reverse-order,
    // latching version of the forward loop that stood here (#174). The loop ran a second time on a
    // second call, and it relied on each slot release being idempotent on its own.
    const claimed = new DisposableStore();
    for (const [slot, renderer] of claims) {
      claimed.add(this.#registrations.register(slot, { renderer, pluginId }));
    }
    return () => claimed.disposeAll();
  }

  /** A whole-point `bar` function answers every kind, so it collides with any per-kind slot a plugin
   *  already holds — the whole-point claim stays the exclusive one it has always been. */
  #refuseEveryBarSlot(pluginId: PluginId): void {
    for (const slot of this.#registrations.keys()) {
      if (isBarSlot(slot)) this.#refuseIfTaken(slot, pluginId);
    }
  }

  #claim(slot: RendererSlot, renderer: AnyRenderer, pluginId: PluginId): Disposer {
    this.#refuseIfTaken(slot, pluginId);
    return this.#registrations.register(slot, { renderer, pluginId });
  }

  #refuseIfTaken(slot: RendererSlot, pluginId: PluginId): void {
    const existing = this.#registrations.get(slot);
    if (existing !== undefined) {
      throw new RendererAlreadyRegisteredError(slot, existing.pluginId, pluginId);
    }
  }
}
