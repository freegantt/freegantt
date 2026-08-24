// model/ — geometry primitives, types only, zero deps (plans/01 §1.1). One home for every layer
// that needs a point or a box, so `layout/`, `render/`, `view/` and `interaction/` share one vocabulary
// instead of each declaring their own {x, y} shape.

/** A location in content pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A horizontal span in pixels. */
export interface PixelSpan {
  readonly x: number;
  readonly width: number;
}

/** A box positioned in pixels. */
export interface Rect extends PixelSpan {
  readonly y: number;
  readonly height: number;
}
