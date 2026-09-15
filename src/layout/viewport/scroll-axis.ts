// layout/ owns ScrollAxis — the standalone, shareable one-direction scroll object a Gantt binds to
// (plans/01 §8.2, D-S6-1). A Gantt holds two, `{ x, y }`; passing the same instance as one Gantt's
// `x` and another Gantt's `x` syncs that direction only — the unit two Gantt instances share is one
// axis, never both at once. Same seam, same contract (D-S1.5-4): `bind` always notifies the
// newcomer; every other notification fires iff the resolved value changed.
//
// D-S1.5-1's fallback carries over unchanged, per direction: the axis owns ONE shared position; each
// bound Gantt clamps it locally to its own content. Two charts sharing an axis with different
// extents is the designed fallback, not an error case — the shorter one pins at its last position
// and picks up where it stopped, with zero remembered state (S1.5 README U3).
//
// `ScrollModel` retired here (D-S6-1): fusing both directions into one object meant sharing the
// instance always linked both, with no way to share one and keep the other private.

import { BoundValue } from './bound-value.js';

/** One direction's measured extent, supplied when a Gantt binds — what it can scroll over.
 * Measured by `view/`; `0` means "unmeasured", exactly as in `ScaleBinding`. The axis copies it at
 * bind time: the handle is the only way to change it. */
export interface ScrollAxisBinding {
  /** Full content extent in px, this direction — `frame.contentWidth` / `frame.contentHeight`. */
  readonly content: number;
  /** Measured drawable box of the timeline pane, this direction. */
  readonly pane: number;
}

/** @internal — `view/` only. Never re-exported from `api/`. */
export interface ScrollAxisBindingHandle {
  unbind(): void;
  setContentSize(px: number): void;
  setPaneSize(px: number): void;
}

/** The resolved state — both halves of it, so there is one path to the resolution and one thing to
 * notify about. */
export interface ScrollAxisState {
  /** Where the caller asked to be. May exceed `max` after a shrink — see D-S1.5-2. */
  readonly position: number;
  /** How far `panTo` may ask: the loosest bound any bound Gantt needs (D-S1.5-1). Not a claim
   * about any one chart's scroller — each clamps its own. */
  readonly max: number;
}

/** What `GanttOptions.scroll` takes. Omitting a direction keeps it private (D-S6-1) — the library
 * ships no sharing modes; which directions sync falls out of which fields are supplied. */
export interface ScrollAxes {
  readonly x?: ScrollAxis;
  readonly y?: ScrollAxis;
}

/** @internal — `layout/viewport/viewport.ts` only. Both directions resolved to a concrete
 * `ScrollAxis`, never optional: what `Viewport.scroll` holds once its private defaults are
 * applied. Distinct from `ScrollAxes`, whose directions stay optional for `GanttOptions.scroll`. */
export interface BoundScrollPair {
  readonly x: ScrollAxis;
  readonly y: ScrollAxis;
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

interface MutableBinding {
  content: number;
  pane: number;
}

function sameScrollAxisState(a: ScrollAxisState, b: ScrollAxisState): boolean {
  return a.position === b.position && a.max === b.max;
}

/** Per-instance state `bindScrollAxis` needs but which is not on the published type (issue #84,
 *  ADR 0007): `bind`/`unbind` are not class methods, so there is nothing for a caller holding a
 *  `ScrollAxis` reference to call. `view/` is the only importer of `bindScrollAxis`.
 *  I2-ok: keyed by ScrollAxis instance; one instance's entry never reaches another's. */
const internals = new WeakMap<ScrollAxis, { state: BoundValue<MutableBinding, ScrollAxisState> }>();

export class ScrollAxis {
  #position: number;
  /** The bindings, the state resolved from them, and the D-S1.5-4 notification contract — the same
   * object `TimeScaleModel` binds through (`bound-value.ts`). This axis supplies only what is its
   * own: how to resolve `{position, max}`, and what counts as a change. */
  #state = new BoundValue<MutableBinding, ScrollAxisState>({
    resolve: (bindings) => this.#resolve(bindings),
    equals: sameScrollAxisState,
  });

  constructor(position = 0) {
    this.#position = position;
    internals.set(this, { state: this.#state });
  }

  /** Resolved + clamped, memoized until an input changes. */
  get state(): ScrollAxisState {
    return this.#state.resolved;
  }

  /** Move this direction. Clamps to `[0, max]` at write time (D-S1.5-2) — nothing else ever
   * rewrites `position`; a later shrink of `max` leaves it exactly where a caller last asked. */
  panTo(position: number): void {
    const clamped = clamp(position, this.state.max);
    if (clamped === this.#position) return;
    this.#position = clamped;
    this.#state.invalidate();
  }

  /** Several writes, at most one notification. Re-entrant; flushes at the outermost exit, in a
   *  `finally` so a throwing `run` cannot wedge the axis (conventions §5). */
  batch(run: () => void): void {
    this.#state.batch(run);
  }

  /** `max` is the loosest bound any bound Gantt needs (D-S1.5-1) — not a claim about any one
   *  chart's scroller. */
  #resolve(bindings: Iterable<MutableBinding>): ScrollAxisState {
    let max = 0;
    let bound = false;
    for (const binding of bindings) {
      bound = true;
      max = Math.max(max, Math.max(0, binding.content - binding.pane));
    }
    return Object.freeze({ position: this.#position, max: bound ? max : 0 });
  }
}

/** A consumer that calls this creates a binding nothing will ever unbind — use `GanttOptions.scroll`
 * instead. Not a method on `ScrollAxis` (issue #84, ADR 0007) — a free function reaching the axis's
 * internal `BoundValue` through a module-private `WeakMap`, so the published type has nothing a
 * consumer holding a `ScrollAxis` could call. `view/` is the only importer. */
export function bindScrollAxis(
  axis: ScrollAxis,
  binding: ScrollAxisBinding,
  onChange: () => void,
): ScrollAxisBindingHandle {
  const internal = internals.get(axis);
  if (!internal) {
    throw new Error('bindScrollAxis: axis was not constructed through the ScrollAxis constructor');
  }
  // Copy-at-bind, as in `TimeScaleModel`: the handle is the only way to change what this binding
  // contributes.
  const copy: MutableBinding = { content: binding.content, pane: binding.pane };
  const bound = internal.state.bind(copy, onChange);
  return {
    unbind: () => bound.unbind(),
    setContentSize: (px) => {
      if (copy.content === px) return;
      copy.content = px;
      internal.state.invalidate();
    },
    setPaneSize: (px) => {
      if (copy.pane === px) return;
      copy.pane = px;
      internal.state.invalidate();
    },
  };
}
