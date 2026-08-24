// render/ backend contract (plans/01 §8.1). Shared by dom and null backends; DOM types are structural only —
// this file itself never touches document/window.

import type { GeometryFrame, ItemId } from '../layout/index.js';

export interface InteractionState {
  hoveredItemId?: ItemId;
  selectedItemIds?: readonly ItemId[];
}

export interface HitResult {
  itemId: ItemId;
}

/** `THost` is the seam's only DOM-shaped type parameter — `backend.ts` itself still names no DOM
 * type (#23). `createDomBackend(): RenderBackend<HTMLElement>`; a future canvas backend would be
 * `RenderBackend<HTMLCanvasElement>`, checked at the call site instead of cast blind at `mount()`. */
export interface RenderBackend<THost = unknown> {
  mount(host: THost): void;
  sync(frame: GeometryFrame): void;
  applyState(state: InteractionState): void;
  hitTest(x: number, y: number): HitResult | null;
  destroy(): void;
  /** Px width the backend reserves for its row-label column, fixed for the life of a mount (#46) —
   * `0` before `mount()`. The one source of truth for the label-column gutter: callers that also feed
   * a viewport width to `TimeScaleModel`/`computeFrame` must subtract this first, or header ticks and
   * bars end up computed against the wrong width while also sitting in different coordinate frames. */
  readonly rowLabelWidth: number;
}
