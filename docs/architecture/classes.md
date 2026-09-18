# Class map, layer by layer

What each class owns, what it exposes, and who calls it — grouped by layer, DOM-free layers
first. For when these run, read [Lifecycle](./lifecycle.md); for the file each one lives in, read
[File inventory](./files.md).

## `layout/` & `view/`

*Derived from `src/layout/**`, `src/view/**`.*

### `layout/` — pure

#### Viewport — class

*`layout/viewport/viewport.ts`*

One Gantt's whole view state: which slice of content is on screen, at what zoom, with what
buffer. The single object `view/` holds.

- **scale / scroll** — The two models, public and readonly — supplied, or private defaults.
- **bind(dataset, onChange)** — Binds both models with one shared `#notify`. Throws
  `FreeGanttError('viewport-already-bound')` on a second call.
- **get visible: Rect** — The culling window, clamped against *this* Gantt's extents — not the
  shared `scroll.state.max`.
- **get timeScale / preset** — Resolved and ready for `LayoutInput`; the shell never reaches
  through to `scale.scale`.
- **get/set overscan** — Live-reconfigurable, notifies iff actually changed. Not on public
  `GanttOptions` (issue #84).
- **batch(run)** — Nests all three notifiers.

#### TimeScaleModel — class

*`layout/viewport/time-scale-model.ts`*

Shareable x-axis. Takes *intent*; derives zone, span and pixel density from whoever binds to it.
Two Gantts, one instance ⇒ x-synced with no event plumbing.

- **#resolve(bindings)** — One pass accumulating three things: zone (first binding wins), the
  *narrowest* measured pane, and — for `range: 'fitDataset'` — min start / max end across every
  bound dataset.
- **get scale: TimeScale** — Memoized on the *identity* of the resolved options object.
- **bind() → ScaleBindingHandle** — `unbind()`, `setPaneWidth(w)`. Copy-at-bind.

#### ScrollAxis — class

*`layout/viewport/scroll-axis.ts`*

Shareable one-direction scroll position (D-S6-1). Owns *one* shared position for *one* axis; each
bound Gantt clamps it locally to its own content. A Gantt holds two, `{ x, y }` — sharing an
instance as one Gantt's `x` and another's `x` syncs that direction only.

- **panTo(position)** — Clamps to `[0, max]` at write time and nowhere else.
- **get state: ScrollAxisState** — `{ position, max }` together, frozen.
- **`bindScrollAxis(axis, binding, onChange)` → ScrollAxisBindingHandle** — free function, not a
  class method (ADR 0007): `unbind()`, `setContentSize()`, `setPaneSize()`.

#### BoundValue\<B, V\> — class

*`layout/viewport/bound-value.ts`*

The binding side both models share. Scoped to `layout/viewport/` on purpose — it must not grow
into a general reactivity primitive.

- **#bindings: Map\<B, () =\> void\>** — One collection for both jobs: iterate keys to resolve,
  values to notify.
- **#notified: { value: V } | undefined** — Boxed so "nothing has been notified yet" is
  distinguishable from every possible `V`.

#### FrameLayout — class

*`layout/frame-layout.ts`*

The stateful wrapper that keeps the row-height index and per-row item memo alive across renders.
The shell states what to draw; the memory never crosses into `view/`.

- **#memory: FrameMemory** — Holds one layout pass's cross-render memory — the
  `RowHeightIndex` plus the per-row item memo `Map`.

#### FrameMemory — class

*`layout/frame-memory.ts`*

The cross-render memory of one layout pass. Kept behind `FrameLayout` so a later frame reuses
row-height sums and produced items where the inputs did not change.

- **RowHeightIndex** — Lazy prefix sums with binary search for `indexAtY`.
- **Map of per-row item memo** — Per-row produced items, reused when the row's content is
  unchanged.

#### PrefixSumHeightIndex — class

*`layout/row-height-index.ts`*

Lazy prefix sums, cached, with binary search for `indexAtY`. `#validUpTo` tracks how far the sums
are computed, so a partial invalidation recomputes only the suffix.

- **topAt(i) / totalHeight** — Fill the cache up to what was asked and no further.
- **indexAtY(y)** — Binary search. This is what bounds `computeFrame`'s row scan.
- **heightAt / invalidateFrom** — Interface complete, zero production callers today.

#### computeFrame() — function

*`layout/frame.ts`*

The full layout pass. Pure, stateless. Resolves rows → produces items → culls to the window →
emits header ticks and date-line decorations.

- **heights = new PrefixSumHeightIndex(…)** — A default parameter, so a caller with nothing to
  remember gets an index built and discarded within the call. `FrameLayout` is the only
  production caller that passes one.
- **overflowCount** — Counts rows already emitted past the window bottom and stops after
  `verticalRows` of them.

#### produceBarsForRow() — function

*`layout/bars/produce-bars.ts`*

Per-row bar production. An Entry carries no stored classification, so nothing dispatches on a type
tag: the variant registry resolves one variant per Entry, and that variant's own producer builds the
Bars (ADR 0018). Header rows produce none.

- **resolveBars(entry, registry)** — One resolution, one producer call, so no losing candidate's
  Bars are ever built and thrown away. A variant with no producer of its own draws one Bar over
  the Entry's whole span, so this never answers "nothing" for a variant the registry knows.
- **VariantRegistry.resolveFor(entry)** — Walks newest-first: the consumer's rules, then a
  plugin's, then core's two. It stops at the first `when` that answers yes. Core's `leaf` carries
  no `when`, so every row resolves. Structure comes off the Entry itself (`entry.hasChildren`,
  ADR 0017) — never an `if (kind === …)` chain.

#### resolveRows() — function

*`layout/rows/resolve-rows.ts`*

Dispatches to the correct row source based on `source.source`: entries (flat or tree), group
(`groupBy` buckets), or custom (consumer `resolve()` callback). Each resolved row gets a
sequential index.

- **EntriesRowSource** — Flat maps each entry one-to-one; tree does a depth-first walk using
  `parentId` (`entries-source.ts`).
- **GroupRowSource** — Buckets entries by a consumer `groupBy`, emitting header rows then members
  (`group-source.ts`).
- **CustomRowSource** — Adapts a consumer `CustomRow[]` (`custom-source.ts`).

#### draftForMove() / draftForResize() — function

*`layout/gesture-draft.ts`*

Pure gesture math for drag previews — `draftForMove`, `draftForResize`, `previewOffsets`,
`cursorLabelForX`. All date computation stays here so `interaction/` performs no arithmetic.

#### resolveDateLines() — function

*`layout/date-line.ts`*

Resolves the today-line and authored date lines into positioned `DateLine` decorations, consumed
by the render backend.

#### ResolvedColumn — types

*`layout/column.ts`*

Pure data types for the grid-column paint shape (`FrameColumn`, `ResolvedColumn`,
`FieldCompare`) and its locale-bound formatter. Carries presentation only — grid columns show
fields; they do not declare them (ADR 0005).

### `view/` — DOM

#### GanttShell — class

*`view/gantt-shell.ts`*

The composition root, and the only class in `src/` that holds references to the backend,
viewport, layout, gesture pipeline, plugin runtime, collapse state, and the event bus.

- **#phase: 'constructing' | 'live'** — `'constructing'` until pane-size wiring completes;
  drops the two synchronous `onChange`s from `scale.bind` and `scroll.bind` and short-circuits
  premature `render()` calls. Becomes `'live'` when wiring is done.
- **#applyPaneMeasurement(size)** — One measurement pushed to everything it feeds.
- **render()** — Gather → `computeFrame` → `backend.sync` → `setContentSize` →
  `writePosition`. One pass per call.
- **live properties** — Every config key a live-reconfigurable property: preset, range,
  gridColumns, rowSource, collapsed, selection, locale, theme, todayLine, interactions, plugins,
  commands, viewportGestures, …
- **installPlugin / uninstallPlugin** — Forwards to `PluginRuntime`. One occupant per plugin id.
- **destroy()** — Idempotent. Detaches the attachments, unbinds the viewport, destroys the
  backend, clears the container.

#### attachScroll() — function

*`view/scroll-attachment.ts`*

The one file exempted from `no-scroll-outside-scroll-attachment`. Owns no binding — it only reads
`viewport.visible` and reads/writes the element.

- **EPSILON = 1** — Tolerates fractional `scrollTop` and filters the echo so a model-driven
  write does not bounce back as another `panTo`.
- **writePosition()** — Called by `render()` **after** `backend.sync()`.

#### attachPaneSize() — function

*`view/pane-size-attachment.ts`*

The only file that observes element size. Reports a box and stops — no pixel math, no scale
awareness, which is what keeps I12 whole.

- **entries[entries.length - 1]** — A resize burst can deliver several entries for one target;
  only the last reflects the settled box.

#### attachSplitter() — function

*`view/splitter.ts`*

Pointer-drag handler on the splitter chrome that resizes the grid pane relative to the timeline
pane. Dispatches through the shell's `gridWidth` live property.

#### ensureBaseStyles() — function

*`view/styles.ts`*

Idempotently injects the library's base stylesheet once per `document`, scoped to the `--fg-*`
token set plus the `prefers-color-scheme` dark arm. A consumer overrides tokens in their own CSS;
they never edit this sheet.

#### FrameScheduler — class

*`view/frame-scheduler.ts`*

Coalesces render requests into at most one `requestAnimationFrame` per tick. The throttle between
"a change happened" and "a frame drew"; keeps bursty commits off the hot path.

#### subscribeToDatasetChanges() — function

*`view/dataset-change-subscription.ts`*

Bridges the dataset's `change` event into the shell's render pipeline — `FrameScheduler.request()`.
Editing after mount renders on the next frame with no extra call.

#### resolveCapabilities() — function

*`view/capability.ts`*

Merges the consumer's `Interactions` overrides with the per-kind default table and returns a
`Capabilities` object with `can(capability, entry)`. One resolution gates both gestures and
affordances (invariant I14).

#### projectAffordances() — function

*`view/affordance-projection.ts`*

Pure projection of hovered/movable/resizable paint tokens from hover, selection, and capability
resolution. Feeds the hot path's class toggles — never a frame rebuild.

#### GesturePipeline — class

*`view/gesture-pipeline.ts`*

Owns the full gesture lifecycle for move/resize — entry resolution, draft math from
`layout/gesture-draft.ts`, preview rAF coalescing, snap resolution, and a commit pipeline with
sync/async veto. Implements `EntryGestureContext` for `interaction/` to drive.

#### TreeCollapse — class

*`view/tree-collapse.ts`*

Holds collapsed `RowId`s as per-Gantt view state, plus the tree-arrow and ancestor-expand policy.
Propose/commit two-step, so a `beforeCollapseChange` veto can cancel the commit. The payload type
`CollapseChange` lives beside it in `view/collapse-state.ts`.

#### attachRowTwisty() — function

*`view/attach-row-twisty.ts`*

Grid-pane click on a row twisty toggles collapse. Lives here, not in `interaction/`: collapse is
viewport state, not a data gesture. Delegates hit testing to `render/dom/row-twisty.ts`'s
`rowIdFromTwistyClick`.

#### attachKeyboardNavigation() / attachWheelNavigation() — functions

*`view/keyboard-navigation.ts` · `view/wheel-navigation.ts`*

Keydown handler for viewport navigation when nothing is selected; ctrl/cmd+wheel zoom and
shift+wheel pan via `resolveViewportGestures()`'s on/off flags.

#### EventBus / GanttEventMap — types

*`view/event-bus.ts`*

Declares the ten-plus Gantt event names and payload types (`entryMove`, `selectionChange`,
`collapseChange`, `navigationChange`, …) and re-exports the generic `EventBus` mechanism from
`data/event-bus.ts`.

#### EntryGestureContext — interface

*`view/entry-gesture-context.ts`*

The type-seam between `view/` (the shell realises it) and `interaction/` (which drives it).
`interaction/` names pointer events and session lifecycle only — no layout or arithmetic.

## `time/` & `model/`

*Derived from `src/time/**`, `src/model/**`, `docs/adr/0001`.*

### The time pipeline

Everything that turns a date into a pixel goes left to right through here. Nothing outside
`time/` is allowed to shortcut it.

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 400"
role="img"
aria-labelledby="cls-time-title cls-time-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="cls-time-title">The time subsystem</title>
<desc id="cls-time-desc">
Pipeline from temporal-polyfill through zone operations to scale and preset resolution.
</desc>
<defs>
<marker
id="a7"
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
<rect class="bx" x="16" y="24" width="184" height="100" />
<text class="t" x="28" y="42">temporal-polyfill/fns</text>
<text class="s" x="28" y="58">Instant · PlainDate ·</text>
<text class="s" x="28" y="71">ZonedDateTime</text>
<text class="xs" x="28" y="90">One of exactly TWO runtime</text>
<text class="xs" x="28" y="102">deps. Confined to zone.ts —</text>
<text class="xs" x="28" y="114">no other file may import it.</text>
<path class="edge" d="M200,74 H222" marker-end="url(#a7)" style="color: var(--sub)" />
<rect class="bx pure" x="228" y="24" width="268" height="196" />
<text class="t" x="240" y="42">time/zone.ts</text>
<text class="s" x="240" y="58">UNITS: Record&lt;TimeUnit, UnitOps&gt;</text>
<rect class="bx" x="240" y="66" width="244" height="100" />
<text class="s" x="250" y="82">ms addMs identity</text>
<text class="s" x="250" y="96">m addMs·MINUTE startOfMinute</text>
<text class="s" x="250" y="110">h addMs·HOUR startOfHour</text>
<text class="s" x="250" y="124">d addDays startOfDay</text>
<text class="s" x="250" y="138">w addDays×7 startOfWeek</text>
<text class="s" x="250" y="152">M/y addMonths/Years startOfMonth/Year</text>
<text class="s" x="240" y="182">stepBy() ↑step startOf() ↑floor</text>
<text class="xs" x="240" y="200">One table ⇒ the two can never disagree on</text>
<text class="xs" x="240" y="212">which units are supported.</text>
<path class="edge" d="M496,110 H518" marker-end="url(#a7)" style="color: var(--sub)" />
<rect class="bx pure" x="524" y="24" width="236" height="196" />
<text class="t" x="536" y="42">time/scale.ts — createTimeScale</text>
<text class="s" x="536" y="60">xForInstant(i) → px</text>
<text class="s" x="536" y="74">instantForX(x) → Instant</text>
<text class="s" x="536" y="88">widthForDuration(d, at)</text>
<text class="s" x="536" y="102">ticks(step, span) → Tick[]</text>
<text class="s" x="536" y="116">contentWidth</text>
<text class="xs" x="536" y="136">instantForX ROUNDS: pixels do not</text>
<text class="xs" x="536" y="148">divide evenly into ms, and Temporal</text>
<text class="xs" x="536" y="160">rejects a fractional epoch ms.</text>
<text class="xs" x="536" y="180">ticks() emits the cell COVERING span.x</text>
<text class="xs" x="536" y="192">even when its own x is left of it.</text>
<path class="edge" d="M760,74 H782" marker-end="url(#a7)" style="color: var(--sub)" />
<rect class="bx pure" x="788" y="24" width="156" height="130" />
<text class="t" x="800" y="42">ViewPreset ×9</text>
<text class="s" x="800" y="60">ZOOM_PRESETS ladder</text>
<text class="s" x="800" y="74">fine hour → coarse year</text>
<text class="s" x="800" y="88">plus 5 single-band ids</text>
<text class="xs" x="800" y="108">Deep-FROZEN: a shipped</text>
<text class="xs" x="800" y="120">preset is a value, not a</text>
<text class="xs" x="800" y="132">shared mutable singleton</text>
<text class="xs" x="800" y="144">(I2).</text>
<path
class="edge soft"
d="M580,220 V234 H160 V252"
marker-end="url(#a7)"
style="color: var(--line)"
/>
<path class="edge soft" d="M362,220 V252" marker-end="url(#a7)" style="color: var(--line)" />
<path
class="edge soft"
d="M440,220 V244 H800 V252"
marker-end="url(#a7)"
style="color: var(--line)"
/>
<rect class="bx" x="16" y="256" width="288" height="120" />
<text class="t" x="28" y="276">pxPerMsForPreset(zone, preset, at)</text>
<text class="s" x="28" y="294">preferredTickWidthPx / tick's real ms</text>
<text class="xs" x="28" y="314">The zoom a preset implies ON ITS OWN — what</text>
<text class="xs" x="28" y="326">a scale resolves to when there is no measured</text>
<text class="xs" x="28" y="338">viewport to fit into. An unmeasured container is</text>
<text class="xs" x="28" y="350">therefore not a special case needing an</text>
<text class="xs" x="28" y="362">invented minimum width.</text>
<rect class="bx" x="336" y="256" width="288" height="120" />
<text class="t" x="348" y="276">Calendar stepping is not 86 400 000</text>
<text class="xs" x="348" y="296">A day tick is 23 or 25 hours across a DST</text>
<text class="xs" x="348" y="308">transition. Jan 31 + 1 month clamps to Feb 28.</text>
<text class="xs" x="348" y="328">DST fold and gap resolve via Temporal's explicit</text>
<text class="xs" x="348" y="340">'compatible' rule — the earlier offset for an</text>
<text class="xs" x="348" y="352">ambiguous time, shift-forward for a nonexistent</text>
<text class="xs" x="348" y="364">one. Both were undefined before.</text>
<rect class="bx warn" x="656" y="256" width="288" height="120" />
<text class="warnink" x="668" y="276">diffDays goes through PlainDate</text>
<text class="xs" x="668" y="296">temporal-polyfill@1.0.4's ZONED day-unit diff</text>
<text class="xs" x="668" y="308">throws for EVERY zone — a packaging bug in that</text>
<text class="xs" x="668" y="320">build, not an environment quirk.</text>
<text class="xs" x="668" y="340">PlainDate.diffDays is unaffected, and is exact</text>
<text class="xs" x="668" y="352">here because both operands are already calendar</text>
<text class="xs" x="668" y="364">day-starts. Re-check on upgrade.</text>
</svg>
</div>
<figcaption>
Diagram 4 — <code>time/</code>. Amber = a vendored workaround with an expiry condition.
</figcaption>
</figure>
</div>

Two additions round out the layer without touching the pipeline above: `time/presets.ts` (the
deep-frozen preset ladder this diagram references top-right) and `time/snap.ts` (where a drag's
committed value snaps, pure and driven by the live preset).

### `model/` — pure

Eighteen files, all types, plus the id helpers and the `FreeGanttError` family. That is the entire
runtime — the layer exists so `layout/`, `data/`, `render/` and `view/` share one vocabulary
without depending on each other.

| Type | Shape | The rule it encodes |
| --- | --- | --- |
| `Instant` | `number & {__brand}` | Epoch ms. Branded so a naked number cannot be passed as a date by accident. |
| `TimeSpan` | `{ start, end }` | Half-open `[start, end)` in storage. Display is inclusive, via one formatting helper — never an inline `end - 1`. |
| `EntryId` / `RowId` / `BarId` / `ChangeSetId` | `string & {__brand}` | Four distinct brands over `string`, so a row id cannot be used where a bar id belongs. |
| `Entry` | `{ id, name?, start?, end?, read(), duration(), hasChildren, children(), parent(), descendants(), depth, toInput() }` | The authored record, and it answers questions about itself (ADR 0017). No stored classification: an Entry derives when it has children. `start`/`end` are absent together when it does not span (ADR 0012); a spanning Entry draws one Bar, on the row its `parentId` names (ADR 0027). `read(key)` is the one by-key value door — a core key, a `props` key, or a `compute` Field. |
| `Field` | `{ key, type?, rollUp?, editable?, column?, … }` **or** `{ key, compute, … }` | What a value *is* (ADR 0005). A core field and a consumer field share one declaration shape, so one code path serves both. The union is exclusive (ADR 0011): a stored Field may roll up and may be edited; a `compute` Field may do neither and has no home, so its aggregate is computed on read. `'compute' in field` is the one test that separates them. `Field.column` is optional defaults for the bare-key shorthand. |
| `ChangeSet` | `{ added, removed, updated }` | The *one write shape* emitted on `change`, with `updated` carrying `{ entryId, field, from, to }` per field. What undo and redo replay. |
| `Dataset` | `{ entries, timeZone }` | The structural contract. `api/dataset.ts`'s class `implements` it, which is what lets `layout/` bind against a dataset without an illegal import. |
| `Rect` / `Size` / `Point` / `PixelSpan` | readonly numbers | One geometry vocabulary for four layers. |
| `InstantInput` | `Instant \| Date \| number \| string` | The input twin of `Instant`: what a consumer may *write* where the library *stores* an `Instant`. A string is either absolute (explicit `Z` or numeric offset) or a Plain time that names no instant until the Dataset's zone resolves it. |
| `EntryInput` / `TimeSpanInput` | the loose twins | Same fields, looser types: plain-string ids, `InstantInput` dates. Because `EntryId` is `string & brand` and `Instant` is `number & brand`, a stored `Entry` is itself a valid `EntryInput` — the pass-through case costs nothing. |
| `DateOnlyEndRule` | `'inclusive' \| 'exclusive'` | Reconciles half-open storage with what a consumer means by a bare date on `end`. A consumer writing `end: '2026-09-08'` means "through the 8th"; storage needs the boundary *after* the span. `'inclusive'` (default) advances such an end by one calendar day; `'exclusive'` reads it literally. Only date-only strings are affected — anything carrying a time of day is already a boundary. |

## `render/` & `api/`

*Derived from `src/render/**`, `src/api/**`, `harness/main.ts`.*

### Reading what a consumer writes: `EntryInput` → `Entry`

*Derived from `src/model/time.ts`, `src/time/input.ts`, `src/data/entry-reader.ts`.*

The library stores branded, absolute values; a consumer writes loose ones. Exactly one crossing
turns the second into the first, and it happens once, in the `Dataset` constructor.

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 340"
role="img"
aria-labelledby="cls-bound-title cls-bound-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="cls-bound-title">Consumer input to stored entries</title>
<desc id="cls-bound-desc">How EntryInput becomes a stored Entry via toEntries and time conversion</desc>
<defs>
<marker
id="a8"
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
<rect class="bx api" x="16" y="24" width="196" height="120" />
<text class="t" x="28" y="42">what the consumer writes</text>
<text class="s" x="28" y="60">{ id: 'a',</text>
<text class="s" x="28" y="74">name: 'Survey',</text>
<text class="s" x="28" y="88">start: '2026-09-01',</text>
<text class="s" x="28" y="102">end: '2026-09-08' }</text>
<text class="xs" x="28" y="122">EntryInput — plain strings,</text>
<text class="xs" x="28" y="134">no brands, no zone</text>
<path class="edge" d="M212,84 H246" marker-end="url(#a8)" style="color: var(--sub)" />
<rect class="bx api" x="252" y="24" width="216" height="120" />
<text class="t" x="264" y="42">api/dataset.ts</text>
<text class="s" x="264" y="60">new Dataset({ entries,</text>
<text class="s" x="264" y="74">timeZone, dateOnlyEnd? })</text>
<text class="xs" x="264" y="94">Resolves dateOnlyEnd to its</text>
<text class="xs" x="264" y="106">'inclusive' default, then calls</text>
<text class="xs" x="264" y="118">toEntries ONCE at construct,</text>
<text class="xs" x="264" y="130">and again on every add/update.</text>
<path class="edge" d="M360,144 V176" marker-end="url(#a8)" style="color: var(--sub)" />
<rect class="bx api" x="252" y="182" width="216" height="106" />
<text class="t" x="264" y="200">data/entry-reader.ts</text>
<text class="s" x="264" y="216">toEntries(inputs, context)</text>
<text class="xs" x="264" y="236">Field mapping ONLY: applies the</text>
<text class="xs" x="264" y="248">entryId brand, copies optionals</text>
<text class="xs" x="264" y="260">only when present. Anything here</text>
<text class="xs" x="264" y="272">resembling date math is a bug.</text>
<path class="edge" d="M468,232 H502" marker-end="url(#a8)" style="color: var(--sub)" />
<rect class="bx pure" x="508" y="182" width="238" height="106" />
<text class="t" x="520" y="200">time/input.ts</text>
<text class="s" x="520" y="216">toInstant(zone, input)</text>
<text class="s" x="520" y="230">toEndInstant(zone, input, rule)</text>
<text class="xs" x="520" y="250">Every date decision lives here —</text>
<text class="xs" x="520" y="262">it is the only layer allowed the</text>
<text class="xs" x="520" y="274">zone lookup and the day arithmetic.</text>
<path class="edge" d="M627,182 V150" marker-end="url(#a8)" style="color: var(--sub)" />
<rect class="bx pure" x="508" y="24" width="252" height="120" />
<text class="t" x="520" y="42">the four readings</text>
<text class="xs" x="520" y="60">Z / ±hh:mm string → absolute, zone ignored</text>
<text class="xs" x="520" y="74">Plain date-time → resolved through zone</text>
<text class="xs" x="520" y="88">date-only → that day's start</text>
<text class="xs" x="520" y="102">Date / number → epoch ms, as-is</text>
<text class="xs" x="520" y="122">A date the calendar lacks ('2026-02-31')</text>
<text class="xs" x="520" y="134">throws InvalidInstantError.</text>
<path class="edge" d="M746,84 H780" marker-end="url(#a8)" style="color: var(--sub)" />
<rect class="bx pure" x="786" y="24" width="158" height="120" />
<text class="t" x="798" y="42">what is stored</text>
<text class="s" x="798" y="60">{ id: EntryId,</text>
<text class="s" x="798" y="74">start: Instant,</text>
<text class="s" x="798" y="88">end: Instant }</text>
<text class="xs" x="798" y="108">Entry — branded, absolute.</text>
<text class="xs" x="798" y="120">Nothing downstream ever</text>
<text class="xs" x="798" y="132">sees a loose value again.</text>
<rect class="bx warn" x="16" y="182" width="216" height="106" />
<text class="warnink" x="28" y="200">the date-only end rule</text>
<text class="xs" x="28" y="220">A bare date on `end` means the</text>
<text class="xs" x="28" y="232">last day the consumer wants INCLUDED,</text>
<text class="xs" x="28" y="244">but storage wants the boundary</text>
<text class="xs" x="28" y="256">AFTER it. 'inclusive' (default)</text>
<text class="xs" x="28" y="268">advances one calendar day; only</text>
<text class="xs" x="28" y="280">date-only strings are touched.</text>
<path class="edge soft" d="M232,236 H246" marker-end="url(#a8)" style="color: var(--line)" />
<text class="xs" x="16" y="312">
Read once, at construction. Every layer downstream — layout/, render/, view/ — sees only
branded
</text>
<text class="xs" x="16" y="326">
absolute values, which is what lets computeFrame stay pure arithmetic with no parsing in the
hot path.
</text>
</svg>
</div>
<figcaption>
Diagram 5 — the consumer boundary. Amber = the one rule that is a policy choice rather than a
mechanical conversion.
</figcaption>
</figure>
</div>

:::note Why the split is where it is
`data/entry-reader.ts` may see both `model/` (for the brand helpers) and `time/` (for the
reading). It does no date math itself: resolving a Plain time needs the zone and the DST fold/gap
policy, and advancing a date-only `end` by "one day" is zone-aware arithmetic that is not always
86 400 000 ms. Both belong to `time/` under I10. The rule to carry forward: *data/ maps fields,
time/ decides dates.*
:::

### What the DOM backend builds

<div class="fg-architecture-doc">
<div class="tree">
container.fg-container <span class="c">role=group; not the scroller</span>
├─ div.fg-grid-pane <span class="c">width = gridWidth</span>
│   ├─ div.fg-grid-spacer <span class="c">one empty .fg-band per header band</span>
│   └─ div.fg-rows-clip <span class="c">clip; not transformed</span>
│       └─ div.fg-rows <span class="c">RenderSurfaces.grid; translateY(−visible.y)</span>
│           └─ div.fg-row <span class="c">keyed by RowId; cells inside</span>
├─ div.fg-splitter
├─ div.fg-timeline-pane <span class="c">the single native scroller</span>
│   ├─ div.fg-header <span class="c">width = contentWidth</span>
│   │   └─ div.fg-band <span class="c">keyed by index</span>
│   │       └─ div.fg-tick <span class="c">keyed by index within the band</span>
│   ├─ div.fg-bars
│   │   └─ div.fg-bar <span class="c">keyed by BarId</span>
│   ├─ div.fg-content-sizer <span class="c">1×1px, translated to content extent − 1px</span>
│   └─ div.fg-date-line <span class="c">today + authored lines, keyed by date-line id</span>
</div>
</div>

:::note One detail that is load-bearing, not incidental
The content sizer must land its *far* edge on the content extent, hence the `− 1`: it is 1×1px,
so translating its origin to the extent would make the browser's native scroll range one pixel
longer than what `ScrollAxis` computed. Header, bars and sizer sit at x=0 in the timeline pane —
the grid pane owns the label width, so there is no gutter offset in this backend.
:::

#### createDomBackend() — factory

*`render/dom/index.ts`*

A closure, not a class — the ten caches and the layer references are private by construction.
Implements `RenderBackend<HTMLElement>`.

- **mount(surfaces)** — Takes `{ grid, timeline }`. Builds header, bars, content sizer and
  date-line layer inside the timeline pane.
- **sync(frame)** — Keyed header/rows/cells/items, date-line, grid `translateY`, sizer
  transform. No layout reads.
- **applyState(state)** — Hot-path class toggles and transforms only — hover/selection/drag
  preview, zero allocation, never a frame rebuild (I13).
- **hitTest(x, y)** — `document.elementFromPoint` → `closest('.fg-bar')` →
  `dataset.barId`. No materialized hit-region array; the bars array *is* the hit index.

#### syncKeyed() — function

*`render/dom/sync-keyed.ts`*

The entire reconciler, in 30 lines. Three phases per call: look-up-or-create by key → patch only
if `toGeom` differs from the cached geometry → prune keys no longer present.

- **nodes / geoms** — The caller's persistent per-layer caches, owned by one `KeyedLayer`
  instance.
- **create(item, key)** — Called once per key. Attributes fixed for the node's lifetime belong
  here.
- **shallowEqual(a, b)** — Compares both directions (issue #91).

#### readPixelProperty() — function

*`render/dom/pixel-property.ts`*

Level 1 of the customization ladder: read a `--fg-*` custom property off the container, parse to
px, validate against what the library can actually draw with.

- **policy.accepts** — `'positive'` — zero is nonsense. `'zeroOrMore'` — zero is a real choice.
- **re-read cadence** — The caller's, and each states it — neither is per render.

#### syncDateLine() — function

*`render/dom/date-line.ts`*

Renders the today-line and authored date lines as positioned decoration elements, keyed by
date-line id. The decoration geometry comes from `layout/date-line.ts`'s `resolveDateLines`.

#### rowIdFromTwistyClick() — function

*`render/dom/row-twisty.ts`*

When a click lands on a `.fg-row-twisty` inside the grid pane, returns that row's id. Keeps the
twisty markup and `data-row-id` out of `view/` so a second backend owns its own control geometry.
Wired by `view/attach-row-twisty.ts`.

#### createNullBackend() — factory

*`render/null/index.ts`*

`RenderBackend<void>` that records the last frame and does nothing else. For tests, SSR-of-data,
and the future export seam.

- **lastFrame()** — The whole added surface over the seam.

Still unreachable from `view/`: `GanttShellOptions.backend` is typed to `THost` `HTMLElement`, so
this `THost={}` backend, and `PaneLayout`'s real-element mounting, keep the whole stack DOM-free
testing out of reach.

#### Gantt — public class

*`api/gantt.ts`*

The public `Gantt` class. Constructs one `GanttShell` and forwards, and delegates every
live-reconfigurable property to it.

- **GanttOptions** — `container`, `dataset`, optional shared `scale` *or*
  `preset`/`range`/`fit`, optional `scroll`, `gridColumns`, `rowSource`, `interactions`,
  `plugins`, `viewportGestures`, `theme`, `locale`, `todayLine`, …
- **live properties** — `preset`, `range`, `fit`, `zoomIn`/`zoomOut`, `zoomPresets`,
  `panToInstant`/`panToToday`, `gridColumns`, `rowSource`, `collapsed`, `collapse`/`expand`,
  `selection`, `selectedEntries`, `interactions`, `plugins`, `commands`, `viewportGestures`,
  `theme`, `locale`, `todayLine`, `gridWidth`, …
- **destroy()** — Idempotent, delegates. No module-level singletons anywhere in `src/` (I2).

#### Dataset — public class

*`api/dataset.ts`*

Everything is delegated into `data/` — the public class is a thin façade over `DatasetState`.

- **entries CRUD** — `entries.all`, `entries.add/update/remove`, and the row's own doors —
  `entry.read(key)`, `entry.children()`, `entry.hasChildren`.
- **transactions** — `transaction(fn)` batches several edits into one changeset, one render.
- **events** — `on('beforeChange', vetoable)`, `on('change', { changeSet })`.
- **fields** — `field(key)`, `fields.all`, `fieldTypes`, `aggregators`.
- **undo / redo** — `undo()`, `redo()`, `canUndo`, `canRedo`, `replay(changeSet)`.
- **implements DatasetContract** — States the relationship to `model/dataset.ts` instead of
  leaving it structural-by-coincidence.

### The harness, reviewed

`harness/main.ts` is the library's first consumer and gets reviewed on every commit, changed or
not: code there that re-derives what the library already computes is an API gap even when no
lint fires. It demos tree rows, grid columns, field rollups, live `rowSource` switching,
selection, timeline controls, shipped plugins, and Dataset plugins; `harness/plugins.html` is the
plugin playground; `harness/data.html` demos transactions and undo. It still reads clean —

```ts
import { Gantt, Dataset, tooltips, contextMenu, inlineEditing } from 'freegantt';
import { demoTreeEntryInputs, demoFieldOptions } from '../fixtures/demo-dataset.js';

const dataset = new Dataset({
  entries: demoTreeEntryInputs,
  timeZone: 'UTC',
  ...demoFieldOptions,
});

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  plugins: [tooltips(), contextMenu(), inlineEditing()],
});
gantt.rowSource = { source: 'entries', tree: true };
```

— no restated `rowHeight`, no hand-built `TimeScaleModel` standing in for `range: 'fitDataset'`.
`harness/scroll-sync.ts` is the shared-viewport e2e fixture: one pair of Gantts sharing a
`TimeScaleModel` and both `ScrollAxis` instances, beside a pair sharing only the `x` axis and a
pair sharing only the `y` axis (D-S6-1).

## `extensions/`

*Derived from `src/extensions/**`.*

This layer may import only `api/` and `model/`. The shell constructs the runtime; a built-in
never imports `view/`.

#### PluginRuntime — class

*`extensions/plugin-runtime.ts`*

Installs and uninstalls Gantt plugins, builds each `PluginContext`, and runs `setup()`. One
occupant per plugin id.

#### CommandRegistry — class

*`extensions/commands.ts`*

Core commands and plugin commands share one registry. Generic over its Gantt type so `view/` can
construct it without importing `api/`.

#### Keymap — class

*`extensions/keymap.ts`*

Newest-first chord resolver. The innermost popup wins Escape.

#### createPopup() — function

*`extensions/popup.ts`*

Anchoring, flipping, clamping, dismissal. Tooltips and the context menu build on this. Each feature
holds its own instance, so a tooltip and a menu may both show. Inline editing does not — it needs a
live input node.

#### tooltips() / contextMenu() / inlineEditing() — factories

*`extensions/features/`*

The three shipped built-ins. Values a consumer imports
(`plugins: [tooltips(), contextMenu(), inlineEditing()]`), never names in a config table. Each is
an ordinary `ChromePlugin`.
