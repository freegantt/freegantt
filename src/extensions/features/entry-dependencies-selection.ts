// extensions/features/ — which Dependency connector the user selected, and the keys that act on it.
// `entryDependencies()` owns the selection because core knows connectors only as lines. Core draws
// the `selected` flag, resolves a click to a connector and focuses it. This file decides what that
// means for a Dependency.

import type { PluginContext } from '../../api/gantt.js';

/** Every connector this plugin draws has this prefix, so it never collides with another plugin's ids. */
const CONNECTOR_PREFIX = 'dependency:';

/** The connector id of one Dependency. */
export function connectorIdOf(dependencyId: string): string {
  return `${CONNECTOR_PREFIX}${dependencyId}`;
}

/** The Dependency id behind a connector id. `undefined` for a connector another plugin draws. */
function dependencyIdOf(connectorId: string): string | undefined {
  return connectorId.startsWith(CONNECTOR_PREFIX) ? connectorId.slice(CONNECTOR_PREFIX.length) : undefined;
}

/** What the selection asks of `entryDependencies()`. */
export interface ConnectorSelectionPorts {
  /** Every Dependency id, in the order the provider draws them. */
  dependencyIds(): readonly string[];
  /** Removes the Dependency the user chose, through the remove events. */
  removeByUser(dependencyId: string): void;
}

export interface ConnectorSelection {
  isSelected(dependencyId: string): boolean;
  /** Removes the key handlers, so a key on a connector reaches a disposed plugin no more. */
  disposeKeys(): void;
}

type Step = 'previous' | 'next';

/** Starts the selection. One connector can be selected. A click or focus on a connector selects it.
 *  A click or focus anywhere else in the Gantt clears it. The Entry Selection never changes. */
export function connectorSelection(ctx: PluginContext, ports: ConnectorSelectionPorts): ConnectorSelection {
  let selected: string | undefined;

  function dependencyUnder(node: EventTarget | null): string | undefined {
    if (!(node instanceof Node)) return undefined;
    const target = ctx.view.dom.targetUnder(node);
    return target?.kind === 'connector' && target.connectorId !== undefined
      ? dependencyIdOf(target.connectorId)
      : undefined;
  }

  // The selection is screen-only state, so the plugin store never sees it. Core must ask the
  // provider again, or the `selected` flag shows only after an unrelated redraw.
  function select(dependencyId: string | undefined): void {
    if (dependencyId === selected) return;
    selected = dependencyId;
    ctx.view.refreshConnectors();
  }

  function moveFocus(from: string, step: Step): void {
    const mounted = ports.dependencyIds().flatMap((id) => {
      const line = ctx.view.dom.connectorFor(connectorIdOf(id));
      return line === undefined ? [] : [{ id, line }];
    });
    const index = mounted.findIndex((candidate) => candidate.id === from);
    const next = mounted[step === 'next' ? index + 1 : index - 1];
    next?.line.focus();
  }

  ctx.view.onDomEvent('click', (_event, target) => {
    select(target?.kind === 'connector' ? dependencyIdOf(target.connectorId ?? '') : undefined);
  });
  ctx.view.onDomEvent('focusin', (_event, target) => {
    select(target?.kind === 'connector' ? dependencyIdOf(target.connectorId ?? '') : undefined);
  });

  // What do the arrows do on a focused connector? They move focus to the next or previous one.
  // Focus then selects it. On any other target the key stays with core.
  const arrowSteps: readonly (readonly [chord: string, step: Step])[] = [
    ['ArrowUp', 'previous'],
    ['ArrowLeft', 'previous'],
    ['ArrowDown', 'next'],
    ['ArrowRight', 'next'],
  ];
  const keyDisposers = arrowSteps.map(([chord, step]) =>
    ctx.interaction.registerKeyHandler(chord, (event) => {
      const from = dependencyUnder(event.target);
      if (from === undefined) return false;
      moveFocus(from, step);
    }),
  );

  // What does Delete do on a focused connector? It removes the Dependency. On any other target
  // the key stays with core, which removes Entries.
  keyDisposers.push(
    ctx.interaction.registerKeyHandler('Delete', (event) => {
      const dependencyId = dependencyUnder(event.target);
      if (dependencyId === undefined) return false;
      ports.removeByUser(dependencyId);
    }),
  );

  return {
    isSelected: (dependencyId) => dependencyId === selected,
    disposeKeys: () => {
      for (const dispose of keyDisposers) dispose();
    },
  };
}
