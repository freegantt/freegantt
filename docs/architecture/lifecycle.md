# Construction, render, notification

Three passes, in the order they run: what `new Gantt(…)` builds, what one `render()` does, and how
an edit reaches the screen. Counts on this page are measured, not estimated —
[Maintaining](./maintaining.md) holds the recipe that re-measures them.

## Construction: the call sequence

`new Gantt({ container, dataset })` forwards into one long `GanttShell` constructor. Everything
below happens synchronously, in this order, before that constructor returns. Beyond the diagram's
steps, the shell also builds the grid pane width, the container resize watch, the overlay and row
mount layers, the frame settings, the column chrome, the plugin registrations and their stylesheet,
the capability resolver, the gesture pipeline, the plugin runtime, the command registry, the keymap,
the collapse state, the entry selection, the roving focus, the live region, and the splitter,
row-twisty, keyboard and wheel navigation attachments.

*Derived from `harness/main.ts`, `api/gantt.ts`, `view/gantt-shell.ts`,
`layout/viewport/viewport.ts`, `layout/viewport/bound-value.ts`, `render/dom/index.ts`,
`view/capability.ts`, `view/gesture-pipeline.ts`, `view/tree-collapse.ts`,
`view/frame-settings.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 760"
role="img"
aria-labelledby="lc-seq-title lc-seq-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="lc-seq-title">Gantt construction sequence</title>
<desc id="lc-seq-desc">
Sequence diagram of Gantt construction from harness through GanttShell to Viewport and
scale/scroll models, showing 20 steps from container resolve to first frame flush.
</desc>
<defs>
<marker
id="a3"
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
<g>
<rect class="bx api" x="10" y="14" width="122" height="36" />
<text class="t" x="71" y="30" text-anchor="middle">harness</text>
<text class="s" x="71" y="43" text-anchor="middle">main.ts</text>
<rect class="bx api" x="152" y="14" width="116" height="36" />
<text class="t" x="210" y="30" text-anchor="middle">Gantt</text>
<text class="s" x="210" y="43" text-anchor="middle">api/gantt.ts</text>
<rect class="bx dom" x="292" y="14" width="160" height="36" />
<text class="t" x="372" y="30" text-anchor="middle">GanttShell</text>
<text class="s" x="372" y="43" text-anchor="middle">view/gantt-shell.ts</text>
<rect class="bx dom" x="470" y="14" width="152" height="36" />
<text class="t" x="546" y="30" text-anchor="middle">domBackend</text>
<text class="s" x="546" y="43" text-anchor="middle">render/dom/index.ts</text>
<rect class="bx pure" x="640" y="14" width="122" height="36" />
<text class="t" x="701" y="30" text-anchor="middle">Viewport</text>
<text class="s" x="701" y="43" text-anchor="middle">layout/viewport/</text>
<rect class="bx pure" x="784" y="14" width="166" height="36" />
<text class="t" x="867" y="30" text-anchor="middle">Scale + Scroll</text>
<text class="s" x="867" y="43" text-anchor="middle">the two shareable models</text>
</g>
<g class="life">
<line x1="71" y1="52" x2="71" y2="740" />
<line x1="210" y1="52" x2="210" y2="740" />
<line x1="372" y1="52" x2="372" y2="740" />
<line x1="546" y1="52" x2="546" y2="740" />
<line x1="701" y1="52" x2="701" y2="740" />
<line x1="867" y1="52" x2="867" y2="740" />
</g>
<!-- 1 -->
<g class="num">
<circle cx="8" cy="84" r="8" />
<text x="8" y="87" text-anchor="middle">1</text>
</g>
<line
class="edge"
x1="71"
y1="84"
x2="204"
y2="84"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="138" y="78" text-anchor="middle">new Gantt({container, dataset, …options})</text>
<!-- 2 -->
<g class="num">
<circle cx="8" cy="120" r="8" />
<text x="8" y="123" text-anchor="middle">2</text>
</g>
<line
class="edge"
x1="210"
y1="120"
x2="366"
y2="120"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="288" y="114" text-anchor="middle">new GanttShell(…)</text>
<!-- 3 self -->
<g class="num">
<circle cx="8" cy="156" r="8" />
<text x="8" y="159" text-anchor="middle">3</text>
</g>
<path class="edge" d="M372,150 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="154">resolveContainer — throws ContainerNotFoundError</text>
<!-- 4 self -->
<g class="num">
<circle cx="8" cy="188" r="8" />
<text x="8" y="191" text-anchor="middle">4</text>
</g>
<path class="edge" d="M372,182 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="186">ensureBaseStyles; new PaneLayout → grid / splitter / timeline</text>
<!-- 5 -->
<g class="num">
<circle cx="8" cy="220" r="8" />
<text x="8" y="223" text-anchor="middle">5</text>
</g>
<line
class="edge"
x1="372"
y1="220"
x2="695"
y2="220"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="533" y="214" text-anchor="middle">new Viewport({ scale?, scroll?, overscan? })</text>
<!-- 6 -->
<g class="num">
<circle cx="8" cy="252" r="8" />
<text x="8" y="255" text-anchor="middle">6</text>
</g>
<line
class="edge"
x1="701"
y1="252"
x2="861"
y2="252"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="781" y="246" text-anchor="middle">private defaults if omitted</text>
<!-- 7 -->
<g class="num">
<circle cx="8" cy="284" r="8" />
<text x="8" y="287" text-anchor="middle">7</text>
</g>
<line
class="edge"
x1="372"
y1="284"
x2="540"
y2="284"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="456" y="278" text-anchor="middle">createDomBackend()</text>
<!-- 8 -->
<g class="num">
<circle cx="8" cy="316" r="8" />
<text x="8" y="319" text-anchor="middle">8</text>
</g>
<line
class="edge"
x1="372"
y1="316"
x2="540"
y2="316"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="456" y="310" text-anchor="middle">mount({ grid, timeline })</text>
<!-- 9 self -->
<g class="num">
<circle cx="8" cy="348" r="8" />
<text x="8" y="351" text-anchor="middle">9</text>
</g>
<path class="edge" d="M372,342 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="346">attachScroll(timeline pane, viewport)</text>
<!-- 10 -->
<g class="num">
<circle cx="8" cy="380" r="8" />
<text x="8" y="383" text-anchor="middle">10</text>
</g>
<line
class="edge"
x1="372"
y1="380"
x2="695"
y2="380"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="533" y="374" text-anchor="middle">bind(dataset, onChange)</text>
<!-- 11 -->
<g class="num">
<circle cx="8" cy="412" r="8" />
<text x="8" y="415" text-anchor="middle">11</text>
</g>
<line
class="edge"
x1="701"
y1="412"
x2="861"
y2="412"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="781" y="406" text-anchor="middle">scale.bind, then scroll.bind</text>
<!-- 12 return -->
<g class="num">
<circle cx="8" cy="444" r="8" />
<text x="8" y="447" text-anchor="middle">12</text>
</g>
<line
class="edge ret"
x1="861"
y1="444"
x2="378"
y2="444"
marker-end="url(#a3)"
style="color: var(--smell-line)"
/>
<text class="warnink" x="620" y="432" text-anchor="middle">
onChange() ×2 — one from each bind, not batched
</text>
<text class="s" x="620" y="456" text-anchor="middle">
dropped by #phase: no frame request, no navigationChange
</text>
<!-- 13 self -->
<g class="num">
<circle cx="8" cy="484" r="8" />
<text x="8" y="487" text-anchor="middle">13</text>
</g>
<path class="edge" d="M372,478 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="482">subscribeToDatasetChanges — later commits request a frame</text>
<!-- 14 self -->
<g class="num">
<circle cx="8" cy="516" r="8" />
<text x="8" y="519" text-anchor="middle">14</text>
</g>
<path class="edge" d="M372,510 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="514">#applyPaneMeasurement(measureTimelinePane())</text>
<text class="s" x="424" y="528">re-reads the four --fg-* pixel properties, then sizes the rows' viewport</text>
<!-- 15 -->
<g class="num">
<circle cx="8" cy="556" r="8" />
<text x="8" y="559" text-anchor="middle">15</text>
</g>
<line
class="edge"
x1="372"
y1="556"
x2="695"
y2="556"
marker-end="url(#a3)"
style="color: var(--sub)"
/>
<text x="533" y="550" text-anchor="middle">setPaneSize(pane box − header height)</text>
<!-- 16 self -->
<g class="num">
<circle cx="8" cy="588" r="8" />
<text x="8" y="591" text-anchor="middle">16</text>
</g>
<path class="edge" d="M372,582 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="586">attachPaneSize(timeline); attachSplitter(splitter)</text>
<!-- 17 self -->
<g class="num">
<circle cx="8" cy="620" r="8" />
<text x="8" y="623" text-anchor="middle">17</text>
</g>
<path class="edge" d="M372,614 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="618">resolveCapabilities; new GesturePipeline + attachEntryGestures</text>
<!-- 18 self -->
<g class="num">
<circle cx="8" cy="652" r="8" />
<text x="8" y="655" text-anchor="middle">18</text>
</g>
<path class="edge" d="M372,646 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="650">new TreeCollapse; attachKeyboardNavigation; attachWheelNavigation</text>
<!-- 19 self -->
<g class="num">
<circle cx="8" cy="684" r="8" />
<text x="8" y="687" text-anchor="middle">19</text>
</g>
<path class="edge" d="M372,678 h44 v14 h-38" marker-end="url(#a3)" style="color: var(--sub)" />
<text x="424" y="682">datasetPlugins; plugins; zoomPresets; selection — all before frame 1</text>
<!-- 20 self -->
<g class="num">
<circle cx="8" cy="722" r="8" />
<text x="8" y="725" text-anchor="middle">20</text>
</g>
<rect class="bx" x="292" y="706" width="330" height="34" />
<text class="t" x="304" y="720">#phase = 'live'; #frames.flush()</text>
<text class="s" x="304" y="733">→ §2. One layout pass (measured).</text>
</svg>
</div>
<figcaption>
Diagram 1 — <code>new Gantt(...)</code>, synchronous, top to bottom. Amber = the two bind notifies
that <code>#phase</code> drops; the section under this diagram explains why there are two. Steps
17–18 build the capability resolver, gesture pipeline, collapse state and navigation. Step 19
installs every constructor-supplied plugin, keybinding, command and variant, so all of them reach
frame 1.
</figcaption>
</figure>
</div>

### Step 12: why one `bind()` delivers three notifications

The amber note says `onChange() ×2`. That surprises every new reader, so here is the whole story,
from the start. No knowledge of the code is assumed.

**A Gantt does not own its time scale or its scroll position.** Three small models own them.
`TimeScaleModel` answers "which instant sits at which pixel". A `ScrollAxis` answers "how far is
the content scrolled, and how far can it go" — for *one* direction; a Gantt holds two, `scroll.x`
and `scroll.y` (D-S6-1). All three are *shareable*: two Gantts may bind to the same instance, and
that is how `harness/scroll-sync.ts` makes two Gantts pan together, on one axis or both. `Viewport`
is the fan-in over the three, so `view/` holds one reaction instead of three.

**Every binding follows one rule: bind always notifies the newcomer.** When something binds, the
model calls it straight back. That first call is not an update. It *is* the newcomer's first
render, so it never waits for an open batch:

```ts
// src/layout/viewport/bound-value.ts — the mechanism both models share
bind(binding: Binding, onChange: () => void): BoundValueHandle {
  this.#bindings.set(binding, onChange);
  this.#resolved = undefined;
  const changed = this.#recordResolved();
  onChange(); // ← the newcomer hears about its own bind, always
  …
}
```

**One `Viewport.bind()` binds three models, and nothing wraps the three.** Each call reaches
`#notify`, and each `#notify` delivers straight through to the shell:

```ts
// src/layout/viewport/viewport.ts — inside bind()
const scaleHandle = bindTimeScale(this.scale, scaleBinding, this.#notify); // → onChange() #1
const scrollHandleX = bindScrollAxis(this.scroll.x, { content, pane }, this.#notify); // → onChange() #2
const scrollHandleY = bindScrollAxis(this.scroll.y, { content, pane }, this.#notify); // → onChange() #3
```

Compare that with every *later* write through the same handle. Each one wraps its calls in a
batch, so one caller-visible change costs exactly one notification:

```ts
// src/layout/viewport/viewport.ts — the handle bind() returns
setPaneSize: (size) => {
  this.#paneSize = size;
  this.#notifications.batch(() => {   // ← one delivery at the end of the batch
    scaleHandle.setPaneWidth(size.width);
    scrollHandleX.setPaneSize(size.width);
    scrollHandleY.setPaneSize(size.height);
  });
},
```

So the count is not a mystery: `bind()` is the one path on the handle with no batch around it.

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 320"
role="img"
aria-labelledby="lc-bind-title lc-bind-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="lc-bind-title">Why bind notifies three times and setPaneSize notifies once</title>
<desc id="lc-bind-desc">
Two rows. The top row shows bind calling bindTimeScale and bindScrollAxis for x and for y, each
firing its own notification, so the shell's onChange runs three times. The bottom row shows
setPaneSize wrapping the same three calls in one batch, so onChange runs once.
</desc>
<defs>
<marker
id="a6"
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
<!-- row A: bind -->
<text class="t" x="16" y="22">Viewport.bind(dataset, onChange) — no batch around the three</text>
<rect class="bx pure" x="16" y="34" width="260" height="30" />
<text class="s" x="28" y="53">bindTimeScale(scale, …, #notify)</text>
<rect class="bx pure" x="16" y="72" width="260" height="30" />
<text class="s" x="28" y="91">bindScrollAxis(scroll.x, …, #notify)</text>
<rect class="bx pure" x="16" y="110" width="260" height="30" />
<text class="s" x="28" y="129">bindScrollAxis(scroll.y, …, #notify)</text>
<line class="edge" x1="276" y1="49" x2="330" y2="49" marker-end="url(#a6)" style="color: var(--sub)" />
<line class="edge" x1="276" y1="87" x2="330" y2="87" marker-end="url(#a6)" style="color: var(--sub)" />
<line class="edge" x1="276" y1="125" x2="330" y2="125" marker-end="url(#a6)" style="color: var(--sub)" />
<rect class="bx warn" x="336" y="34" width="150" height="30" />
<text class="s" x="348" y="53">#notify() delivers</text>
<rect class="bx warn" x="336" y="72" width="150" height="30" />
<text class="s" x="348" y="91">#notify() delivers</text>
<rect class="bx warn" x="336" y="110" width="150" height="30" />
<text class="s" x="348" y="129">#notify() delivers</text>
<path class="edge" d="M486,49 H530 V55 H560" marker-end="url(#a6)" style="color: var(--smell-line)" />
<path class="edge" d="M486,87 H530 V85 H560" marker-end="url(#a6)" style="color: var(--smell-line)" />
<path class="edge" d="M486,125 H530 V115 H560" marker-end="url(#a6)" style="color: var(--smell-line)" />
<rect class="bx dom" x="566" y="30" width="200" height="110" />
<text class="t" x="578" y="52">GanttShell onChange()</text>
<text class="warnink" x="578" y="120">runs three times</text>
<text class="xs" x="782" y="72">one caller-visible event,</text>
<text class="xs" x="782" y="86">three deliveries</text>
<!-- row B: setPaneSize -->
<text class="t" x="16" y="180">handle.setPaneSize(size) — one batch around the same three</text>
<rect class="bx opt" x="16" y="192" width="260" height="104" />
<text class="s" x="28" y="208">#notifications.batch(() =&gt; {</text>
<rect class="bx pure" x="30" y="214" width="232" height="20" />
<text class="s" x="40" y="228">scaleHandle.setPaneWidth(w)</text>
<rect class="bx pure" x="30" y="238" width="232" height="20" />
<text class="s" x="40" y="252">scrollHandleX.setPaneSize(w)</text>
<rect class="bx pure" x="30" y="262" width="232" height="20" />
<text class="s" x="40" y="276">scrollHandleY.setPaneSize(h)</text>
<line class="edge" x1="276" y1="244" x2="330" y2="244" marker-end="url(#a6)" style="color: var(--sub)" />
<rect class="bx pure" x="336" y="228" width="150" height="32" />
<text class="s" x="348" y="248">#notify() delivers</text>
<line class="edge" x1="486" y1="244" x2="560" y2="244" marker-end="url(#a6)" style="color: var(--sub)" />
<rect class="bx dom" x="566" y="222" width="200" height="44" />
<text class="t" x="578" y="242">GanttShell onChange()</text>
<text class="s" x="578" y="258">runs once</text>
<text class="xs" x="782" y="242">the batch flushes at its</text>
<text class="xs" x="782" y="256">end, once, iff anything moved</text>
</svg>
</div>
<figcaption>
Diagram 2 — the same three sub-models, reached two ways. Amber = the unbatched three at step 12.
</figcaption>
</figure>
</div>

**Nobody outside the shell ever sees those three calls.** `bind()` runs in the constructor and
nowhere else, and the callback the shell passes in returns early for the whole of construction:

```ts
// src/view/gantt-shell.ts — step 10 of the diagram above
this.#viewportHandle = this.#viewport.bind(
  { entries: options.dataset.entries.all, timeZone: options.dataset.timeZone },
  () => {
    if (this.#phase === 'constructing') return; // ← all three bind-time calls stop here
    this.#frames.request();
    this.#emitNavigationChange();
  },
);
```

Measured on a three-entry dataset: constructing a `Gantt` delivers **three** bind-time notifications
and runs **one** `computeFrame`. A fourth notification follows that first frame, from the
`setContentSize` at the end of `render()`. That one arrives after `#phase` is `'live'`, so it does
what a notification normally does — it asks for the next frame.

### Why the order is what it is

| Step | The constraint that forces this position |
| --- | --- |
| 4 | **Styles and panes before paint.** `ensureBaseStyles` must run before `PaneLayout` inserts classed elements, or the first frame is unstyled. `mount` needs the grid and timeline panes that `PaneLayout` builds. |
| 7–8 | **Mount before bind.** Each model's `bind` notifies the newcomer at once. Those calls are dropped while wiring, but the render target must already exist for the deliberate first `flush()` at step 19. |
| 9 | Before `bind`, so `#scrollAttachment` is never `undefined` during a render. The timeline pane is the single native scroller. |
| 10–12 | `bind()` always notifies the newcomer, once per sub-model, with no `Viewport` batch around the three — [the section below](#step-12-why-one-bind-delivers-three-notifications) walks through why that is three. Those three `onChange`s land before `#viewportHandle` is assigned. `#phase` drops them, so none asks for a frame and none emits `navigationChange`. The first real frame is step 20. |
| 14–15 | One synchronous measurement, because a real `ResizeObserver`'s first callback is queued, not immediate. The viewport gets the *rows'* box, not the pane box: the header sticks to the pane's top and covers that band of rows for the whole scroll, so the measured header height comes off the height. Reporting the full box left the scroll model one header short, and the last row could then never scroll fully into view. All four `--fg-*` pixel properties are re-read here, not per render. |
| 17–18 | **Capabilities and gestures after the viewport.** The gesture pipeline needs the viewport's scale for draft math, and the capability resolver needs the consumer's `interactions` options which the shell has by then. Keyboard and wheel navigation sit at the end so the elements they attach to exist. |
| 19–20 | **Plugins before the first frame** (ADR 0019). A constructor-supplied plugin's variant, keybinding, command or selection has to reach frame 1, so the shell applies all of them through its own live setters, then flushes. `theme` is the one setting applied *after* the flush. |

## One render pass

`GanttShell.render()` builds one `LayoutInput` — what this frame contributes, merged with what
`FrameSettings` holds — runs one pure function, hands the frame to the backend, then pushes the
resulting extents back into the viewport.

*Derived from `view/gantt-shell.ts` `render()`, `view/frame-settings.ts`, `layout/frame.ts`,
`layout/frame-layout.ts`, `layout/rows/*`, `layout/bars/produce-bars.ts`,
`layout/bars/variants.ts`, `render/dom/index.ts` `sync()`, `view/scroll-attachment.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 580"
role="img"
aria-labelledby="lc-render-title lc-render-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="lc-render-title">One render pass</title>
<desc id="lc-render-desc">
Data flow of one render pass from GanttShell through computeFrame to the DOM backend sync.
</desc>
<defs>
<marker
id="a4"
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
<!-- col A: inputs -->
<rect class="bx dom" x="16" y="20" width="182" height="40" />
<text class="t" x="28" y="38">GanttShell.render()</text>
<text class="s" x="28" y="51">view/ — where DOM meets pure</text>
<rect class="bx pure" x="16" y="86" width="182" height="232" />
<text class="t" x="28" y="104">LayoutInput</text>
<text class="s" x="28" y="118">← #frameSettings</text>
<text class="s" x="28" y="132">&#160;&#160;.toLayoutInput(perFrame)</text>
<text class="xs" x="28" y="150">this frame contributes:</text>
<text class="s" x="28" y="164">entries · scale · preset</text>
<text class="s" x="28" y="178">visible · overscan · revision</text>
<text class="s" x="28" y="192">columns · collapsed</text>
<text class="s" x="28" y="206">variants · datasetRevision</text>
<text class="s" x="28" y="220">decorationProviders</text>
<text class="xs" x="28" y="238">FrameSettings holds:</text>
<text class="s" x="28" y="252">rowHeight · tickBoxFloorPx</text>
<text class="s" x="28" y="266">minBarWidthPx · barHeightPx</text>
<text class="s" x="28" y="280">rows · todayLine · dateLines</text>
<text class="s" x="28" y="294">locale? · fieldCompares</text>
<text class="s" x="28" y="308">fieldContext?</text>
<line
class="edge"
x1="107"
y1="60"
x2="107"
y2="80"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<!-- col B -->
<line
class="edge"
x1="198"
y1="140"
x2="228"
y2="140"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx pure" x="234" y="86" width="212" height="46" />
<text class="t" x="246" y="104">FrameLayout</text>
<text class="s" x="246" y="118">.computeFrame(input)</text>
<line
class="edge"
x1="322"
y1="132"
x2="322"
y2="152"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx pure" x="234" y="158" width="212" height="70" />
<text class="t" x="246" y="176">FrameMemory</text>
<text class="s" x="246" y="190">RowHeightIndex + per-row item memo</text>
<text class="s" x="246" y="206">reused across renders when inputs</text>
<text class="xs" x="246" y="220">did not change</text>
<line
class="edge"
x1="322"
y1="228"
x2="322"
y2="250"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx pure" x="234" y="256" width="212" height="128" />
<text class="t" x="246" y="274">computeFrame(input, heights)</text>
<text class="s" x="246" y="290">1) resolveRows — per rowSource</text>
<text class="s" x="246" y="305">2) produceItems — per variant</text>
<text class="s" x="246" y="320">3) cull v + h to the window</text>
<text class="s" x="246" y="335">4) header ticks; date-lines</text>
<text class="xs" x="246" y="372">rows → items, in order</text>
<!-- col C -->
<line
class="edge"
x1="446"
y1="320"
x2="482"
y2="320"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx pure" x="488" y="128" width="170" height="212" />
<text class="t" x="500" y="146">GeometryFrame</text>
<text class="s" x="500" y="163">revision · visible: Rect</text>
<text class="s" x="500" y="177">header.bands[]</text>
<text class="s" x="500" y="191">tickLines[] ← windowed</text>
<text class="s" x="500" y="205">rows[] ← windowed</text>
<text class="s" x="500" y="219">rowCount · tree ← FULL</text>
<text class="s" x="500" y="233">columns[] ← resolved</text>
<text class="s" x="500" y="247">bars[] ← produced</text>
<text class="s" x="500" y="261">links[] · decorations[]</text>
<text class="s" x="500" y="275">underBars[] · overBars[]</text>
<text class="s" x="500" y="289">contentWidth ← FULL</text>
<text class="s" x="500" y="303">contentHeight ← FULL</text>
<text class="xs" x="500" y="316">plain numbers only — no DOM,</text>
<text class="xs" x="500" y="327">no consumer output,</text>
<text class="xs" x="500" y="338">no hit-region index</text>
<!-- col D -->
<line
class="edge"
x1="658"
y1="180"
x2="694"
y2="180"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx dom" x="700" y="128" width="212" height="42" />
<text class="t" x="712" y="146">domBackend.sync(frame)</text>
<text class="s" x="712" y="160">no allocation beyond geoms</text>
<line
class="edge"
x1="788"
y1="170"
x2="788"
y2="190"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx dom" x="700" y="196" width="212" height="120" />
<text class="t" x="712" y="214">sync() keyed layers</text>
<text class="s" x="712" y="228">header bands + ticks</text>
<text class="s" x="712" y="241">grid header columns</text>
<text class="s" x="712" y="254">rows + cells; row bands</text>
<text class="s" x="712" y="267">bars (by id); links</text>
<text class="s" x="712" y="280">tick lines; date lines</text>
<text class="s" x="712" y="293">decorations under + over</text>
<text class="s" x="712" y="306">cursor line; grid translateY</text>
<line
class="edge"
x1="788"
y1="318"
x2="788"
y2="330"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx dom" x="700" y="334" width="212" height="46" />
<text class="t" x="712" y="352">contentSizer.transform</text>
<text class="s" x="712" y="366">gives the pane its scroll range</text>
<!-- feedback: setContentSize -->
<path
class="edge"
d="M740,380 v22 h-620 v-40"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<rect class="bx pure" x="300" y="386" width="330" height="34" />
<text class="t" x="312" y="401">#viewportHandle.setContentSize(…)</text>
<text class="s" x="312" y="414">→ Viewport.#contentSize → ScrollAxis binding.content</text>
<rect class="bx dom" x="16" y="424" width="182" height="60" />
<text class="t" x="28" y="442">FrameScheduler.request()</text>
<text class="s" x="28" y="456">max changed → notify →</text>
<text class="s" x="28" y="469">shell requests a later frame</text>
<text class="s" x="28" y="480">not nested in this pass</text>
<path
class="edge"
d="M107,424 V412 H8 V30 H12"
marker-end="url(#a4)"
style="color: var(--sub)"
/>
<!-- writePosition -->
<rect class="bx dom" x="300" y="440" width="330" height="44" />
<text class="t" x="312" y="458">scrollAttachment.writePosition()</text>
<text class="s" x="312" y="472">element.scrollLeft/Top ← visible.x/y, ε-filtered</text>
<rect class="bx dom" x="300" y="492" width="330" height="62" />
<text class="t" x="312" y="510">the shell's own tail, in order</text>
<text class="s" x="312" y="524">gridPattern · setGridSize — both before sync()</text>
<text class="s" x="312" y="537">band count moved → re-size the rows' viewport</text>
<text class="s" x="312" y="550">then setContentSize · writePosition · rovingFocus</text>
<!-- gesture preview -->
<rect class="bx dom" x="16" y="508" width="182" height="56" />
<text class="t" x="28" y="526">GesturePipeline.preview()</text>
<text class="s" x="28" y="540">class toggles + transforms</text>
<text class="s" x="28" y="552">never builds a frame (I13)</text>
<text class="xs" x="700" y="470">This pass is synchronous.</text>
<text class="xs" x="700" y="484">A content-size notify schedules the next</text>
<text class="xs" x="700" y="498">frame through FrameScheduler (rAF).</text>
</svg>
</div>
<figcaption>
Diagram 3 — one <code>render()</code>. Green = pure, blue = DOM. A content-size notify requests a
later frame; it does not re-enter this pass. The hot gesture path (bottom-left) never touches the
frame pipeline.
</figcaption>
</figure>
</div>

### The pipeline inside `computeFrame`

The layout pass is not a flat row-per-entry walk. Between input and culling it resolves rows from
a row source, then asks one registry what each Entry draws:

1. **resolveRows** turns the configured `rowSource` (entries, group, custom) into an ordered list
   of rows, each stamped with a sequential index (`resolve-rows.ts`).
2. **produceBarsForRow** turns each row's entries into `Bar`s. An Entry carries no stored
   classification, so nothing dispatches on a type tag. The variant registry resolves one variant
   per Entry, and that variant's own producer builds the Bars (`bars/produce-bars.ts`,
   `bars/variants.ts`). The walk runs newest-first — the consumer's rules, then a plugin's, then
   core's two — and stops at the first `when` that answers yes. Core's `leaf` carries no `when`, so
   every row resolves. A variant with no producer of its own draws one Bar over the Entry's whole
   span.
3. **Cull** then trims to the visible window, and **header/date-line** emission closes the pass.

#### The coordinate rules `computeFrame` keeps

- **Windowed vs. full.** `rows` and `items` hold only what survived culling;
  `contentWidth`/`contentHeight` are *always* the full extent. That split is what lets the scroll
  model compute a real maximum from a frame that drew twelve rows out of two thousand.
- **Zero disables culling.** A zero `visible.height` means "no culling at all", not "an empty
  window" — and likewise for width. Without that rule an unmeasured container (detached,
  `display:none`, pre-paint) would silently render nothing.
- **Overscan is in index space vertically, pixels horizontally.** Vertical overscan counts *rows*
  and goes through the height index, so it stays correct as row heights vary. Horizontal has no
  rows to count, so it is a pixel buffer.
- **Rows are culled vertically only.** A row whose item is off-screen horizontally is still
  emitted — the grid pane needs its label.

## The notification machine

Four classes, layered, each one strictly smaller than the one above. This is the most intricate
part of the codebase and the part most worth understanding before changing anything in
`layout/viewport/`.

*Derived from `layout/viewport/batched-notifier.ts`, `bound-value.ts`, `time-scale-model.ts`,
`scroll-axis.ts`, `viewport.ts`.*

:::note The one contract everything here implements
*Bind always notifies the newcomer; every other notification fires if and only if the resolved
value actually changed.* A newcomer's notification *is* its first render, so it does not wait for
an open batch. A departing binding is never notified of its own departure; the survivors are, if
the value moved without it.
:::

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 540"
role="img"
aria-labelledby="lc-notify-title lc-notify-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="lc-notify-title">Binding and notification topology</title>
<desc id="lc-notify-desc">
Two Gantts sharing TimeScaleModel and both ScrollAxis instances, one per direction, showing
BoundValue and BatchedNotifier layers.
</desc>
<defs>
<marker
id="a5"
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
<!-- shells -->
<rect class="bx dom" x="16" y="16" width="168" height="44" />
<text class="t" x="28" y="34">GanttShell A</text>
<text class="s" x="28" y="48">live: #frames.request()</text>
<rect class="bx dom" x="776" y="16" width="168" height="44" />
<text class="t" x="788" y="34">GanttShell B</text>
<text class="s" x="788" y="48">own container, own backend</text>
<!-- viewports -->
<rect class="bx pure" x="16" y="96" width="168" height="104" />
<text class="t" x="28" y="114">Viewport A</text>
<text class="s" x="28" y="130">#paneSize · #contentSize</text>
<text class="s" x="28" y="144">#overscan</text>
<text class="s" x="28" y="158">BatchedNotifier</text>
<text class="xs" x="28" y="176">SINGLE-subscriber:</text>
<text class="xs" x="28" y="189">a 2nd bind() throws</text>
<rect class="bx pure" x="776" y="96" width="168" height="104" />
<text class="t" x="788" y="114">Viewport B</text>
<text class="s" x="788" y="130">its own paneSize /</text>
<text class="s" x="788" y="144">contentSize / overscan</text>
<text class="xs" x="788" y="164">Fan-in exists so view/</text>
<text class="xs" x="788" y="177">holds ONE reaction,</text>
<text class="xs" x="788" y="190">not one per model</text>
<path class="edge ret" d="M100,96 V68" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="106" y="84">onChange()</text>
<path class="edge ret" d="M860,96 V68" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="866" y="84">onChange()</text>
<!-- shared models -->
<rect class="bx pure" x="324" y="86" width="312" height="110" />
<text class="t" x="336" y="106">TimeScaleModel — SHAREABLE</text>
<text class="s" x="336" y="122">intent: preset (dayPreset) · range ('fitDataset')</text>
<rect class="bx" x="336" y="130" width="288" height="28" />
<text class="s" x="346" y="149">BoundValue&lt;ScaleBinding, TimeScaleOptions&gt;</text>
<text class="s" x="336" y="174">resolve: zone · narrowest pane · min start/max end</text>
<text class="s" x="336" y="188">equals: zone + range.start + range.end + pxPerMs</text>
<rect class="bx pure" x="324" y="226" width="312" height="110" />
<text class="t" x="336" y="246">ScrollAxis ×2 (x, y) — SHAREABLE</text>
<text class="s" x="336" y="262">each owns ONE shared position, frozen on write</text>
<rect class="bx" x="336" y="270" width="288" height="28" />
<text class="s" x="346" y="289">BoundValue&lt;ScrollAxisBinding, ScrollAxisState&gt;</text>
<text class="s" x="336" y="314">resolve: max = loosest (content − pane), per axis</text>
<text class="s" x="336" y="328">equals: position + max</text>
<!-- BoundValue internals -->
<rect class="bx" x="324" y="372" width="312" height="112" />
<text class="t" x="336" y="392">BoundValue&lt;B, V&gt; — the shared mechanism</text>
<text class="s" x="336" y="410">#bindings: Map&lt;B, onChange&gt; ← ONE map, two jobs</text>
<text class="s" x="336" y="424">#resolved: V | undefined ← memo, identity-stable</text>
<text class="s" x="336" y="438">#notified: { value: V } | undefined ← boxed, so</text>
<text class="s" x="350" y="451">"never notified" ≠ any possible V</text>
<rect class="bx" x="336" y="456" width="288" height="20" />
<text class="s" x="346" y="470">BatchedNotifier: #depth, #pending, finally-flush</text>
<path class="edge soft" d="M480,336 V368" marker-end="url(#a5)" style="color: var(--line)" />
<text class="xs" x="490" y="358">both models delegate to</text>
<!-- binding arrows, left -->
<path class="edge" d="M184,124 H318" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="190" y="118">bind · setPaneWidth</text>
<path class="edge ret" d="M318,150 H190" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="190" y="166">↩ #notify</text>
<path class="edge" d="M184,262 H318" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="190" y="256">bind · setPaneSize</text>
<path class="edge ret" d="M318,288 H190" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="190" y="304">setContentSize ↕</text>
<!-- binding arrows, right -->
<path class="edge" d="M776,124 H642" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="770" y="118" text-anchor="end">same two models</text>
<path class="edge ret" d="M642,150 H770" marker-end="url(#a5)" style="color: var(--sub)" />
<path class="edge" d="M776,262 H642" marker-end="url(#a5)" style="color: var(--sub)" />
<text class="xs" x="770" y="256" text-anchor="end">a second binding each</text>
<path class="edge ret" d="M642,288 H770" marker-end="url(#a5)" style="color: var(--sub)" />
<!-- side prose -->
<text class="xs" x="16" y="356">Sharing a TimeScaleModel syncs x.</text>
<text class="xs" x="16" y="370">Sharing scroll.x or scroll.y syncs</text>
<text class="xs" x="16" y="384">that axis only (D-S6-1). Sharing a</text>
<text class="xs" x="16" y="398">Viewport is an error — it holds ONE</text>
<text class="xs" x="16" y="412">Gantt's own measured boxes.</text>
<text class="xs" x="664" y="356">Copy-at-bind everywhere: each model</text>
<text class="xs" x="664" y="370">keeps its OWN mutable copy of what a</text>
<text class="xs" x="664" y="384">caller supplied, so a caller holding a</text>
<text class="xs" x="664" y="398">reference cannot change inputs behind</text>
<text class="xs" x="664" y="412">its back. The handle is the only mutator.</text>
</svg>
</div>
<figcaption>
Diagram 4 — two Gantts sharing one <code>TimeScaleModel</code> and both
<code>ScrollAxis</code> instances (exactly what <code>harness/scroll-sync.ts</code>'s both-axis
pair builds). Dashed = notification, solid = a call in.
</figcaption>
</figure>
</div>

### The four layers, smallest first

| Class | Knows about | Deliberately does *not* know about |
| --- | --- | --- |
| `BatchedNotifier` | a depth counter, a pending flag, one `deliver` callback | bindings, values, what "changed" means. It is the *whole* batching mechanism and nothing else. |
| `BoundValue<B,V>` | the binding set, the memoized resolved value, the last-notified value, and the notify-iff-changed rule | time, scroll, pixels. It takes `resolve` and `equals` as a contract and has no opinion on either. |
| `TimeScaleModel` / `ScrollAxis` | what to resolve from a binding set, and what counts as a change | each other, and the DOM. They differ *only* in those two functions. |
| `Viewport` | one Gantt's pane size, content size and overscan; fans all three models into one reaction | how any model resolves anything. It uses `BatchedNotifier` alone — it has one subscriber and no value of its own to compare, so `BoundValue`'s comparison half would be a capability it must not have. |

#### Where the batches nest

```
Viewport.batch(run)
  └─ Viewport.#notifications.batch(          // coalesce the consumer reaction
       scale.batch(                          // coalesce within TimeScaleModel
         scroll.x.batch(                     // coalesce within ScrollAxis x
           scroll.y.batch(run))))            // coalesce within ScrollAxis y

Viewport.setPaneSize(size)                   // one measurement, three models
  └─ #notifications.batch(() => {
       scaleHandle.setPaneWidth(size.width)  // may notify
       scrollHandleX.setPaneSize(size.width) // may notify
       scrollHandleY.setPaneSize(size.height)// may notify
     })                                      // → at most ONE render()
```

Without `Viewport`'s own batching layer, a single resize would deliver three notifications for one
caller-visible change: the three models dedupe within themselves, but none knows the others were
touched by the same call.
