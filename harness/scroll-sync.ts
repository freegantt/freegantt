// e2e fixture for S1.5's acceptance checks (plans/s1.5-scroll-model/README.md §7, §9) and S6's R3
// (plans/03-slices.md, D-S6-1): two Gantts sharing one `ScrollAxis` per direction (and one
// `TimeScaleModel`, matching D9's "x, y, or both"), with the second chart holding far fewer rows
// than the first — the U3 clamp/pin case happy-dom cannot express.
//
// Five pairs live on this page. #tall/#short share both axes (D-S1.5-3's fused case, kept for the
// existing S1.5 checks). #xonly-a/#xonly-b share only x (D-S6-1): each keeps a private y, so a
// vertical scroll on one never reaches the other, even though the two hold different row counts.
// #yonly-a/#yonly-b share only y (D-S6-1): each keeps a private x, so a horizontal scroll on one
// never reaches the other. #gutter-a/#gutter-b share only x and deliberately disagree about
// vertical overflow — the #440 case, where one pane's scrollbar used to make it 15px narrower than
// its partner and the two stopped at different places on the right. #pane-fit-a/#pane-fit-b share
// only x at the default `fit: 'pane'`, where the axis max is always 0 (#436).

import './harness-nav.ts';
import { Gantt, Dataset, ScrollAxis, TimeScaleModel } from 'freegantt';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';
import { milestoneOnRangeEndEntries, milestoneOnRangeEndSpan } from '../fixtures/milestone-on-range-end.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'scroll-sync');

const tallDataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const shortDataset = new Dataset({ entries: demoEntryInputs.slice(0, 20), timeZone: 'UTC' });

// `fit: 'preset'` (D-S1.11-4): the default `'pane'` makes content width equal pane width,
// so `max.x` is 0 and D9's x half is unobservable on the one page that exists to prove D9.
const scale = new TimeScaleModel({ fit: 'preset' });
const scroll = { x: new ScrollAxis(), y: new ScrollAxis() };

// Distinct a11yLabel per instance: the default ('Gantt') is fine for one Gantt on a page, but two
// sharing it name the same accessible region twice (axe landmark-unique, D-S5-27).
new Gantt({ container: '#tall', dataset: tallDataset, scale, scroll, a11yLabel: 'Tall Gantt' });
new Gantt({ container: '#short', dataset: shortDataset, scale, scroll, a11yLabel: 'Short Gantt' });

const xOnlyADataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const xOnlyBDataset = new Dataset({ entries: demoEntryInputs.slice(0, 20), timeZone: 'UTC' });

const xOnlyScale = new TimeScaleModel({ fit: 'preset' });
const sharedX = new ScrollAxis();

// Only `x` is shared: each Gantt keeps its own private `y`, so scrolling one vertically never
// moves the other, and neither pane's row-count-derived y max leaks into the other (D-S6-1).
new Gantt({
  container: '#xonly-a',
  dataset: xOnlyADataset,
  scale: xOnlyScale,
  scroll: { x: sharedX },
  a11yLabel: 'X-only Gantt A',
});
new Gantt({
  container: '#xonly-b',
  dataset: xOnlyBDataset,
  scale: xOnlyScale,
  scroll: { x: sharedX },
  a11yLabel: 'X-only Gantt B',
});

const yOnlyADataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const yOnlyBDataset = new Dataset({ entries: demoEntryInputs.slice(0, 20), timeZone: 'UTC' });

const sharedY = new ScrollAxis();

// Only `y` is shared: each Gantt keeps its own private `x`, so scrolling one horizontally never
// moves the other (D-S6-1). Scale is not shared here — y-sync does not depend on it.
new Gantt({
  container: '#yonly-a',
  dataset: yOnlyADataset,
  scroll: { y: sharedY },
  a11yLabel: 'Y-only Gantt A',
});
new Gantt({
  container: '#yonly-b',
  dataset: yOnlyBDataset,
  scroll: { y: sharedY },
  a11yLabel: 'Y-only Gantt B',
});

// #440: the pair that disagrees about vertical overflow. #gutter-a holds every demo row and
// overflows its 240px box; #gutter-b holds three rows and does not. With a classic scrollbar that
// makes #gutter-a's pane narrower than #gutter-b's, and two panes of different widths on one axis
// stop at different places. Both reserve the gutter instead, so the widths agree.
const gutterADataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const gutterBDataset = new Dataset({ entries: demoEntryInputs.slice(0, 3), timeZone: 'UTC' });

const gutterScale = new TimeScaleModel({ fit: 'preset' });
const gutterX = new ScrollAxis();

new Gantt({
  container: '#gutter-a',
  dataset: gutterADataset,
  scale: gutterScale,
  scroll: { x: gutterX },
  a11yLabel: 'Overflowing Gantt',
});
new Gantt({
  container: '#gutter-b',
  dataset: gutterBDataset,
  scale: gutterScale,
  scroll: { x: gutterX },
  a11yLabel: 'Short Gantt without a scrollbar',
});

// #436: `fit: 'pane'` (the default, no `fit` given) makes contentWidth === paneWidth, so the shared
// ScrollAxis above never runs this combination — its own comment says so. Two Gantts, one shared x
// ScrollAxis, at the default fit, both loading `milestoneOnRangeEndEntries` — the shared fixture
// whose last entry is a zero-length milestone on the range's own end, which is the shape that used
// to float a bar's floored box, and its label, past contentWidth. `e2e/scroll-sync.spec.ts` reads
// both panes' own scrollWidth to prove neither can scroll at all — the only way two panes sharing
// an axis whose max is always 0 can never desync.
const paneFitADataset = new Dataset({ entries: milestoneOnRangeEndEntries, timeZone: 'UTC' });
const paneFitBDataset = new Dataset({ entries: milestoneOnRangeEndEntries, timeZone: 'UTC' });
const sharedPaneFitX = new ScrollAxis();

new Gantt({
  container: '#pane-fit-a',
  dataset: paneFitADataset,
  range: milestoneOnRangeEndSpan,
  scroll: { x: sharedPaneFitX },
  a11yLabel: 'Pane-fit Gantt A',
});
new Gantt({
  container: '#pane-fit-b',
  dataset: paneFitBDataset,
  range: milestoneOnRangeEndSpan,
  scroll: { x: sharedPaneFitX },
  a11yLabel: 'Pane-fit Gantt B',
});
