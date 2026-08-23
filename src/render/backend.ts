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

export interface RenderBackend {
  mount(host: unknown): void;
  sync(frame: GeometryFrame): void;
  applyState(state: InteractionState): void;
  hitTest(x: number, y: number): HitResult | null;
  destroy(): void;
}
