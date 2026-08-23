// layout/ owns TimeScaleModel — the standalone, shareable viewport object a Chart binds to
// (plans/01 §8.2, D9). It lives here rather than in time/ itself: it's the only DOM-free layer both
// permitted to import time/ (layout -> time is an allowed edge) and reachable from view/ and api/
// through allowed edges (view -> layout, api -> view) per the boundary lint (I1). Passing the same
// instance to two charts syncs their x-axis by construction — no event plumbing, no link manager.

import { createTimeScale } from '../time/index.js';
import type { TimeScale, TimeScaleOptions } from '../time/index.js';

export class TimeScaleModel {
  #scale: TimeScale;

  constructor(options: TimeScaleOptions) {
    this.#scale = createTimeScale(options);
  }

  get scale(): TimeScale {
    return this.#scale;
  }
}
