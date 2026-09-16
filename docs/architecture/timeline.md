# How the timeline paints

The timeline is a bound `TimeScale` plus a header of absolutely positioned ticks. On top of that
sit five behaviours worth their own explanation: a density floor, sticky coarse labels, dropped
repeated granularity across bands, unpadded hour labels, and a today line that only draws inside
the scale range.

*Source: `time/scale.ts`, `time/presets.ts`, `render/dom/`. Open
[`zoom.html`](https://github.com/Pawel-IT/FreeGantt/blob/main/harness/zoom.html) while you read
this.*

## Paint path

`GanttShell.render()` reads the bound viewport, runs one pure `computeFrame`, then the DOM backend
patches ticks with `translateX` and width. Geometry stays in `layout/`. Painting stays in
`render/` and `view/styles.ts`.

*Derived from `view/gantt-shell.ts` `render()`, `layout/frame.ts`,
`layout/viewport/time-scale-model.ts`, `render/dom/index.ts`, `view/styles.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 420"
role="img"
aria-labelledby="tl-pipe-title tl-pipe-desc"
>
<title id="tl-pipe-title">Timeline header paint path</title>
<desc id="tl-pipe-desc">
GanttShell.render reads Viewport and TimeScale, computeFrame drops repeated granularity and clamps
tick x, then the DOM backend writes .fg-tick transform and width.
</desc>
<defs>
<marker
id="tl-arrow"
viewBox="0 0 10 10"
refX="9"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,1 L9,5 L0,9 z" fill="currentColor" />
</marker>
</defs>
<rect class="bx dom" x="24" y="24" width="200" height="64" />
<text class="t" x="124" y="50" text-anchor="middle">GanttShell.render</text>
<text class="s" x="124" y="66" text-anchor="middle">view/gantt-shell.ts</text>
<rect class="bx pure" x="280" y="24" width="200" height="64" />
<text class="t" x="380" y="50" text-anchor="middle">Viewport</text>
<text class="s" x="380" y="66" text-anchor="middle">visible · preset · scale</text>
<rect class="bx pure" x="536" y="24" width="200" height="64" />
<text class="t" x="636" y="50" text-anchor="middle">TimeScale</text>
<text class="s" x="636" y="66" text-anchor="middle">ticks() · pxPerMs</text>
<rect class="bx hot" x="280" y="152" width="280" height="80" />
<text class="t hotink" x="420" y="184" text-anchor="middle">computeFrame headers</text>
<text class="s" x="420" y="202" text-anchor="middle">dropRepeatedGranularity</text>
<text class="s" x="420" y="216" text-anchor="middle">clamp tick.x to pane left</text>
<rect class="bx dom" x="608" y="160" width="216" height="64" />
<text class="t" x="716" y="186" text-anchor="middle">DOM backend.sync</text>
<text class="s" x="716" y="202" text-anchor="middle">syncKeyed .fg-tick</text>
<rect class="bx dom" x="608" y="280" width="216" height="64" />
<text class="t" x="716" y="306" text-anchor="middle">.fg-tick CSS</text>
<text class="s" x="716" y="322" text-anchor="middle">ellipsis · padding · sticky header</text>
<line
class="edge"
x1="224"
y1="56"
x2="274"
y2="56"
marker-end="url(#tl-arrow)"
style="color: var(--sub)"
/>
<line
class="edge"
x1="480"
y1="56"
x2="530"
y2="56"
marker-end="url(#tl-arrow)"
style="color: var(--sub)"
/>
<path
class="edge"
d="M380,88 V146"
marker-end="url(#tl-arrow)"
style="color: var(--sub)"
/>
<path
class="edge"
d="M636,88 V192 H566"
marker-end="url(#tl-arrow)"
style="color: var(--sub)"
/>
<line
class="edge"
x1="560"
y1="192"
x2="610"
y2="192"
marker-end="url(#tl-arrow)"
style="color: var(--hot-line)"
/>
<line
class="edge"
x1="716"
y1="224"
x2="716"
y2="274"
marker-end="url(#tl-arrow)"
style="color: var(--sub)"
/>
<line x1="24" y1="368" x2="936" y2="368" stroke="var(--line-soft)" />
<text class="xs" x="24" y="392">LEGEND</text>
<rect class="bx pure" x="96" y="378" width="16" height="16" />
<text class="xs" x="120" y="390">layout / time (DOM-free)</text>
<rect class="bx dom" x="320" y="378" width="16" height="16" />
<text class="xs" x="344" y="390">view / render</text>
<rect class="bx hot" x="480" y="378" width="16" height="16" />
<text class="xs" x="504" y="390">header layout and label clamping</text>
</svg>
</div>
<figcaption>
One frame. The shell never formats dates. The backend never computes tick x. CSS never moves a
tick; it only clips a label that is still too wide.
</figcaption>
</figure>
</div>

| Step | What runs |
| --- | --- |
| fit | `TimeScaleModel` resolves `pxPerMs` from `'pane'`, `'preset'`, or an explicit number. It then floors that density at `minTickWidthPx` and caps content width at 16,777,216 px. |
| cull | `computeFrame` asks `scale.ticks()` for each header band across the visible window plus horizontal overscan (default 128 px). |
| label | `dropRepeatedGranularity` strips `year`/`month` from a finer band when a coarser band already states them. Then each tick's `x` clamps to the pane's left edge so a coarse label stays in view. |
| paint | `render/dom` sets `transform: translateX(tick.x)` and `width`. The header is `position: sticky; top: 0` so rows scroll under it. |

## Density floor

Zoom-out no longer squashes a preset until labels overlap. Each shipped preset states
`minTickWidthPx`. The model raises `pxPerMs` until one finest-band tick is at least that wide. The
pane then scrolls.

*Derived from `time/presets.ts`, `time/scale.ts` `minPxPerMsForPreset`,
`layout/viewport/time-scale-model.ts` `#resolvePxPerMs`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 1000 500"
role="img"
aria-labelledby="tl-bar-title tl-bar-desc"
>
<title id="tl-bar-title">Shipped minTickWidthPx by preset</title>
<desc id="tl-bar-desc">
Bar chart of the density floor in pixels for the nine zoom-ladder presets. The day
preset is the tallest at 96 pixels because its lone band shows a full date.
</desc>
<line x1="80" y1="40" x2="80" y2="420" stroke="rgba(28,30,38,0.25)" stroke-width="1" />
<line x1="80" y1="420" x2="960" y2="420" stroke="rgba(28,30,38,0.25)" stroke-width="1" />
<line x1="80" y1="40" x2="960" y2="40" stroke="rgba(28,30,38,0.08)" stroke-width="0.8" />
<line x1="80" y1="116" x2="960" y2="116" stroke="rgba(28,30,38,0.08)" stroke-width="0.8" />
<line x1="80" y1="192" x2="960" y2="192" stroke="rgba(28,30,38,0.08)" stroke-width="0.8" />
<line x1="80" y1="268" x2="960" y2="268" stroke="rgba(28,30,38,0.08)" stroke-width="0.8" />
<line x1="80" y1="344" x2="960" y2="344" stroke="rgba(28,30,38,0.08)" stroke-width="0.8" />
<text class="xs" x="72" y="44" text-anchor="end">100</text>
<text class="xs" x="72" y="120" text-anchor="end">80</text>
<text class="xs" x="72" y="196" text-anchor="end">60</text>
<text class="xs" x="72" y="272" text-anchor="end">40</text>
<text class="xs" x="72" y="348" text-anchor="end">20</text>
<text class="xs" x="72" y="424" text-anchor="end">0</text>
<text class="xs" x="40" y="240" text-anchor="middle" transform="rotate(-90 40 240)">
minTickWidthPx
</text>
<!-- ZOOM_PRESETS, finest first. height = minTickWidthPx * 3.8 -->
<!-- hour 48 -->
<rect x="96" y="238" width="64" height="182" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="128" y="230" text-anchor="middle">48</text>
<text class="xs" x="128" y="440" text-anchor="middle">hour</text>
<!-- hourDayWeek 48 -->
<rect x="188" y="238" width="64" height="182" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="220" y="230" text-anchor="middle">48</text>
<text class="xs" x="220" y="440" text-anchor="middle">h+d+w</text>
<!-- day 96 focal -->
<rect x="280" y="55" width="64" height="365" fill="var(--hot-bg)" stroke="var(--hot-line)" />
<text class="xs hotink" x="312" y="47" text-anchor="middle">96</text>
<text class="xs" x="312" y="440" text-anchor="middle">day</text>
<!-- dayAndWeek 32 -->
<rect x="372" y="298" width="64" height="122" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="404" y="290" text-anchor="middle">32</text>
<text class="xs" x="404" y="440" text-anchor="middle">d+w</text>
<!-- dayWeekMonth 28 -->
<rect x="464" y="314" width="64" height="106" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="496" y="306" text-anchor="middle">28</text>
<text class="xs" x="496" y="440" text-anchor="middle">d+w+m</text>
<!-- weekAndMonth 40 -->
<rect x="556" y="268" width="64" height="152" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="588" y="260" text-anchor="middle">40</text>
<text class="xs" x="588" y="440" text-anchor="middle">w+m</text>
<!-- weekMonthYear 40 -->
<rect x="648" y="268" width="64" height="152" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="680" y="260" text-anchor="middle">40</text>
<text class="xs" x="680" y="440" text-anchor="middle">w+m+y</text>
<!-- monthAndYear 50 -->
<rect x="740" y="230" width="64" height="190" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="772" y="222" text-anchor="middle">50</text>
<text class="xs" x="772" y="440" text-anchor="middle">m+y</text>
<!-- year 40 -->
<rect x="832" y="268" width="64" height="152" fill="rgba(90,106,154,0.15)" stroke="var(--dom-line)" />
<text class="xs" x="864" y="260" text-anchor="middle">40</text>
<text class="xs" x="864" y="440" text-anchor="middle">year</text>
<line x1="30" y1="464" x2="970" y2="464" stroke="var(--line-soft)" />
<text class="xs" x="30" y="484">LEGEND</text>
<rect x="96" y="472" width="12" height="12" fill="var(--hot-bg)" stroke="var(--hot-line)" />
<text class="xs" x="116" y="482">lone day band — full “Sep 21, 2026”</text>
<rect
x="400"
y="472"
width="12"
height="12"
fill="rgba(90,106,154,0.15)"
stroke="var(--dom-line)"
/>
<text class="xs" x="420" y="482">other shipped floors</text>
</svg>
</div>
<figcaption>
The floor measures the finest band of each zoom-ladder preset (<code>ZOOM_PRESETS</code>).
Multi-band presets sit lower because <code>dropRepeatedGranularity</code> leaves the day band as a
bare number. Standalone <code>week</code> and <code>month</code> still ship (96 px / 72 px) but
are not zoom steps.
</figcaption>
</figure>
</div>

## Header bands and dropped repeated granularity

A preset lists bands coarsest first. Left alone, every band carries its own full date format, so
`weekAndMonth` would write "Sep 2026" on the month row and "Sep 1, 2026" on the week row — the
month named twice.

`dropRepeatedGranularity(headers)` walks that list once. When an earlier band already states
`year` or `month`, it strips that field from later `Intl.DateTimeFormatOptions`. A callback format
(`formatWeekNumber`, `formatHour`) passes through. Set `repeatCoarserUnits: true` on one band to
opt that band out.

*Derived from `time/format.ts`, `layout/frame.ts` band loop.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 280"
role="img"
aria-labelledby="tl-granularity-title tl-granularity-desc"
>
<title id="tl-granularity-title">weekAndMonth labels before and after dropping repeated granularity</title>
<desc id="tl-granularity-desc">
Two stacked headers. The left pair repeats September and 2026 on both bands. The right
pair keeps the month band as Sep 2026 and the week band as the day number only.
</desc>
<text class="t" x="40" y="28">before — same format on both bands</text>
<rect class="bx warn" x="40" y="44" width="400" height="36" />
<text class="t" x="52" y="66">Sep 2026</text>
<rect class="bx warn" x="40" y="80" width="96" height="36" />
<text class="s" x="52" y="102">Sep 1, 2026</text>
<rect class="bx warn" x="136" y="80" width="96" height="36" />
<text class="s" x="148" y="102">Sep 8, 2026</text>
<rect class="bx warn" x="232" y="80" width="96" height="36" />
<text class="s" x="244" y="102">Sep 15, 2026</text>
<rect class="bx warn" x="328" y="80" width="112" height="36" />
<text class="s" x="340" y="102">Sep 22, 2026</text>
<text class="t" x="500" y="28">after — what ships</text>
<rect class="bx pure" x="500" y="44" width="420" height="36" />
<text class="t" x="512" y="66">Sep 2026</text>
<rect class="bx pure" x="500" y="80" width="96" height="36" />
<text class="s" x="512" y="102">1</text>
<rect class="bx pure" x="596" y="80" width="96" height="36" />
<text class="s" x="608" y="102">8</text>
<rect class="bx pure" x="692" y="80" width="96" height="36" />
<text class="s" x="704" y="102">15</text>
<rect class="bx hot" x="788" y="80" width="132" height="36" />
<text class="s hotink" x="800" y="102">22 — month above</text>
<text class="s" x="40" y="148">hour bands use formatHour, not Intl</text>
<text class="s" x="40" y="168">
en-US still zero-pads { hour: 'numeric', hour12: false }. formatHour prints 9:00.
</text>
<text class="xs" x="40" y="200">
Memo: WeakMap on the headers array so the stripped options object keeps one identity across
frames.
</text>
</svg>
</div>
<figcaption>
Try <code>weekAndMonth</code> or <code>weekMonthYear</code> on
<a href="https://github.com/Pawel-IT/FreeGantt/blob/main/harness/zoom.html">zoom.html</a>. The
coarse band still carries the year. The fine band no longer repeats it.
</figcaption>
</figure>
</div>

## Sticky labels inside a cell

A tick's true `x` is the calendar boundary in content pixels. For a year that started before the
dataset, that x sits left of the pane. The old paint put the label at that x, so
`overflow: hidden` on the header clipped it even while most of the cell was visible.

The frame now sets painted `x = max(tick.x, visible.x)` and shrinks `width` by the same delta. The
instant that drives the text does not change. Only where the label sits changes.

*Derived from `layout/frame.ts` `labelLeftClamp`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 360"
role="img"
aria-labelledby="tl-sticky-title tl-sticky-desc"
>
<title id="tl-sticky-title">Coarse tick label clamped to the pane left edge</title>
<desc id="tl-sticky-desc">
Two rows. The year cell starts off-screen. The unclamped label sits in the clipped region.
The clamped label sits at the visible left edge of the same cell.
</desc>
<text class="t" x="24" y="28">unclamped — label at true boundary</text>
<rect x="200" y="48" width="720" height="88" fill="none" stroke="var(--line)" stroke-dasharray="4 3" />
<text class="xs" x="208" y="64">visible pane</text>
<rect class="bx warn" x="40" y="80" width="760" height="40" />
<text class="t warnink" x="52" y="104">2025</text>
<text class="xs" x="40" y="156">true x is left of the clip · the reader never sees the year</text>
<text class="t" x="24" y="196">clamped — what ships</text>
<rect x="200" y="216" width="720" height="88" fill="none" stroke="var(--line)" stroke-dasharray="4 3" />
<text class="xs" x="208" y="232">visible pane</text>
<rect class="bx" x="40" y="248" width="760" height="40" />
<rect class="bx hot" x="200" y="248" width="200" height="40" />
<text class="t hotink" x="212" y="272">2025</text>
<text class="xs" x="24" y="336">
painted x = max(tick.x, visible.x) · width shrinks · instant (the year) is unchanged
</text>
</svg>
</div>
<figcaption>
Switch <a href="https://github.com/Pawel-IT/FreeGantt/blob/main/harness/zoom.html">zoom.html</a>
to the multi-year dataset and a three-band preset. Scroll horizontally. The year stays at the
left of its cell until the cell leaves the pane.
</figcaption>
</figure>
</div>

## Today line

`todayLine` defaults to `true`. `computeFrame` emits a `TodayLine` decoration only when `now()`
falls inside `scale.range`. The DOM backend reuses one `.fg-today-line` element and hides it when
the decoration is absent.

The sample fixture starts on 2026-09-01 so unit tests stay deterministic. If "today" is before
that start (or after the last entry under `range: 'fitDataset'`), the line is correctly missing.
That is not a paint bug. Use the multi-year dataset on
[`zoom.html`](https://github.com/Pawel-IT/FreeGantt/blob/main/harness/zoom.html) when you want the
line inside the range.

*Derived from `layout/frame.ts` decorations, `render/dom/index.ts`, `fixtures/sample-dataset.ts`.*

## CSS the library owns

The base stylesheet in `view/styles.ts` now owns tick overflow. The harness pages keep only
`font-size` on `.fg-tick`.

| Rule | Job |
| --- | --- |
| `.fg-header` | `position: sticky; top: 0`. Band count × `--fg-band-height` sets height. Rows scroll under the header. |
| `.fg-tick` | `box-sizing: border-box`, `padding: 0 4px`, `overflow: hidden`, `text-overflow: ellipsis`, left hairline. A label that is still too wide clips instead of covering its neighbour. |
| `.fg-today-line` | 1 px wide, `--fg-today-line-color`, `pointer-events: none`. |
| `.fg-timeline-pane` | Native scroller. `min-width: 0` so a zoom-out that hits the density floor can shrink the pane and scroll content instead of stretching the shell. |

The module and class map still covers construction and the notification machine. This page covers
only what the timeline shows after those passes.
