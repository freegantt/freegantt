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

const ZERO: ScrollPosition = { x: 0, y: 0 };

export class ScrollModel {
  #position: ScrollPosition;
  #bindings = new Map<MutableBinding, () => void>();
  #resolvedMax: ScrollPosition | undefined;
  #lastNotified: ScrollState | undefined;
  #batchDepth = 0;
  #pendingNotify = false;

  constructor(intent: ScrollIntent = {}) {
    this.#position = { x: intent.position?.x ?? 0, y: intent.position?.y ?? 0 };
  }

  /** Resolved + clamped, memoized like `TimeScaleModel.scale`. */
  get state(): ScrollState {
    return { position: this.#position, max: this.#max() };
  }

  /** Move the shared viewport. Clamps to `[0, max]` at write time (D-S1.5-2) — nothing else ever
   * rewrites `position`; a later shrink of `max` leaves it exactly where a caller last asked. */
  panTo(to: Partial<ScrollPosition>): void {
    const max = this.#max();
    const x = clamp(to.x ?? this.#position.x, max.x);
    const y = clamp(to.y ?? this.#position.y, max.y);
    if (x === this.#position.x && y === this.#position.y) return;
    this.#position = { x, y };
    this.#invalidate();
  }

  /** Several writes, at most one notification. Re-entrant; flushes at the outermost exit,
   * in a `finally` so a throwing `run` cannot wedge the model (conventions §5). */
  batch(run: () => void): void {
    this.#batchDepth++;
    try {
      run();
    } finally {
      this.#batchDepth--;
      if (this.#batchDepth === 0 && this.#pendingNotify) {
        this.#pendingNotify = false;
        this.#notifyAll();
      }
    }
  }

  /** @internal — called by `view/` only. A host that calls this creates a binding nothing
   * will ever unbind. Use `GanttOptions.scroll` instead. */
  bind(binding: ScrollBinding, onChange: () => void): ScrollBindingHandle {
    const copy: MutableBinding = { content: binding.content, pane: binding.pane };
    this.#bindings.set(copy, onChange);
    this.#resolvedMax = undefined;
    // The newcomer always hears about its own bind (D-S1.5-4) — that IS its first render — even when
    // the resolved state did not move. Every other bound reaction only hears about it when the
    // resolved state actually changed.
    const changed = this.#recordAndCheckChange();
    onChange();
    if (changed) {
      for (const [otherBinding, otherOnChange] of this.#bindings) {
        if (otherBinding !== copy) otherOnChange();
      }
    }
    return {
      unbind: () => {
        if (this.#bindings.delete(copy)) this.#invalidate();
      },
      setContentSize: (size) => {
        if (copy.content.width === size.width && copy.content.height === size.height) return;
        copy.content = size;
        this.#invalidate();
      },
      setPaneSize: (size) => {
        if (copy.pane.width === size.width && copy.pane.height === size.height) return;
        copy.pane = size;
        this.#invalidate();
      },
    };
  }

  #max(): ScrollPosition {
    if (this.#resolvedMax) return this.#resolvedMax;
    let maxX = 0;
    let maxY = 0;
    for (const binding of this.#bindings.keys()) {
      maxX = Math.max(maxX, Math.max(0, binding.content.width - binding.pane.width));
      maxY = Math.max(maxY, Math.max(0, binding.content.height - binding.pane.height));
    }
    this.#resolvedMax = this.#bindings.size === 0 ? ZERO : { x: maxX, y: maxY };
    return this.#resolvedMax;
  }

  #invalidate(): void {
    this.#resolvedMax = undefined;
    if (this.#batchDepth > 0) {
      this.#pendingNotify = true;
      return;
    }
    this.#notifyAll();
  }

  /** Used by `unbind`/`setContentSize`/`setPaneSize`/`panTo`/`batch` flush; `bind()` has its own pass
   * because it must notify the newcomer unconditionally. */
  #notifyAll(): void {
    const changed = this.#recordAndCheckChange();
    if (!changed) return;
    for (const onChange of this.#bindings.values()) onChange();
  }

  #recordAndCheckChange(): boolean {
    const next = this.state;
    const changed =
      !this.#lastNotified ||
      this.#lastNotified.position.x !== next.position.x ||
      this.#lastNotified.position.y !== next.position.y ||
      this.#lastNotified.max.x !== next.max.x ||
      this.#lastNotified.max.y !== next.max.y;
    this.#lastNotified = next;
    return changed;
  }
}
