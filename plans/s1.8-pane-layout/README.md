# S1.8 — Pane layout, the splitter, render surfaces, and `GanttShell` as composition root

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.8 · **Issue:** #1 · **Baseline:** `s1-close-plan` @ `6f81d7c`
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, handle shapes, `batch()`.
**Supersedes:** the [S1.8 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400110992) where the two disagree; §2 and §3.6 record every name and decision that moved, and why.

This directory is the settled spec for S1.8, in the same form as [`plans/s1.7-windowed-frame/README.md`](../s1.7-windowed-frame/README.md).

> **§0 is settled.** Three scope calls needed an answer before code started. All three are confirmed as recommended. Everything in this document is settled.

---

## 0. Scope calls — confirmed

S1.7 §9 hands three items to S1.8. The S1.8 issue comment names none of them. Q1 and Q2 close that gap; Q3 is a naming call the conventions comment left half-made.

| # | Question | Answer |
|---|---|---|
| **Q1** | **Does `gantt.reveal(entryId)` land here?** S1.7 §9 says S1.8, because `reveal` waited on a pane height that re-measures, and S1.7b shipped that. | **Confirmed: No — S1.9.** `reveal` must bring a bar into view on **both** axes. Horizontal is a no-op until `TimeScaleIntent.zoom` exists, because `contentWidth ≡ paneWidth` makes every bar already visible on x (D-S1.7-11). Shipping it now means a verb that passes its unit tests and is half-written the day zoom lands. It goes to S1.9, next to the key that makes its x half mean something. Carried into [`plans/s1.9-presets-and-zoom/README.md`](../s1.9-presets-and-zoom/README.md) §0. |
| **Q2** | **Do `gantt.scale =`, `gantt.scroll =` and `gantt.overscan` land here?** S1.7 §9 and S1.7 §4 both say S1.8. | **Confirmed: split, and correct the ledger.** `gantt.scale =` and `gantt.scroll =` are **cut**, not deferred: the S1.9 design settled that `Gantt` never re-exposes `scale`/`scroll`, because that would give one key two write paths (`plans/02` §1.1). A caller that shares models constructed them and holds the references. `gantt.overscan` moves to **S1.9**, with the rest of the live keys (`preset`, `range`, `zoom`), so the public-surface pass happens once. S1.8 adds one public key — `gridWidth` — because the splitter mutates it and cannot ship without it. |
| **Q3** | **`gridWidth` or `gridPaneWidth`?** Conventions §1 settled the concept name as **grid width**. The same comment then named the CSS token `--fg-grid-pane-width`, because "grid width" alone reads as gridline spacing. Two spellings for one number. | **Confirmed: keep both spellings, and write down why.** In `gantt.gridWidth` the object disambiguates and the pair `beforeGridWidthChange`/`gridWidthChange` stays readable. In a CSS token list there is no object to disambiguate, and `--fg-grid-width` sits beside tick and gridline tokens, so the token keeps the long form. The asymmetry goes in `CONTEXT.md` under **Grid width**, so a reader does not take it for an accident. |

**Not a question: `RenderBackend.mount()` changes shape, and the ledger is written.** The backend takes one host today and reserves the row-label gutter inside it (#46). The pane split moves that gutter out of the paint layer, so `mount()` takes two surfaces and `rowLabelWidth` is deleted. A seam change is settled only when every site that spells the old name is listed, so **§3.7 is that list**.

Two defects close in this step. Both are listed here because they change what "done" means, not how the work is built:

> **D1 — the row-label gutter sits inside the scrollable content.** Recorded as D-S1.7-11. The host's content is `gutter + contentWidth` wide while only `contentWidth` of it is timeline, so at a non-zero `max.x` the last `gutter` px of the timeline is unreachable. It is invisible today because `max.x ≡ 0`. It becomes visible the day S1.9 ships `zoom`. D-S1.8-1 closes it, and D-S1.8-10 states the test that proves it closed **without** waiting for a non-zero `max.x`.

> **D2 — the harness owns the library's pane CSS.** Issue #41. Both `harness/index.html` and `harness/scroll-sync.html` set `overflow: auto` and hand-write the `.fg-*` rules. A consumer copying the harness copies a pane split the library is supposed to own. D-S1.8-2 removes the reason for the `overflow` rule; the rest of the CSS leaves at S1.10, when the library ships a stylesheet.

---

## 1. User stories

Written for the person using a Gantt, not the person building one. Each maps to an acceptance check in §8.

- **U1.** I drag the boundary between the labels and the timeline. Both panes follow while I drag, not after I let go.
- **U2.** I let go, and my app records the new width. My app can also refuse a width, and the boundary goes back.
- **U3.** I scroll, and each row's label stays exactly beside its bar. It stays exact at a fractional pixel density.
- **U4.** I move the boundary and the time axis re-fits to the new timeline width. I do not reload.
- **U5.** I press Escape in the middle of a drag. The boundary returns to where the drag started.
- **U6.** (developer) I write no pane CSS and no `overflow`. I set one custom property and the library builds the panes.
- **U7.** (developer) I give a host selector that matches nothing. I get an error with a code I can branch on, not a string I must match.

---

## 2. Decisions

Settled in review. Each states the alternative it beat.

### D-S1.8-1 — The timeline pane is the only scroller; the grid pane follows by one transform

D-D, made concrete. The host holds three children:

```
host  (no overflow, no scroll)
├── grid pane      width: gridWidth        no scrollbar; row layer follows by transform
├── splitter       width: --fg-splitter-width
└── timeline pane  flex: 1; overflow: auto the single native scroller
```

The grid pane has no scrollbar. Its row layer takes exactly one `translateY(-frame.visible.y)` per frame. Both panes read `top` from the **same** `frame.rows` array, so I9 is structural: pixel-identity is the only thing that *can* happen, and its test guards a property instead of propping one up.

This closes D1. The timeline pane's content is `contentWidth` wide, with no gutter inside it, so its whole scrollable range is timeline.

*Rejected:* keeping the host as the scroller and floating the grid pane above it with `position: sticky`. It keeps the gutter inside the scrollable content — D1 survives — and it makes the grid pane's horizontal position a CSS side effect instead of a number the library owns.

### D-S1.8-2 — The backend stops owning the gutter

`render/dom` reads `--fg-row-label-width`, reserves it, and offsets the header and bar layers by it (#46). `RenderBackend.rowLabelWidth` exists so `GanttShell` can subtract it back out. That is a pane boundary simulated inside a paint layer.

Once `PaneLayout` owns the panes, the gutter is the grid pane's width. These delete themselves:

| Deleted | Where |
|---|---|
| `RenderBackend.rowLabelWidth` | `src/render/backend.ts`, both backends |
| the `readPixelProperty` call for `--fg-row-label-width` | `src/render/dom/index.ts` |
| `headerLayer.style.marginLeft`, `barLayer.style.marginLeft` | `src/render/dom/index.ts` |
| `rowLabelWidth` in the content sizer's x | `src/render/dom/index.ts` |
| the gutter subtraction in `#applyPaneMeasurement` | `src/view/gantt-shell.ts` |

The token becomes `--fg-grid-pane-width`, read by `PaneLayout`, with the same `readPixelProperty` helper and the same `zeroOrMore` policy and `160` fallback the backend uses today. Behaviour does not change; the owner does.

### D-S1.8-3 — `gridWidth` is a public, cancelable, live key, and the event bus arrives with it

Dragging the splitter mutates a config key, so `plans/02` §1.3 applies: every mutating interaction gets a cancelable `before*` event.

```ts
gantt.gridWidth = 280;

gantt.on('beforeGridWidthChange', ({ from, to }) => {
  if (to < 120) return false;          // veto; the boundary goes back
});
gantt.on('gridWidthChange', ({ from, to }) => persist(to));
```

This is the first bus in the codebase. It ships with exactly two events, and both fire — nothing is declared that does not (I11). Sync veto only. The async-veto path `plans/02` §3 describes belongs to S4's gesture controllers, and this step does not claim it.

`on` / `off` is the pair, and neither returns a disposer. Conventions §4 bans a bare `() => void` as a handle shape, and a returned unsubscribe function is exactly that. A greppable pair costs nothing and breaks no rule.

*Rejected:* a callback on `PaneLayout` (the issue comment's first draft). It is a bespoke channel where `plans/02` §3 says "one bus, one vocabulary", and it leaves the public surface with no way to observe or veto a drag.

### D-S1.8-4 — The bus lives in `view/`, and S2 decides whether it moves

`plans/02` §3 puts view events on the `Gantt` and data events on the `Dataset`. Those are two emitters, not one object.

`src/view/event-bus.ts` holds a small typed `EventBus<TEvents>`. `GanttShell` owns the instance, because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way `Gantt` already delegates every other job to its shell.

It is **not** put in `model/` today. `data/` may import only `model/`, so a bus shared with S2's `Dataset` would have to live there, and that is a third runtime carve-out in a module specified as types-only (D-S1.7-8 made the second). S2 may not need it at all: `data/`'s reactivity is the `alien-signals` façade (`plans/04` §1), which may carry `change` on its own. The step that actually needs sharing makes that call, with the caller in front of it.

### D-S1.8-5 — The splitter proposes a number; it never writes one

`attachSplitter` is an attachment in `view/` (conventions §1 and §4): a DOM wiring, returning `{ detach() }`, never a bare closure.

It lives in `view/` and not `interaction/` because `interaction/` owns **data** gestures over drafts and transactions (`plans/01` §9). A splitter commits no data. If a second chrome gesture appears, that is the moment to reconsider — not now.

The hooks are named for what they carry, per the naming skill. The issue comment's names fail the checks:

| Issue comment | Fails | This spec |
|---|---|---|
| `gridWidthAt()` | check 2 — "grid width at" reads as a question with no answer | `readGridWidth()` |
| `onPropose(px)` | checks 1 and 3 — no domain term; `onPropose` finds nothing when searched | `previewGridWidth(px)` |
| `onCommit(px)` | checks 1 and 3 — a later gesture commit takes the same word | `commitGridWidth(px)` |

Call site, read aloud — "attach a splitter to the splitter element; read the grid width; preview a grid width; commit a grid width":

```ts
attachSplitter(panes.splitter, {
  readGridWidth: () => paneLayout.gridWidth,
  previewGridWidth: (px) => { paneLayout.gridWidth = px; },
  commitGridWidth: (px) => this.#commitGridWidth(px),
});
```

`preview` and `commit` carry the meaning they already carry in this project — the drag preview of the hot path, and the commit of a gesture — so no word gains a second meaning.

### D-S1.8-6 — A splitter drag needs no re-measure call

`attachPaneSize` moves from the host to the **timeline pane**, which is what `CONTEXT.md`'s own Attachment entry already shows: `attachPaneSize(panes.timeline, size => handle.setPaneSize(size))`.

The consequence is the whole of U4, for free: moving the splitter changes the timeline pane's width, the `ResizeObserver` already on that pane fires, `setPaneSize` re-fits the scale, and the Gantt renders. The splitter pushes no width into the models and calls no `render()`.

Known cost, stated: `previewGridWidth` fires per pointer move, so a drag re-fits and re-renders per frame. The frame is windowed (S1.7), so the work is bounded by what is on screen. S7 measures it. Nothing is throttled here on a guess.

### D-S1.8-7 — `PaneLayout` holds structure and one number, and emits nothing

No geometry, no scale, no data, no frame, no events. It creates three elements, owns `gridWidth`, and measures the timeline pane. Who is allowed to change the number is decided one layer up (D-S1.8-3).

### D-S1.8-8 — `no-flow-layout-rows` lands first, with an honest scope

Guardrails before the code they guard (`plans/04` §3.2/§3.3). `docs/02` §3.10 has specified this rule since S0 and `eslint/rules/` has no such file.

Its documented scope is `src/view/grid/**` and `src/view/timeline/**`. Neither directory exists, and this step puts the pane code in `src/view/pane-layout.ts`. A rule scoped to nothing passes everything. The scope becomes `src/view/**` and `src/render/dom/**`, and `docs/02` §3.10 is corrected in the same commit — not left as a rule whose documentation describes a repository that never existed.

### D-S1.8-9 — `HostNotFoundError`, and `FreeGanttError` becomes public

`resolveHost` throws a bare `Error` today. `plans/02` §7 promises typed errors with codes, and a selector that matches nothing (#38) is the case that promise was written for. `HostNotFoundError` joins `UnsupportedUnitError` in `src/model/errors.ts`, and `api/index.ts` exports `FreeGanttError` and `HostNotFoundError` — the first error a consumer can actually catch.

### D-S1.8-10 — The gutter defect is proven closed without a non-zero `max.x`

D1 cannot be tested by scrolling, because nothing can make `max.x` non-zero until S1.9. It can be tested by measuring, and that is the better test anyway: the defect is that the scrollable content is `gutter + contentWidth` wide.

```
timelinePane.scrollWidth === frame.contentWidth   (± the sizer's 1px)
```

That assertion holds at any scroll position, `max.x = 0` included. It fails today and passes after D-S1.8-1.

This supersedes `plans/temp_todo_for_s1-close.md` §4, which proposed an e2e test with a hand-set non-zero `max.x`. That test would have to fake a state the library cannot yet reach.

### D-S1.8-11 — The grid pane needs a header spacer, so `--fg-header-height` lands here

The header bands live in the timeline pane. The grid pane's rows must start at the same y, or every label sits one header-height above its bar.

`PaneLayout` creates a spacer element at the top of the grid pane, sized from `--fg-header-height` (fallback `20`, matching today's harness). The token is introduced here because the pane split cannot be built without it; S1.10 adds it to the documented token table rather than inventing it.

**The header still scrolls away vertically.** It does today, and it does after this step: it sits inside the scroller. `position: sticky; top: 0` fixes it, and that is one line in the stylesheet S1.10 ships. This step does not change the behaviour and does not claim to. §9 records it.

### D-S1.8-12 — Sub-pixel drift between panes, named rather than assumed away

The grid layer is transformed by `-frame.visible.y`, and `attachScroll` writes the same number to the timeline element. A browser may store a *fractional* `scrollTop` under a fractional device-pixel ratio — the reason `EPSILON = 1` exists in `scroll-attachment.ts` today. The two panes can then differ by under one CSS pixel.

The acceptance box (`[S1-A2]`) says **fractional zoom**, not fractional scroll. A fractional zoom makes `row.top` fractional, both panes read the same fractional `top`, and they agree exactly. So the box is met.

The residue is real and is recorded, not hidden: sub-pixel disagreement between panes under a fractional device-pixel ratio while scrolled. It closes if S7's measurement finds it visible, and the fix would be to hand the element's own reported position back through `ScrollAttachment` — never by reading element scroll somewhere new (I12).

---

## 3. API

### 3.1 `src/view/pane-layout.ts` — the DOM skeleton

```ts
export interface PaneLayoutOptions {
  host: HTMLElement;
  /** Initial grid pane width in px. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Default 0. The splitter clamps to it; nothing else may. */
  minGridWidth?: number;
}

export interface Panes {
  /** Row labels and, from S6, columns. No scrollbar — its row layer follows the scroll owner. */
  readonly grid: HTMLElement;
  /** The single native scroller: header bands, bars, links, decorations. */
  readonly timeline: HTMLElement;
  readonly splitter: HTMLElement;
}

export class PaneLayout {
  constructor(options: PaneLayoutOptions);
  readonly panes: Panes;
  get gridWidth(): number;
  set gridWidth(px: number);
  /** The timeline pane's client box — the one measurement everything downstream is sized from. */
  measureTimelinePane(): Size;
  destroy(): void;
}
```

`measureTimelinePane()`, not `measureTimeline()`. The glossary term is **timeline pane**, and the pairing reads true at the call site: `handle.setPaneSize(paneLayout.measureTimelinePane())` — "set the pane size from the measured timeline pane".

Soft cap ~150 lines (R1).

### 3.2 `src/view/splitter.ts` — a pointer drag that proposes a number

```ts
export interface SplitterAttachment {
  detach(): void;
}

export interface SplitterHooks {
  /** The grid width when the drag arms. */
  readGridWidth(): number;
  /** During the drag — preview only, no event, no commit. */
  previewGridWidth(px: number): void;
  /** On pointerup. The shell decides whether it becomes the new width. */
  commitGridWidth(px: number): void;
}

export function attachSplitter(handle: HTMLElement, hooks: SplitterHooks): SplitterAttachment;
```

Pointer capture always. Escape restores `readGridWidth()` from drag start and cancels the drag. It writes no state of its own and clamps only to `minGridWidth`, which `PaneLayout` owns.

### 3.3 `src/view/event-bus.ts` — two events, both of which fire

```ts
export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
}

export class EventBus<TEvents> {
  on<K extends keyof TEvents>(name: K, handler: (payload: TEvents[K]) => void | false): void;
  off<K extends keyof TEvents>(name: K, handler: (payload: TEvents[K]) => void | false): void;
  /** Returns false if any handler returned false. Notification events ignore the result. */
  emit<K extends keyof TEvents>(name: K, payload: TEvents[K]): boolean;
}
```

The commit sequence, in one place in `GanttShell`:

```
commitGridWidth(px)
  → emit('beforeGridWidthChange', { from, to })   → false ⇒ paneLayout.gridWidth = from; stop
  → paneLayout.gridWidth = px
  → emit('gridWidthChange', { from, to })
```

A veto restores the width the drag started from, so a rejected drag leaves nothing behind.

### 3.4 `src/render/backend.ts` — two surfaces, one mount

```ts
export interface RenderSurfaces<THost> {
  /** The grid pane's row layer. */
  grid: THost;
  /** The timeline pane's content layer: header bands, bars, links, decorations. */
  timeline: THost;
}

export interface RenderBackend<THost = unknown> {
  mount(surfaces: RenderSurfaces<THost>): void;
  sync(frame: GeometryFrame): void;
  applyState(state: InteractionState): void;
  hitTest(x: number, y: number): HitResult | null;
  destroy(): void;
  // rowLabelWidth: DELETED (D-S1.8-2)
}
```

`render/dom` puts the row layer in `grid` and the header, bar and sizer layers in `timeline`. Per frame it writes one `translateY(-frame.visible.y)` on the grid row layer, and nothing else changes about how rows are positioned.

Row nodes get `width: 100%` at create time, so a label fills the grid pane. It is a constant, not per-frame geometry; S1.10 moves it to the shipped stylesheet and deletes the line. `render/null` drops `rowLabelWidth` and takes the new `mount` signature.

### 3.5 `src/view/gantt-shell.ts` — composition root

```ts
export interface GanttShellOptions {
  host: HTMLElement | string;
  dataset: Dataset;
  scale?: TimeScaleModel;
  scroll?: ScrollModel;
  gridWidth?: number;
  /** Injected for tests and a future canvas backend. Default `createDomBackend()`. */
  backend?: RenderBackend<HTMLElement>;
}
```

`scroll?: ScrollModel`, not `ScrollSource`. S1.5 cut `ScrollSource` (S1.5 README §10) and the issue comment was written before that.

The constructor is a wiring list:

```
resolveHost  →  new PaneLayout({ host, gridWidth })
             →  backend.mount({ grid, timeline })
             →  new Viewport({ scale, scroll })
             →  viewport.bind(dataset, () => this.render())
             →  #readMetrics()                                   // first synchronous measurement
             →  attachScroll(panes.timeline, viewport)
             →  attachPaneSize(panes.timeline, size => handle.setPaneSize(size))
             →  attachSplitter(panes.splitter, hooks)
             →  render()
```

`render()` keeps its S1.7 shape: `computeFrame` → `backend.sync(frame)` → `setContentSize(...)` → `scrollAttachment.writePosition()`. `#readMetrics()` reads `--fg-row-height` and `measureTimelinePane()` together, invalidated by the pane-size attachment — the one invalidation path #49 deferred to this work.

Soft cap ~150 lines each for `pane-layout.ts`, `splitter.ts`, `event-bus.ts`, `scroll-attachment.ts`, `pane-size-attachment.ts` and `gantt-shell.ts`. A file that wants to grow past it is a missing seam, and the PR says which one.

### 3.6 Names changed from the issue comment

| Issue comment | This spec | Reason |
|---|---|---|
| `scroll?: ScrollSource` | `scroll?: ScrollModel` | `ScrollSource` was cut at S1.5 |
| `PaneLayout.measureTimeline()` | `measureTimelinePane()` | naming skill check 1 — the glossary term is **timeline pane** |
| `gridWidthAt()` | `readGridWidth()` | check 2 — the call site read as a question |
| `onPropose(px)` | `previewGridWidth(px)` | checks 1 and 3 — no domain term, unsearchable |
| `onCommit(px)` | `commitGridWidth(px)` | checks 1 and 3 — a gesture commit takes the same word later |

### 3.7 Rename ledger — every site

**A. `RenderBackend.mount(host)` → `mount(surfaces)`, `rowLabelWidth` deleted**
`src/render/backend.ts` · `src/render/dom/index.ts` · `src/render/null/index.ts` · `src/view/gantt-shell.ts` · `src/render/dom/index.test.ts` · `src/render/null/index.test.ts` · `src/view/gantt-shell.test.ts` · `plans/01` §8.1 · `docs/adr/` (any entry naming the gutter).

**B. `--fg-row-label-width` → `--fg-grid-pane-width`**
`src/render/dom/index.ts` · `harness/index.html` · `harness/scroll-sync.html` · `plans/02` §4 · `CONTEXT.md`.

**C. Retired spellings — each must grep to zero**
`rowLabelWidth` · `ROW_LABEL_WIDTH_PROPERTY` · `ROW_LABEL_WIDTH_POLICY` · `--fg-row-label-width` · `mount(this.#host)` · `measureTimeline(` · `gridWidthAt` · `onPropose` · `ScrollSource`.

**D. Prose sites that keep the word and change the meaning**
`src/view/scroll-attachment.ts:23` — the comment says "`element` is the timeline pane", which becomes true rather than aspirational. `src/render/dom/index.ts:172` — the `margin-left` comment describes a phantom scroll range that no longer exists.

---

## 4. Public surface

`api/index.ts` gains: `gridWidth` (get/set on `Gantt`), `on`/`off`, `GanttEventMap`, `GridWidthChange`, `FreeGanttError`, `HostNotFoundError`, and `gridWidth` on `GanttOptions`.

**Declared gaps, unchanged and now dated (Q1, Q2):** `gantt.reveal(entryId)` and `gantt.overscan` are S1.9. `gantt.scale =` and `gantt.scroll =` are cut, not deferred.

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| A host writes `overflow: auto` on the Gantt element and gets two scrollbars | The host is not a scroller after D-S1.8-1. The harness stops writing it, and #41 closes. |
| The splitter moves and the axis keeps the old width | It cannot: `attachPaneSize` watches the timeline pane (D-S1.8-6). No wiring, no call. |
| A vetoed drag leaves the boundary where the pointer dropped it | The veto path restores `from` before it returns (D-S1.8-3). |
| Someone adds a third event to the bus that never fires | I11. Two events, both fired by the commit sequence in §3.3. |
| The grid pane grows a scrollbar under a long label | It has no `overflow`. Labels clip; S1.10's stylesheet owns how. |
| A pane file measures a row and computes a height | `no-flow-layout-rows`, landed before the code (D-S1.8-8). |
| The row labels sit a header-height above their bars | The grid pane's header spacer (D-S1.8-11). |
| Someone re-adds a gutter offset inside the backend | `rowLabelWidth` is gone from the interface, so there is nothing to read (D-S1.8-2). |

---

## 6. Tests

`dom` except where noted.

- **`view/pane-layout.test.ts`** — the three panes exist with their parts; `gridWidth` set moves the boundary and remounts nothing; `measureTimelinePane()` reports the timeline pane and not the host; the default width comes from `--fg-grid-pane-width` and falls back to 160; the grid pane carries a header spacer of `--fg-header-height`.
- **`view/splitter.test.ts`** — a drag previews widths; it clamps at `minGridWidth`; Escape restores the width at drag start and commits nothing; `detach()` releases pointer capture and removes every listener.
- **`api/gantt.test.ts`** — `beforeGridWidthChange` returning `false` leaves `gantt.gridWidth` and the panes where they were; a drag that is not vetoed fires `gridWidthChange` exactly once with `{from, to}`; `off` stops a handler; setting `gantt.gridWidth` directly fires the same pair.
- **`view/gantt-shell.test.ts`** — **`[S1-A2]`**: grid label tops and timeline bar tops, read from the live DOM at a fractional zoom, are equal to the pixel; a scroll moves both panes by the same delta; the shell still holds exactly one reaction; `resolveHost` throws `HostNotFoundError` with code `host-not-found` (#38).
- **`view/gantt-shell.test.ts` (D1)** — the timeline pane's `scrollWidth` equals `frame.contentWidth` within the sizer's 1px. Fails before D-S1.8-1, passes after (D-S1.8-10).
- **`render/dom/index.test.ts`** — `mount({grid, timeline})` puts row labels in the grid surface and ticks, bars and the sizer in the timeline surface; the grid row layer carries one `translateY(-visible.y)` per frame; no `getComputedStyle` call remains in the backend.
- **`render/null/index.test.ts`** — the null backend takes the new signature and still consumes a frame in Node with no DOM.
- **e2e (`e2e/pane-resize.spec.ts`, extended)** — dragging the splitter re-fits the time axis with no other call (U4); the two panes stay aligned after the drag.
- **lint** — `no-flow-layout-rows` red fixture under `eslint/rules/fixtures/`, its `.test.cjs`, and `scripts/guard-red-test.mjs` confirming the fixture still fails.

---

## 7. Spec edits implied — landed **with** this step

- `plans/01` §8.1 — `mount()` takes `RenderSurfaces`; `rowLabelWidth` removed. Supersedes part of #46's fix.
- `plans/01` §8.3 — the grid pane follows the scroll owner by one transform per frame; the gutter is a pane width, not a backend reservation.
- `plans/02` §1 — `gridWidth` joins the live keys.
- `plans/02` §3 — `beforeGridWidthChange` / `gridWidthChange` join the event table; the `on`/`off` pair is named.
- `plans/02` §4 — `--fg-row-label-width` → `--fg-grid-pane-width`; `--fg-splitter-width` and `--fg-header-height` added.
- `plans/02` §7 — `HostNotFoundError` named as the first catchable error.
- `plans/s1.7-windowed-frame/README.md` §9 — the three S1.8 rows are corrected: `reveal` → S1.9, `gantt.overscan` → S1.9, `gantt.scale =`/`gantt.scroll =` → cut (Q1, Q2). The gutter row is ticked.
- `docs/02` §3.10 — `no-flow-layout-rows`'s real scope; `docs/02` §5 moves it from `PLANNED (S1)` to active.
- `docs/01` §I9 — moves from `PLANNED (S1)` to enforced, naming `[S1-A2]` and the rule.
- `CONTEXT.md` — new entries, written **before** the names are used (naming skill, step 1): **Grid pane**, **Timeline pane**, **Splitter**, **Grid width** (with the token asymmetry from Q3), **Pane layout**, **Render surface**, **Event bus**. Edited: **GanttShell**, whose entry says the pane split "lives" in the shell — after this step the shell composes it and `PaneLayout` holds it.
- Issue #1 — the S1.8 comment gets a correction note pointing here; #41 closes.

---

## 8. TODO

Guardrails and glossary first (`plans/04` §3.2/§3.3, naming skill step 1), then structure, then the seam, then the DOM edge.

### Guardrails and glossary
- [ ] `CONTEXT.md` entries for the seven new terms (§7)
- [ ] `eslint/rules/no-flow-layout-rows.cjs` — scope per D-S1.8-8; register in `eslint/rules/index.cjs` and `eslint.config.js`
- [ ] `eslint/rules/no-flow-layout-rows.test.cjs` + red fixture; confirm `scripts/guard-red-test.mjs` fails on it
- [ ] `docs/02` §3.10 and §5 corrections

### Types and errors
- [ ] `HostNotFoundError` in `src/model/errors.ts`; re-export from `src/model/index.ts` and `src/api/index.ts` with `FreeGanttError`

### `view/`
- [ ] `src/view/pane-layout.ts` per §3.1
- [ ] `src/view/splitter.ts` per §3.2
- [ ] `src/view/event-bus.ts` per §3.3
- [ ] `GanttShell` — composition root per §3.5; `#readMetrics()`; `resolveHost` throws typed
- [ ] `attachScroll` takes `panes.timeline`; `attachPaneSize` takes `panes.timeline`; the gutter subtraction is deleted

### `render/`
- [ ] `RenderSurfaces`; `mount(surfaces)`; `rowLabelWidth` deleted from the interface and both backends
- [ ] `render/dom` — row layer into `grid`; header, bars and sizer into `timeline`; one `translateY(-visible.y)` per frame; sizer x loses the gutter

### `api/`
- [ ] `Gantt.gridWidth`, `Gantt.on`, `Gantt.off`; `GanttOptions.gridWidth`; the commit sequence in §3.3

### Harness
- [ ] `harness/index.html` and `harness/scroll-sync.html` drop `overflow` and every rule the library now owns; #41 closes
- [ ] Review both harness entry points against CLAUDE.md's harness rule; record any gap against S1.8 and fix it in `src/`

### Closing the ledger (§3.7)
- [ ] Run each retired spelling in §3.7 C as a grep and confirm zero results
- [ ] The two prose sites in §3.7 D

### Review and docs
- [ ] The §7 spec edits, landed with this step
- [ ] `pnpm verify` green; `pnpm test:e2e` green

### Acceptance
- [ ] **U1** — a drag moves both panes during the drag (`splitter.test.ts`, `e2e/pane-resize.spec.ts`)
- [ ] **U2** — `gridWidthChange` fires once with `{from, to}`; a veto restores the width (`api/gantt.test.ts`)
- [ ] **U3** — **`[S1-A2]`**, live-DOM pixel equality at fractional zoom (`view/gantt-shell.test.ts`)
- [ ] **U4** — a splitter drag re-fits the axis with no other call (`e2e/pane-resize.spec.ts`)
- [ ] **U5** — Escape restores and commits nothing (`splitter.test.ts`)
- [ ] **U6** — both harness pages own no pane CSS and no `overflow` (#41)
- [ ] **U7** — `HostNotFoundError` with code `host-not-found` (`view/gantt-shell.test.ts`)
- [ ] **D1** — `timelinePane.scrollWidth === frame.contentWidth` (D-S1.8-10)

---

## 9. Deferred, with the caller that will bring it back

| Deferred | Returns at | Needs |
|---|---|---|
| `gantt.reveal(entryId)` | S1.9 | `zoom`, so the x half of "bring into view" means something (Q1) |
| `gantt.overscan` and the rest of the live keys | S1.9 | one public-surface pass, not two (Q2) |
| `gantt.scale =` / `gantt.scroll =` | **cut** | one key, one write path (`plans/02` §1.1) |
| A sticky header that does not scroll away vertically | S1.10 | one line in the shipped stylesheet (D-S1.8-11) |
| `.fg-row { width: 100% }` moving out of `render/dom` | S1.10 | the shipped stylesheet (§3.4) |
| Sub-pixel drift between panes under a fractional device-pixel ratio | S7, if measured | the element's reported position handed back through `ScrollAttachment` (D-S1.8-12) |
| Async veto on `beforeGridWidthChange` | S4 | the gesture controllers `plans/02` §3 describes |
| A second chrome gesture, and with it the question of whether the splitter belongs in `interaction/` | when one exists | a second caller (D-S1.8-5) |
