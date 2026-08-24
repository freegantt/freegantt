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
}
