# Review — the S1.5b–S1.11 API designs in issue #1

**Date:** 2026-08-24 · **Target:** the six API-design comments on issue #1 (S1.5b, S1.7, S1.8, S1.9, S1.10, S1.11) · **Baseline:** `main` @ `8002a88`

Three axes, kept separate on purpose: **Standards** (does the proposed API follow this repo's documented rules?), **Spec** (does it implement what issue #1 and `plans/00`–`03` asked for?), and **Design** (is it clean, legible, and extensible?). A proposal can pass one and fail another; merging the axes is what lets one mask the other.

Counts: **Standards 20** (9 hard, 8 judgement calls, 3 contradictions of current code) · **Spec 14** (5 partial/missing, 4 scope creep, 5 wrong-as-designed) · **Design 12**.

---

## Fix order

Ranked by what blocks code from starting, not by axis.

1. **`Viewport.#batch` has no primitive** (Design). S1.9's anchored zoom depends on suppressing notification across two model writes. `TimeScaleModel.#invalidate()` notifies synchronously and unconditionally (`src/layout/viewport/time-scale-model.ts:90-93`), and S1.5b's `ScrollModel` proposes no suspend/resume. The "one reaction per zoom" guarantee is unimplementable as written.
2. **S1.5b's notify rule carries two incompatible jobs** (Spec c3 + Design). "Notify iff the resolved (clamped) position changed" is doing duty as both the render→measure→render loop-breaker *and* the extent-update path. When the dataset grows and the position stays valid, nothing notifies `scroll-binding`, the native scroller's extent is never rewritten, and the new rows are unreachable. Both axes found this independently.
3. **S1.9 silently reverses locked decision D-F** (Spec c1). Needs an explicit decision record before code.
4. **"viewport", "binding", and "resize" each name three concepts** (Standards, S1.7/S1.8/S1.5b). The #7 "chart" failure repeating verbatim, in the exact area S1 exists to settle. Cheapest to fix now; a rename after the code lands is the expensive version.
5. Everything else below.

---

## Standards

`plans/02` §1.5 is the naming rule throughout: greppable pairs, one name per concept, names specific enough to disambiguate at a glance. **HARD** = documented-standard violation, **JC** = judgement call.

### S1.5b — ScrollModel

- **JC / naming (§1.5, #7 precedent).** Five `Scroll*` types where "binding" means three different things: `ScrollBinding` (data a Gantt contributes), `ScrollBindingHandle` (the push handle), `ScrollElementBinding` (the DOM binder returned by `bindScroll`).
- **JC / Mysterious Name.** `ScrollIntent { at?: Partial<ScrollPosition> }` — `at` reveals nothing.
- **Doc drift not in the spec-edit list.** The proposal moves the model to `layout/viewport/`, but `CONTEXT.md:124`, `plans/01` §8.2, and `eslint/rules/no-scroll-outside-scroll-model.cjs:2` all still say `view/`. Three doc sites; only the exemption is listed.
- Verified true: `plans/01` §8.2 does contain the "no standalone notify primitive" sentence; the exemption really is at `no-scroll-outside-scroll-model.cjs:26`.

### S1.7 — windowed frame + `Viewport`

- **HARD (§1.5).** "viewport" becomes three concepts at once: the new fan-in class `Viewport`, `LayoutInput.viewport` (the culling window), and the measured pane box (`ScaleBinding.viewportWidth`, `ScrollBinding.viewportSize`, `handle.setSize`).
- **JC.** `Viewport.window` — `window` is the exact identifier the DOM-free-core rule bans, used as the core's own property name. Its `{ x; y; width; height }` is written inline in three places (`LayoutInput`, `GeometryFrame`, `Viewport.window`) → **Data Clumps**; `PixelWindow { x, width }` in `time/` makes a fourth window type.
- **JC (`CONTEXT.md:68`).** "ids derive from `entry.id` alone" contradicts the glossary's `Item.id` = `${entryId}:${segmentIndex}`.
- **HARD (CLAUDE.md, "Every config key is live-reconfigurable").** `LayoutInput.overscan` gets no setter anywhere on `Viewport`/`Gantt`.
- Claims verified accurate: `viewport.y` is hardcoded at `gantt-shell.ts:119`; `MAX_TICKS = 100_000`; no horizontal culling exists.

### S1.8 — panes + splitter

- **HARD (§1.5).** `bindSplitter(handle, { onResize })` collides with `bindResize`/`resize-binding.ts` (host measurement, #8) and with `interactions.resize` (the bar-resize gesture, `plans/02` §4.1). Three concepts, one word.
- **HARD (CLAUDE.md API; `plans/02` §1.3).** The splitter mutates `gridWidth` through `onGridWidthChange`/`onResize`/`onCommit` callbacks — no cancelable `before*` pair (`beforeGridResize`/`gridResize`) on the event bus.
- **JC / Mysterious Name.** `PaneLayout.measure(): Size` on an object owning three panes doesn't say it returns the *timeline* pane.
- Claims verified: `readRowLabelWidth`/`getComputedStyle`, the `marginLeft`/`left` offsets, `rowLabelWidth`, and `gantt-shell.ts:98` all exist as described.

### S1.9 — presets and zoom

- **HARD (§1.5).** `zoom` names two concepts: `TimeScaleZoom` (density) and `setPreset(ref, { zoom: 'follow' | 'keep' })` (whether to re-fit).
- **HARD (`plans/02` §7).** `resolvePreset` "Throws `UnknownPresetError`" — not stated as a `FreeGanttError` subclass with a code ("typed and actionable … never bare strings"). Separately, §7 lists unknown preset id as a *dev-mode warning*; the proposal flags the edit, but the contradiction stands until §7 changes.
- **Contradicts current code.** "an unsupported unit no longer throws from `stepBy`'s default case" — `src/time/scale.ts` still throws `RangeError` from both `stepBy` and `ticks()`.
- **Contradicts S1.8 / Middle Man + Message Chain.** S1.8 says "one object, not four delegating getters"; S1.9 §5 then gives `Gantt` exactly `preset`/`range`/`zoom`/`zoomTo`/`zoomBy` delegating to `scale`, plus public `scale`/`scroll` — so `gantt.scale.preset` is a documented second path. `Viewport.setPreset()` alongside a `preset` setter is two ways to write one key (`plans/02` §1.1).
- **JC / Primitive Obsession.** `PresetRef = ViewPreset | string` — bare `string` for a preset id in a repo with brand helpers.

### S1.10 — theming + a11y

- **HARD (`plans/01` §4).** `describeBar` resolved in `layout/`, riding the frame as `FrameBar.ariaLabel`: "No user render output in the frame. Custom renderers are invoked by the DOM backend at sync time." A host callback in `LayoutInput` also breaks "returns pure serializable geometry" and snapshot-testability. The `FrameBar.label` precedent it cites is the *entry's own name*, not host output.
- **HARD (`plans/02` §4).** `data-flag~="hasConflict"` diverges from the documented level-2 selector `.fg-bar[data-flag~="conflict"]`.
- **HARD (CLAUDE.md).** `styles` and `a11y` have no live setter; only `theme` is claimed live.
- **Bogus citation.** "Per `plans/04` §55" — `plans/04` has five sections; the guardrails-first rule is §3.2/§3.3.
- **JC (`plans/01` §5).** "Exactly one formatting helper (`formatEndInclusive`)" — the proposal ships two.
- **Contradicts repo state.** "`freegantt/styles.css` is a real package export" — `package.json` `exports` is sealed to `"."` only.

### S1.11 — gate

- **Contradicts `plans/03` S1.** The acceptance box budgets "a 5-line harness demo"; the proposal declares "If this demo needs a fifth line … the API is wrong."
- **Minor.** The gate shells out to `pnpm playwright test`, bypassing the existing `test:e2e` script. Verified true: `e2e/harness.spec.ts`, `@playwright/test`, `.slice` = `S1`, and the exact "no automated checklist defined yet" string.
- **JC / Mysterious Name.** `generateEntries` in `fixtures/large-dataset.ts` says nothing about being large or seeded.

---

## Spec

### (a) Requirements missing or partial

1. **I12's other half has no rule and no owner.** `plans/01` §11: *"I12 | All pixels-from-time via `TimeScale`; all scroll via `ScrollModel` | lint + review rule"*; `plans/03` S1: *"The I12 rule (no pixels-from-time or scroll access outside these objects) is in force now"*; issue §5: *"with I9 and I12 both enforced rather than asserted."* `eslint/rules/` contains only `no-scroll-outside-scroll-model.cjs` — there is no time→px rule. S1.5b retargets the scroll rule; no proposal creates the pixels-from-time one, and S1.11's gate line *"time→px confined to `TimeScale` … `guard-red-test.mjs`"* assumes a rule that doesn't exist.
2. **Acceptance A1 is quietly downgraded.** `plans/03` S1: *"Scroll a 5,000-entry fixture smoothly; only windowed rows **exist in the DOM**."* S1.11 runs it as `pnpm vitest run --project pure -t "[S1-A1]"` and relabels it *"emits only windowed rows."* The `pure` project is Node with no DOM, so this check cannot assert the acceptance condition. Undeclared.
3. **Typed errors.** `plans/02` §7: *"`FreeGanttError` subclasses with codes, never bare strings."* Only S1.9 adds a typed error. S1.7's `startOf`/`ticks` and S1.8's `resolveHost` keep bare `Error`s.
4. **Roving tabindex with no mover.** S1.10 ships *"exactly one `tabindex="0"` (the active row)"* but defers all navigation to S4. Nothing in any proposal defines or changes the active row, so the focus ring is permanently on row 0 — against D11 (*"never a retrofit pass"*).
5. **`gridWidth` has no public route.** `PaneLayout` takes it, `GanttShellOptions` doesn't forward it, `Gantt` never gains it — vs `plans/02` §1 *"Every config key is live-reconfigurable."*

### (b) Scope creep

- **S1.10 `styles: 'auto' | 'none'` + a new `freegantt/styles.css` package export.** The step bullet is tokens + `data-flag` + light/dark; this adds a second public export to the sealed `exports` map (CLAUDE.md: *"Only `api/` and `model/` types are public"*) and a delivery mode nobody asked for.
- **S1.10 `a11y.describeBar` + `LayoutInput.describeBar` + `FrameBar.ariaLabel`** — a level-3 renderer callback (`plans/02` §4) landing at a step whose bullet is *"roles and labels on rows/bars."*
- **S1.9 `setPreset(ref, { zoom: 'follow' | 'keep' })`** — a policy knob absent from D-E and D-F.
- **S1.5b `panBy`** — §5's shared-scroll API is `scroll.xOnly()`/`.yOnly()` only.

### (c) Addressed but wrong, or contradicting a lock

1. **S1.9 reverses D-F, undeclared.** D-F (locked): *"`TimeScaleModel.zoomTo({ pxPerMs, anchorInstant, anchorX })` **recomputes `range.start`** so the anchored instant stays under the cursor."* S1.9: *"it **never rewrites `range.start`**"*, and relocates the method to `Viewport` with a different signature. The reasoning is good, but "Spec edits implied" lists only §8.2 wording — it never says D-F is being replaced.
2. **The shipped default makes horizontal virtualization dead code.** S1.9 keeps `range: 'fitDataset'` + `zoom: 'fitViewport'` as defaults, i.e. contentWidth ≡ viewport width ⇒ max scroll x = 0. S1.7's horizontal culling, `overscan.px`, `TimeScale.contentWidth`, and `plans/03` S1's *"vertical + horizontal virtualization windows"* are then unexercised by default, including in the 5,000-entry demo.
3. **S1.5b's notify rule blocks content-extent updates.** *"Notify iff the resolved (clamped) position changed… `setContentSize(frame.contentHeight)` after a render notifies nobody."* When the dataset grows and position stays valid, nothing notifies `scroll-binding`, so the native scroller's extent is never rewritten and the new rows are unreachable.
4. **S1.8 deletes the row-label width without a replacement owner.** It removes `RenderBackend.rowLabelWidth` and `readRowLabelWidth()`, moving `--fg-grid-width` to `PaneLayout`. But `render/dom/index.ts:79` sizes each label node from that number; the design never says how the backend gets a width after the token moves to `view/`.
5. **`data-flag` vocabulary diverges silently.** `plans/02` §4 documents `.fg-bar[data-flag~="conflict"]`; S1.10 generates tokens from `BarFlags` keys, yielding `hasConflict`, and its spec-edit list doesn't mention the change — it makes an internal type name the public CSS contract.

### Correctly declared — not findings

S1.5b dropping `observable.ts` (`plans/01` §8.2 already records *"There is no standalone notify primitive"*); S1.9 moving unknown-preset-id from §7 warning to throw; S1.7's `header.bands`/`contentWidth`/`overscan`; S1.8's `--fg-row-label-width` → `--fg-grid-width`.

### Stale-claim check

S1.7's "what already landed" is accurate — `FrameHeader.ticks`, `LayoutInput.viewport`/`preset`/`heights`, and `indexAtY` culling are in `src/layout/frame.ts`; `#renderHeader` is gone; `gantt-shell.ts:119` does hardcode `y: 0`.

---

## Design — clean code, legibility, extensibility

1. **`ScrollBinding` collides with `scroll-binding.ts` (S1.5b).** `ScrollBinding` (a *data* contribution, `{contentSize, viewportSize}`), `ScrollBindingHandle`, `ScrollElementBinding`, `bindScroll()`, and the file `view/scroll-binding.ts` — five names, three concepts, "binding" meaning two different things. `CONTEXT.md:120` already spends "ScaleBinding" on the data sense, so the DOM sense needs a different word (`ScrollAttachment` / `bindScrollElement`), or the data type becomes `ScrollExtent`.
2. **Rectangle types have no home.** `LayoutInput.viewport` is an anonymous `{x,y,width,height}` today (`src/layout/frame.ts:102`). The proposals add `PixelWindow {x,width}` in `time/`, `Size {width,height}` declared in `layout/viewport/scroll-model.ts`, and `Viewport.window` returning another inline rect. Four overlapping shapes, one exported from a *scroll model* so `view/`, `render/`, and `layout/` would all import their geometry primitive from there. One `layout/geometry.ts` owning `Size`/`PixelWindow` fixes it and costs nothing now.
3. **`Viewport.#batch` is asserted but its primitive doesn't exist (S1.9).** See Fix order #1.
4. **Three binding-handle shapes, no stated pattern.** `ScaleBindingHandle{unbind, setViewportWidth}`, `ScrollBindingHandle{unbind, setContentSize, setViewportSize}`, `ViewportHandle{unbind, setSize, setContentSize}` — same seam, three ad-hoc shapes. And `bindSplitter` returns a bare `() => void` while `bindScroll` returns an object with `dispose()`. Pick one convention and write it into `plans/01` §8.2 once.
5. **`Overscan {rows?, px?}` is a mysterious name (S1.7).** The prose says `rows` is vertical and `px` is horizontal; the type says neither. Name the axes.
6. **`ViewportContent {timeZone, entries}` re-clumps what `DatasetLike` already is** (`view/gantt-shell.ts:11-14`), which exists *because* #40 objected to re-clumping. Third copy of the pair — `ScaleBinding` has it too.
7. **`ticks(preset, window?)` keeps the pathological path alive.** The optional window means the whole-range walk — where `MAX_TICKS = 100_000` (`time/scale.ts:77`) *is* the behaviour at hour-preset over years — survives as a supported call. Make the window required; whole-range callers pass `{x: 0, width: contentWidth}`.
8. **Mutable binding objects.** `ScrollBinding.contentSize` is non-`readonly` and the handle mutates the caller's object, copying `ScaleBinding.viewportWidth`'s existing pattern. The caller keeps a reference it can mutate behind the model's back, bypassing invalidation. Cheaper to fix at one instance than two.
9. **`data-flag~="hasConflict"`** — the `has` prefix is a TS field-naming artifact leaking into a CSS token vocabulary. Strip it in the generator.
10. **`--fg-grid-width`** reads as gridline spacing, not grid-*pane* width.
11. **`presets: Record<string, ViewPreset>`** gives shipped ids no autocomplete. A `ShippedPresetId` union inside `PresetRef` costs one line and helps agents more than humans.
12. **`PaneLayoutOptions.onGridWidthChange`** is a bespoke callback where `plans/02` §3 says "one bus, one vocabulary". Internal to `view/` it's defensible, but the public surface then has no way to observe or veto a splitter drag.

### Verdict on the four questions

- **Do they meet our rules?** Mostly yes on layering — the DOM-free/pure-model discipline is respected throughout. No on naming and on live-reconfigurability, which is where nearly every hard finding sits.
- **Are they clean code?** The seams are well chosen; the type surface around them is not — four rectangle shapes and three binding-handle shapes, with no stated pattern for either.
- **Easy for humans and agents to understand?** The prose is excellent and the "what already landed / what is not done" framing is right. But no single artifact holds the resulting contract — `Viewport` spans S1.7 and S1.9, `ScrollModel` spans S1.5b and S1.9 — and three names ("binding", "viewport", "resize") each carry three meanings, which is precisely what makes an agent guess wrong. Every proposal promises a `plans/01` §8.2 paragraph; land those consolidations *with* each step, or the issue thread becomes the spec.
- **Easy to change/extend later?** Yes — `range`-vs-`zoom` separation, presets-as-data, `RenderSurfaces` deleting `rowLabelWidth`, `RowHeightIndex` already shipped, and flags generated from `BarFlags` keys all buy real room. The `range`/`zoom` split is the single best decision in the batch. Extensibility isn't the blocker; the `#batch` gap and the overloaded notify rule are.

---

## Where the axes agree

Two findings surfaced independently on more than one axis, which makes them the safest starting point:

- The `hasConflict` token divergence from `plans/02` §4 (Standards + Spec).
- S1.5b's notify rule being unable to serve both loop-breaking and extent updates (Spec + Design).
