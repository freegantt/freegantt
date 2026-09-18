// view/ — the seams a plugin registers into, in one place, each with the refresh it owes
// (#170). Four things share one lifetime: a renderer, a decoration provider, a variant and a Grid
// column. Register one, and the Gantt shows it. Dispose one, and the Gantt shows what wins next
// (#155). What differs is which pass has to run again. That is the one thing a reader used to have
// to reassemble from three files.
//
// ADR 0018 took three of those seams down to one. A claim, a Bar producer and a per-look
// capability default were three registrations of one variant, and the variant's name was written at
// every one. `registerVariant` is what replaced them.
//
// Before this module, `buildPluginPorts` decided that one layer away from the registration. The
// decoration seam open-coded its own lifetime too, with an array plus `indexOf`/`splice`. That is
// the exact job `createRegistrationTable` already does precisely (#154).
//
// A new seam is a method here, beside the rest. It is not another mechanism.

import { createRegistrationTable } from '../layout/registration-table.js';
import type {
  DecorationLayer,
  DecorationProvider,
  EntryVariant,
  RegisteredDecorationProvider,
  RendererFor,
  RendererPoint,
  VariantRegistry,
} from '../layout/index.js';
import type { Disposer, GridColumnInput, PluginId } from '../model/index.js';
import { RendererRegistry } from './renderer-registry.js';

/** What these registrations borrow from `GanttShell` to make a registration visible. Each one is a
 *  pass that has to run again, never a registry: the tables themselves live here. */
export interface PluginRegistrationPorts {
  /** Queues one frame (B10, D-S2-15). */
  requestFrame(): void;
  /** Drops the per-row Bar cache, so every row produces its Bars again on the next render. */
  invalidateBars(): void;
  /** Re-resolves every entry's capabilities, and re-derives the affordances off the current hover. */
  refreshCapabilities(): void;
  /** Rewrites this Gantt's own variant stylesheet from the registry's current installed set (ADR
   *  0022 §5). A registered variant's `css` reaches the document on the same edge its `bars` and
   *  `can` already do. */
  refreshVariantStyles(): void;
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
  registerVariant(variant: EntryVariant, pluginId: PluginId): Disposer;
  registerGridColumn(column: GridColumnInput, pluginId: PluginId): Disposer;
}

/** One instance per Gantt (I2), owned by `GanttShell`. Never a module-level singleton. */
export class PluginRegistrations implements PluginRegistrar {
  #ports: PluginRegistrationPorts;

  /** S5.4, D-S5-11/12: which renderer paints a bar, cell, header or tooltip. Its own module: the
   *  claim rules (per-kind slots, whole-point refusal) are that file's subject, not this one's. */
  readonly renderers = new RendererRegistry();

  /** D-S4-24, ADR 0018: one registry per Gantt, seeded with core's two variants. `LayoutInput`
   *  carries the object itself, so this exposes the registry rather than a copy of its contents. */
  readonly variants: VariantRegistry;

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

  constructor(ports: PluginRegistrationPorts, variants: VariantRegistry) {
    this.#ports = ports;
    this.variants = variants;
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

  /** ADR 0018: one variant is one object. So one registration changes what a row wears, what it
   *  draws, how it looks, and what every gesture may do to it. It also changes what rules its look
   *  needs. Every pass those five answers feed therefore runs again, on both edges —
   *  `refreshVariantStyles()` for the fifth, beside `invalidateBars()` for the rest. `FrameLayout`'s
   *  per-row Bar cache forgets a row on a dataset, row-count or metrics change only. A variant
   *  registration is none of those, so every row produces its Bars again. */
  registerVariant(variant: EntryVariant, pluginId: PluginId): Disposer {
    return this.#onBothEdges(
      () => this.variants.addPluginVariant(variant, pluginId),
      () => {
        this.#ports.invalidateBars();
        this.#ports.refreshCapabilities();
        this.#ports.refreshVariantStyles();
        this.#ports.requestFrame();
      },
    );
  }

  /** S5.9, D-S5-21. The one seam whose refresh stays with its own module. `ColumnChrome` strips the
   *  baked-in copy of an abandoned field *between* removing the registration and rebinding, so the
   *  two cannot be pulled apart (D-S5-18, #155). This entry is here so a reader finds all four
   *  seams in one list, not so the refresh moves.
   *
   *  `pluginId` travels with the column, for the reason `registerRenderer` already takes one. A
   *  declaration must say who made it. Without that, the library cannot keep a plugin's column out
   *  of what the consumer authored and saves (D-S5-33). A `PluginStore` carries its owner's id for
   *  the same reason (D-S5-24). */
  registerGridColumn(column: GridColumnInput, pluginId: PluginId): Disposer {
    return this.#ports.registerGridColumn(column, pluginId);
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
