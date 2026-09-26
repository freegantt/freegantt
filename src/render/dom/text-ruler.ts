// render/dom — measures a bar label's width in CSS px, off a canvas 2D context sharing the bar
// layer's own font. A DOM measurement (an offscreen span, then read its layout box) would
// force a style recalculation per call; canvas `measureText` reads glyph metrics with no layout
// pass, which is what keeps a placement check affordable for every bar on every frame. A label's
// width does not change mid-drag (the text itself never changes), so `syncBars` reads this once
// per label and never mid-gesture.

export interface TextRuler {
  /** `undefined` when no 2d context is available (e.g. a DOM stub with no canvas backing). Every
   *  label falls back to `inside` then — a stub environment never invents pixels it cannot measure,
   *  and `inside` is the placement that needs no measurement to be a safe default. */
  widthOf(text: string): number | undefined;
}

/** One ruler per backend instance (I2 — no module-level canvas shared across two Gantt instances).
 *  `font` is read once, off `fontSourceElement`'s computed style, and cached: the label's font is
 *  the container's own cascade, not something a drag or a re-render changes. */
export function createTextRuler(fontSourceElement: HTMLElement): TextRuler {
  const context = document.createElement('canvas').getContext('2d');
  if (context) {
    const computed = getComputedStyle(fontSourceElement);
    context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  }
  return {
    widthOf(text) {
      return context?.measureText(text).width;
    },
  };
}
