// view/ — today-landing policy. The shell asks this; Viewport only pans.

import type { Instant } from '../model/index.js';
import type { Viewport } from '../layout/index.js';

/** Call: `panToTodayLine(viewport, at, align, todayLineMarginTicks)`. */
export function panToTodayLine(
  viewport: Viewport,
  at: Instant,
  align: 'start' | 'center',
  marginTicks: number,
): void {
  if (align === 'center') {
    viewport.panToInstant(at, align);
    return;
  }
  const preset = viewport.preset;
  const marginPx = viewport.timeScale.widthForDuration(
    { unit: preset.tickUnit, value: preset.tickIncrement * marginTicks },
    at,
  );
  const x = viewport.timeScale.xForInstant(at) - marginPx;
  viewport.scroll.x.panTo(x);
}
