// view/ — the five seams a plugin registers into, in one place, each with the refresh it owes
// (#170). Five things share one lifetime: a renderer, a decoration provider, an Item producer, a
// per-kind capability default and a Grid column. Register one, and the Gantt shows it. Dispose one,
// and the Gantt shows what wins next (#155). What differs is which pass has to run again. That is
// the one thing a reader used to have to reassemble from three files.
//
// Before this module, `buildPluginPorts` decided that one layer away from the registration. The
// decoration seam open-coded its own lifetime too, with an array plus `indexOf`/`splice`. That is
// the exact job `createRegistrationTable` already does precisely (#154).
//
// A sixth seam is a method here, beside the five. It is not a fourth mechanism.

import { createRegistrationTable } from '../layout/registration-table.js';
import type {
  DecorationLayer,
  DecorationProvider,
  ItemProducer,
  ItemProducerRegistry,
  RegisteredDecorationProvider,
  RendererFor,
  RendererPoint,
} from '../layout/index.js';
import type { Disposer, EntryKind, GridColumnInput, PluginId } from '../model/index.js';
import { RendererRegistry } from './renderer-registry.js';
import type { KindDefaults } from './capability.js';

/** What these registrations borrow from `GanttShell` to make a registration visible. Each one is a
 *  pass that has to run again, never a registry: the tables themselves live here. */
export interface PluginRegistrationPorts {
  /** Queues one frame (B10, D-S2-15). */
  requestFrame(): void;
  /** Drops the per-row Item cache, so every row produces its Items again on the next render. */
  invalidateItems(): void;
  /** Re-resolves every entry's capabilities, and re-derives the affordances off the current hover. */
  refreshCapabilities(): void;
  /** `ColumnChrome.registerPluginColumn`. The one seam that keeps its own refresh — see
   *  `registerGridColumn` below for why it cannot move here. */
  registerGridColumn(column: GridColumnInput, pluginId: PluginId): Disposer;
}

/** What a plugin may register — the narrow face of `PluginRegistrations` below, and all
 *  `buildPluginPorts` ever needs. Two callers, two surfaces (`plans/02`). The shell holds the whole
 *  object, because it also reads the tables back. A plugin seam only ever writes into them. */
export interface PluginRegistrar {
  registerRenderer<P extends RendererPoint>(point: P, renderer: RendererFor<P>, pluginId: PluginId): Disposer;
  registerDecoration(layer: DecorationLayer, provider: DecorationProvider): Disposer;
  registerItemProducer(kind: EntryKind, producer: ItemProducer): Disposer;
  registerKindDefaults(kind: EntryKind, defaults: KindDefaults): Disposer;
  registerGridColumn(column: GridColumnInput, pluginId: PluginId): Disposer;
}

/** One instance per Gantt (I2), owned by `GanttShell`. Never a module-level singleton. */
export class PluginRegistrations implements PluginRegistrar {
  #ports: PluginRegistrationPorts;

  /** S5.4, D-S5-11/12: which renderer paints a bar, cell, header or tooltip. Its own module: the
   *  claim rules (per-kind slots, whole-point refusal) are that file's subject, not this one's. */
  readonly renderers = new RendererRegistry();

  /** D-S4-24: one registry per Gantt, seeded with span/group/milestone. `LayoutInput` carries the
   *  object itself, so this exposes the registry rather than a copy of its contents. */
  readonly itemProducers: ItemProducerRegistry;

  /** S5.9, D-S5-22: the middle precedence layer `resolveCapabilities` reads, between the consumer's
   *  own `interactions` and the library table. Newest registration on a kind wins. */
  #kindDefaults = createRegistrationTable<EntryKind, KindDefaults>();

  /** S5.6, D-S5-15: every registered provider, in registration order, threaded into
   *  `LayoutInput.decorationProviders`.
   *
   *  Decorations are the one seam where every registration paints, not only the newest. So each call
   *  takes a key of its own. The table then holds them all, in registration order, and a disposer
   *  still removes exactly its own (#154). The hand-written `indexOf`/`splice` this replaces got
   *  that right, and had to be read to prove it. */
  #decorations = createRegistrationTable<number, RegisteredDecorationProvider>();
  #nextDecorationKey = 0;

  /** The list `decorationProviders()` hands out, held between registration changes (#188). Every
   *  frame reads that list, and frames fire on scroll, so the hot path must allocate nothing
   *  (`plans/01` §8). `registerDecoration` is the only writer, and it drops this on both edges. */
  #activeDecorations: readonly RegisteredDecorationProvider[] | undefined;

  constructor(ports: PluginRegistrationPorts, itemProducers: ItemProducerRegistry) {
    this.#ports = ports;
    this.itemProducers = itemProducers;
  }

  /** S5.4, D-S5-11. A renderer claim changes what every painted bar, cell or header shows, and
   *  nothing else marks the frame dirty for it. The registration that wins after disposal must paint
   *  too, so the repaint runs on both edges (#155). */
  registerRenderer<P extends RendererPoint>(
    point: P,
    renderer: RendererFor<P>,
    pluginId: PluginId,
  ): Disposer {
    return this.#withRepaint(() => this.renderers.register(point, renderer, pluginId));
  }

  /** S5.6, D-S5-15. Same repaint, same both-edges reason as a renderer claim. The held provider
   *  list goes with that repaint: the two edges that change what paints are the two that make it
   *  stale (#188). */
  registerDecoration(layer: DecorationLayer, provider: DecorationProvider): Disposer {
    const key = this.#nextDecorationKey++;
    return this.#onBothEdges(
      () => this.#decorations.register(key, { layer, provider }),
      () => {
        this.#activeDecorations = undefined;
        this.#ports.requestFrame();
      },
    );
  }

  /** D-S5-22. `FrameLayout`'s per-row Item cache forgets a row on a dataset, row-count or metrics
   *  change only. A producer registration is none of those, so every row produces its Items again. */
  registerItemProducer(kind: EntryKind, producer: ItemProducer): Disposer {
    return this.#onBothEdges(
      () => this.itemProducers.register(kind, producer),
      () => {
        this.#ports.invalidateItems();
        this.#ports.requestFrame();
      },
    );
  }

  /** S5.9, D-S5-22. A changed default changes what every gesture is allowed to do, so the capability
   *  table re-resolves rather than the frame repainting. */
  registerKindDefaults(kind: EntryKind, defaults: KindDefaults): Disposer {
    return this.#onBothEdges(
      () => this.#kindDefaults.register(kind, defaults),
      () => this.#ports.refreshCapabilities(),
    );
  }

  /** S5.9, D-S5-21. The one seam whose refresh stays with its own module. `ColumnChrome` strips the
   *  baked-in copy of an abandoned field *between* removing the registration and rebinding, so the
   *  two cannot be pulled apart (D-S5-18, #155). This entry is here so a reader finds all five
   *  seams in one list, not so the refresh moves.
   *
   *  `pluginId` travels with the column, for the reason `registerRenderer` already takes one. A
   *  declaration must say who made it. Without that, the library cannot keep a plugin's column out
   *  of what the consumer authored and saves (D-S5-33). A `PluginStore` carries its owner's id for
   *  the same reason (D-S5-24). */
  registerGridColumn(column: GridColumnInput, pluginId: PluginId): Disposer {
    return this.#ports.registerGridColumn(column, pluginId);
  }

  /** The winning `KindDefaults` for a kind, or `undefined`. `resolveCapabilities`' third argument. */
  kindDefaultsFor(kind: EntryKind): KindDefaults | undefined {
    return this.#kindDefaults.get(kind);
  }

  /** Every live provider, in registration order — `LayoutInput.decorationProviders`. One walk of the
   *  table per registration change, not one per frame (#188). The caller reads the list and never
   *  writes it, which is why one instance may serve every frame between two changes. */
  decorationProviders(): readonly RegisteredDecorationProvider[] {
    this.#activeDecorations ??= this.#decorations.active();
    return this.#activeDecorations;
  }

  #withRepaint(register: () => Disposer): Disposer {
    return this.#onBothEdges(register, () => this.#ports.requestFrame());
  }

  /** The one shape every seam above takes: register, refresh, and refresh again on disposal. A new
   *  seam names what registers and what must run again. It transcribes neither. */
  #onBothEdges(register: () => Disposer, refresh: () => void): Disposer {
    const remove = register();
    refresh();
    return () => {
      remove();
      refresh();
    };
  }
}
