// layout/ owns ScrollModel — the standalone, shareable viewport object a Gantt binds to for scroll
// position (plans/01 §8.2, D9), the y-axis counterpart to TimeScaleModel. Same seam, same contract
// (D-S1.5-4): `bind` always notifies the newcomer; every other notification fires iff the resolved
// value changed.
//
// D-S1.5-1: the model owns ONE shared position; each bound Gantt clamps it locally to its own
// content. Two charts sharing a model with different row counts is the designed fallback, not an
// error case — the shorter one pins at its last row and picks up where it stopped, with zero
// remembered state (S1.5 README U3).

import type { Point, Size } from '../../model/index.js';
import { BoundValue } from './bound-value.js';

/** A scroll offset in content pixels. */
export type ScrollPosition = Point;

/** What a caller states up front. Extents are measured, never stated (mirrors `TimeScaleIntent`). */
export interface ScrollIntent {
  /** Starting position. Default `{ x: 0, y: 0 }`. */
  position?: Partial<ScrollPosition>;
}

/** One Gantt's contribution to resolution, supplied when it binds — what it can scroll over.
 * Measured by `view/`; a `0` in either box means "unmeasured", exactly as in `ScaleBinding`.
 * `readonly`, and the model copies it at bind time: the handle is the only way to change it. */
export interface ScrollBinding {
  /** Full content extent in px — `frame.contentWidth` / `frame.contentHeight`. */
  readonly content: Size;
  /** Measured drawable box of the timeline pane. */
  readonly pane: Size;
}

/** @internal — `view/` only. Never re-exported from `api/`. */
export interface ScrollBindingHandle {
  unbind(): void;
  setContentSize(size: Size): void;
  setPaneSize(size: Size): void;
}

/** The resolved state — both halves of it, so there is one path to the resolution and one thing
 * to notify about. */
export interface ScrollState {
  /** Where the caller asked to be. May exceed `max` after a shrink — see D-S1.5-2. */
  readonly position: ScrollPosition;
  /** How far a `panTo` may ask: the loosest bound any bound Gantt needs (D-S1.5-1).
   * Not a claim about any one chart's scroller — each clamps its own. */
  readonly max: ScrollPosition;
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

interface MutableBinding {
  content: Size;
  pane: Size;
}

const ZERO: ScrollPosition = Object.freeze({ x: 0, y: 0 });

/** Frozen, not just `readonly`: `state` hands both halves out by reference, and `readonly` is a
 * compile-time claim only — a consumer writing `state.position.x` would move the shared model without
 * notifying anyone. Frozen, that write throws instead (every module here is an ES module, so it is
 * strict-mode code). Freezing at the two assignment points costs nothing per read; copying on every
 * `state` read would not. */
function frozenPosition(x: number, y: number): ScrollPosition {
  return Object.freeze({ x, y });
}

function sameScrollState(a: ScrollState, b: ScrollState): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.max.x === b.max.x &&
    a.max.y === b.max.y
  );
}

export class ScrollModel {
  #position: ScrollPosition;
  /** The bindings, the state resolved from them, and the D-S1.5-4 notification contract — the same
   * object `TimeScaleModel` binds through (`bound-value.ts`). This model supplies only what is its
   * own: how to resolve `{position, max}`, and what counts as a change. */
  #state = new BoundValue<MutableBinding, ScrollState>({
    resolve: (bindings) => this.#resolve(bindings),
    equals: sameScrollState,
  });

  constructor(intent: ScrollIntent = {}) {
    this.#position = frozenPosition(intent.position?.x ?? 0, intent.position?.y ?? 0);
  }

  /** Resolved + clamped, memoized until an input changes. */
  get state(): ScrollState {
    return this.#state.resolved;
  }

  /** Move the shared viewport. Clamps to `[0, max]` at write time (D-S1.5-2) — nothing else ever
   * rewrites `position`; a later shrink of `max` leaves it exactly where a caller last asked. */
  panTo(to: Partial<ScrollPosition>): void {
    const max = this.state.max;
    const x = clamp(to.x ?? this.#position.x, max.x);
    const y = clamp(to.y ?? this.#position.y, max.y);
    if (x === this.#position.x && y === this.#position.y) return;
    this.#position = frozenPosition(x, y);
    this.#state.invalidate();
  }

  /** Several writes, at most one notification. Re-entrant; flushes at the outermost exit,
   * in a `finally` so a throwing `run` cannot wedge the model (conventions §5). */
  batch(run: () => void): void {
    this.#state.batch(run);
  }

  /** @internal — called by `view/` only. A consumer that calls this creates a binding nothing
   * will ever unbind. Use `GanttOptions.scroll` instead. */
  bind(binding: ScrollBinding, onChange: () => void): ScrollBindingHandle {
    // Copy-at-bind, as in `TimeScaleModel`: the handle is the only way to change what this binding
    // contributes.
    const copy: MutableBinding = { content: binding.content, pane: binding.pane };
    const bound = this.#state.bind(copy, onChange);
    return {
      unbind: () => bound.unbind(),
      setContentSize: (size) => {
        if (copy.content.width === size.width && copy.content.height === size.height) return;
        copy.content = size;
        this.#state.invalidate();
      },
      setPaneSize: (size) => {
        if (copy.pane.width === size.width && copy.pane.height === size.height) return;
        copy.pane = size;
        this.#state.invalidate();
      },
    };
  }

  /** `max` is the loosest bound any bound Gantt needs (D-S1.5-1) — not a claim about any one
   * chart's scroller. Frozen with `position`: `state` hands the model's own objects out. */
  #resolve(bindings: Iterable<MutableBinding>): ScrollState {
    let maxX = 0;
    let maxY = 0;
    let bound = false;
    for (const binding of bindings) {
      bound = true;
      maxX = Math.max(maxX, Math.max(0, binding.content.width - binding.pane.width));
      maxY = Math.max(maxY, Math.max(0, binding.content.height - binding.pane.height));
    }
    return Object.freeze({
      position: this.#position,
      max: bound ? frozenPosition(maxX, maxY) : ZERO,
    });
  }
}
