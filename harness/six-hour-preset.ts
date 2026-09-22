// #489: a custom `tickIncrement > 1` preset, shared by every harness page that demos it
// (`editing-and-data.ts`, `e2e/editing.ts`) — one definition, so the two pages can't drift apart on
// the next tuning pass. Its gridlines sit at 00:00/06:00/12:00/18:00 in the dataset's zone and never
// drift off that grid during a pan, because `TimeScale.ticks` counts every tick from the day it falls
// in, not from wherever the visible window's own left edge happens to sit.
import { formatHour } from 'freegantt';
import type { Gantt, ViewPreset } from 'freegantt';

export const sixHourPreset: ViewPreset = {
  id: 'sixHour',
  tickUnit: 'hour',
  tickIncrement: 6,
  headers: [
    { unit: 'day', increment: 1, format: { year: 'numeric', month: 'short', day: 'numeric' } },
    { unit: 'hour', increment: 6, format: formatHour },
  ],
  preferredTickWidthPx: 48,
  minTickWidthPx: 40,
};

/** `gantt.zoomPresets`, with `sixHourPreset` spliced in right after `"hourDayWeek"`, not right after
 *  `"hour"` — `hourDayWeek` is still a 1-hour tick (56px/h), denser than `sixHourPreset`'s own 6-hour
 *  tick (8px/h), so inserting it any earlier would make `zoomOut()` land back on a *denser* rung and
 *  zoom back in. This keeps the ladder's own density strictly decreasing. Falls back to appending at
 *  the end if a future ladder ever drops the `"hourDayWeek"` id, rather than inserting at index 0 and
 *  making `sixHourPreset` the ladder's own finest rung. */
export function zoomPresetsWithSixHour(gantt: Pick<Gantt, 'zoomPresets'>): ViewPreset[] {
  const coarserRung = gantt.zoomPresets.findIndex((preset) => preset.id === 'hourDayWeek');
  const withSixHour = [...gantt.zoomPresets];
  withSixHour.splice(coarserRung === -1 ? withSixHour.length : coarserRung + 1, 0, sixHourPreset);
  return withSixHour;
}
