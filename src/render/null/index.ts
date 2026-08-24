// render/null — headless backend for tests, SSR of data, and the future export seam (plans/01 §8.1).

import type { GeometryFrame } from '../../layout/index.js';
import type { RenderBackend, InteractionState, HitResult } from '../backend.js';

export interface NullBackend extends RenderBackend<void> {
  lastFrame(): GeometryFrame | undefined;
}

export function createNullBackend(): NullBackend {
  let lastFrame: GeometryFrame | undefined;

  return {
    mount() {},
    sync(frame) {
      lastFrame = frame;
    },
    applyState(_state: InteractionState) {},
    hitTest(): HitResult | null {
      return null;
    },
    destroy() {
      lastFrame = undefined;
    },
    lastFrame() {
      return lastFrame;
    },
  };
}
