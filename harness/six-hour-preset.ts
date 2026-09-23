// #489, #101: a `tickIncrement > 1` preset, spliced into `gantt.zoomPresets` by every harness page
// that demos it (`editing-and-data.ts`, `e2e/editing.ts`) — one definition of the splice, so the two
// pages can't drift apart on where the rung lands. `presets.sixHour` is the library's own shipped
// preset (#101 item 1) — this file holds no `ViewPreset` of its own anymore, only the ladder-order
// rule a demo page needs to add it. Its gridlines sit at 00:00/06:00/12:00/18:00 in the dataset's
// zone and never drift off that grid during a pan, because `TimeScale.ticks` counts every tick from
// the day it falls in, not from wherever the visible window's own left edge happens to sit.
import { presets } from 'freegantt';
import type { Gantt, ViewPreset } from 'freegantt';

/** `gantt.zoomPresets`, with the shipped `sixHour` preset spliced in right after `"hourDayWeek"`,
 *  not right after `"hour"` — `hourDayWeek` is still a 1-hour tick (56px/h), denser than `sixHour`'s
 *  own 6-hour tick, so inserting it any earlier would make `zoomOut()` land back on a *denser* rung
 *  and zoom back in. This keeps the ladder's own density strictly decreasing. Falls back to
 *  appending at the end if a future ladder ever drops the `"hourDayWeek"` id, rather than inserting
 *  at index 0 and making `sixHour` the ladder's own finest rung. */
export function zoomPresetsWithSixHour(gantt: Pick<Gantt, 'zoomPresets'>): ViewPreset[] {
  const coarserRung = gantt.zoomPresets.findIndex((preset) => preset.id === 'hourDayWeek');
  const withSixHour = [...gantt.zoomPresets];
  withSixHour.splice(coarserRung === -1 ? withSixHour.length : coarserRung + 1, 0, presets.sixHour);
  return withSixHour;
}
