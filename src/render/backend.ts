// render/ backend contract (plans/01 §8.1). Shared by dom and null backends; DOM types are structural only —
// this file itself never touches document/window.

import type { GeometryFrame } from '../layout/index.js';

export interface InteractionState {
  hoveredItemId?: string;
  selectedItemIds?: readonly string[];
}

export interface HitResult {
  itemId: string;
}

export interface RenderBackend {
  mount(host: unknown): void;
  sync(frame: GeometryFrame): void;
  applyState(state: InteractionState): void;
  hitTest(x: number, y: number): HitResult | null;
  destroy(): void;
}
