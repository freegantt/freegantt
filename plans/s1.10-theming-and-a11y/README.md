# S1.10 — Theming tokens, parts vocabulary, a11y foundation

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.10 · **Issue:** #1 · **Baseline:** `main` @ `1046aee` plus this branch's own `S1.9: add UnknownPresetError and EntryNotFoundError` (`e06a4aa`) — mostly spec-only. S1.9's types/errors step has landed (`UnknownPresetError`/`EntryNotFoundError` are in `src/model/errors.ts`, re-exported from `model/`/`api/`); the rest of S1.9 has not (`src/time/presets.ts` does not exist; `Gantt`/`GanttShell` still expose only `gridWidth`, `on`/`off`, `destroy`). This document builds on [`plans/s1.9-presets-and-zoom/README.md`](../s1.9-presets-and-zoom/README.md) as **settled design**, same as S1.9 built on S1.8's README before its own code existed. Code order stays `S1.9 → S1.10` (`plans/temp_todo_for_s1-close.md` §3): the theming pass must not have to guess how many header bands a preset draws, and S1.9 is what makes that count variable (`dayAndWeekPreset` etc., two bands).
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, `batch()` — and **D11** ("solid accessibility built in as slices land … never a retrofit pass"), which this step is the first to make good on.
**Supersedes:** the [S1.10 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400111232) (its revised form) and the S1.10 findings in `plans/fix-issue1-apis.md`, wherever they disagree. §2 records every decision and which finding it closes. Also incorporates `plans/2026-08-25-s1.10-theming-a11y-review.md`'s findings against *this document*: H2/H3/JC3/JC4/S1/S2 applied as stated; H1 applied with a corrected diagnosis — the review's own fix (moving `role="grid"` off the host) doesn't address the actual break, which is that `.fg-row` and `.fg-bar` are DOM cousins under the split-pane architecture (D-S1.8-1), never ancestor/descendant of each other, so no role placement on host/row/bar alone yields a conformant grid; D-S1.10-5 now ships `group`/`listitem`/`img` instead. JC1/JC2 close as side effects (JC1 was already a recorded decision; JC2's question no longer applies once bars stop claiming `gridcell`).

This directory is the settled spec for S1.10, in the same form as [`plans/s1.9-presets-and-zoom/README.md`](../s1.9-presets-and-zoom/README.md).

> **§0 is settled.** Every finding the review raised against the S1.10 issue comment, and every place that comment now disagrees with code S1.8 actually shipped, is answered below. Everything in this document is settled.

---

## 0. Scope calls — confirmed

The issue comment was revised once already (see its own banner) — that revision cut `styles: 'auto'|'none'` and the `freegantt/styles.css` export, renamed `BarFlags`/`LinkFlags` keys, cut `a11y.describeBar`, flattened `a11y` to one live key, cut the second inclusive-end formatter, and fixed the `plans/04` citation. Those six are **not reopened here** — they're restated in §2 as decisions this document owns. What's new in this pass is reconciling the (still S1.8-era) comment against the `PaneLayout`/`render/dom` code S1.8 actually shipped, which the comment predates.

| # | Question | Answer |
|---|---|---|
| **Q1** | **Does the shipped stylesheet replace `PaneLayout`'s hand-written inline layout, or only add the tokens/parts the comment describes?** Not asked in the comment — it was written before `src/view/pane-layout.ts` existed. | **It replaces the structural half.** `pane-layout.ts` currently sets `display`, `overflow`, `flexDirection`, `flexShrink`, `flex`, `minWidth`, `cursor` and `position` inline (`pane-layout.ts:51-105`) — none of those are `transform`/`width`/`height`, so the new lint rule (§3.3) would fail on file one if the rule landed with nothing to replace it. §2 D-S1.10-6. |
| **Q2** | **What are the shipped part class names — the comment's `fg-pane fg-pane--grid` / `fg-pane fg-pane--timeline`, or something else?** | **The names already in code**, unchanged: `fg-grid-pane`, `fg-grid-spacer`, `fg-rows-clip`, `fg-rows`, `fg-splitter`, `fg-timeline-pane` (`pane-layout.ts`), `fg-header`, `fg-band`, `fg-tick`, `fg-row`, `fg-bars`, `fg-bar` (`render/dom/index.ts`). Renaming shipped, tested class names to match a pre-S1.8 draft is churn with no behavior change and a broken `pane-layout.test.ts`/`gantt-shell.test.ts` for no reason. §2 D-S1.10-1. |
| **Q3** | **`node.dataset['kind'] = geom.kind` already runs (bar `patch`, `render/dom/index.ts`) — does S1.10 still need to "add" `data-kind`?** | **No — it's already shipped.** `plans/02` §4.1's "every bar element carries `data-kind`" is done. S1.10's job on that front is `data-flag` only (bars carry no flag state yet — `bar.flags` is computed by `layout/` since S0 but nothing in `render/dom` reads it). §2 D-S1.10-2. |
| **Q4** | **Does the a11y row/cell structure need a new child node?** Not addressed in the comment. | **Yes, but not for a `row`/`rowheader` pair** — that pairing only means something inside a `grid`/`table`, and D-S1.10-5 (revised) drops the grid pattern for this step since bars can't be DOM descendants of their row (D-S1.8-1's split-pane architecture puts them in different scroll surfaces). `.fg-row` still gains one child, `.fg-row-label`, carrying the text `.fg-row` sets as `textContent` today, with no role of its own — it exists now so grid columns (S6) can add siblings beside it later without restructuring. §2 D-S1.10-7. |
| **Q5** | **`--fg-header-height` and `--fg-splitter-width` — new tokens, or already shipped?** The comment lists them as part of "the `--fg-*` table" without saying which exist. | **Already shipped at S1.8** (`pane-layout.ts:18-21`, defaults 20 and 4). S1.10 only adds them to the documented table (`plans/02` §4) — no code change. Same situation as `--fg-grid-pane-width` was for S1.9 (temp_todo §2 C4). §2 D-S1.10-1. |
| **Q6** | **`no-inline-style-outside-geometry` — scoped to `src/render/**` and `src/view/**` per the comment. Does that catch `attachScroll`/`attachPaneSize`, which write no styles, or `splitter.ts`, which writes none either?** | **Nothing to catch there — confirmed, not assumed.** `grep` over `src/view/*.ts` for `.style.` finds writes only in `pane-layout.ts` and (test-only) `gantt-shell.test.ts`/`pane-layout.test.ts`. `splitter.ts`, `scroll-attachment.ts`, `pane-size-attachment.ts`, `event-bus.ts` are clean today and stay clean; the rule guards against regression in them, not a known violation. |
| **Q7** | **Roving tabindex — the fix-issue1-apis.md finding (§(a).4) says the earlier draft's "exactly one `tabindex='0'` (the active row)" has no mover and permanently focuses row 0, against D11.** | **Ship the host as the one tab stop, not a row.** `tabindex="0"` on the Gantt host element itself (the region, not any row) is honest today — nothing yet defines an "active row" to move it to. Rows/bars get roles and labels but no `tabindex` of their own until S4's keyboard controller exists to move one. §2 D-S1.10-5, restated from the comment's own fix — recorded here because `fix-issue1-apis.md` never got a closing entry for it. |

Not a question: `formatEndInclusive`/`formatDate`, the `theme` live setter, `a11yLabel` as one flat live key, `BarFlags`/`LinkFlags` renamed to `conflict`/`cycle`, and the cut `styles.css` export are the comment's own June-review fixes. They are restated as decisions in §2 (D-S1.10-3, D-S1.10-4, D-S1.10-8) so this document is self-contained, not because review reopened them.

---

## 1. User stories

Acceptance for each story is the checkbox under it — the only copy of this checklist (an earlier pass of this document also had one at the bottom of §8, duplicating this one; that copy is gone, not just unchecked elsewhere).

- **U1.** I load the library with no CSS of my own. Rows, bars, header bands and the splitter already look like a Gantt chart — spacing, borders, a bar fill color — because the library ships a base stylesheet once per document.
  - [x] Base stylesheet + `data-flag` selector work with zero host CSS (`view/styles.test.ts`, `render/dom/index.test.ts`).
- **U2.** I write `.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--fg-warn); }` in my own stylesheet. No JS, no renderer callback — a scheduling-plugin conflict (S3) shows up the moment the flag is true.
  - [x] Same tests as U1 cover this — the selector exists and works even though nothing sets `conflict: true` until S3.
- **U3.** I set `gantt.theme = 'dark'`. Every token flips in that document; a system in `prefers-color-scheme: dark` gets the same look with `theme` left at its default `'auto'`.
  - [x] `theme` setter is live (`api/gantt.test.ts`).
- **U4.** I set `--fg-row-height: 40px` and `--fg-bar-radius: 6px` on the host element. The library reads them once/on remeasure (existing `readPixelProperty` cadence) — no rebuild, no option.
  - [x] Token overrides read once/on remeasure, no rebuild (`api/gantt.test.ts`).
- **U5.** I use a screen reader. Tabbing onto the Gantt announces it as a labelled group; arrowing (S4, not yet) will move a row cursor; today, every row and bar the reader can already reach (via the DOM tree, not a roving tabindex) is labelled with real dates, not raw pixel geometry.
  - [x] Roles, labels, one honest tab stop (`render/dom/index.test.ts`).
- **U6.** (developer) I write `e2e` selectors against `[data-testid="fg-bar"][data-item-id="t42"]` instead of a CSS class that could change with a design tweak.
  - [x] `data-testid` hooks present (`render/dom/index.test.ts`); the `[S1-A1]`/`[S1-A4]` selectors S1.11's boxes will select on exist now, not invented at S1.11.
- **U7.** (developer) I add a new `BarFlags` key next month (say, `late`). I don't touch `render/dom` — the flag shows up as `data-flag~="late"` because the generator reads the object's keys, not a hand-written map.
  - [x] A new `BarFlags` key needs no `render/dom` edit (`render/dom/index.test.ts`, table-driven).

---

## 2. Decisions

Settled in review (the comment's own revision) and in this pass (reconciling against S1.8's shipped code). Each states the alternative it beat and, where one exists, the finding it closes.

### D-S1.10-1 — No renames. The token table and the part-class list document what S1.8 already shipped, plus what's missing

`--fg-row-height`, `--fg-grid-pane-width`, `--fg-header-height` (fallback 20), `--fg-splitter-width` (fallback 4) exist in code today, each read through `readPixelProperty` (`render/dom/pixel-property.ts`, whose own header comment already says *"S1.10's theming pass multiplies the count"*). S1.10 adds the remaining metric and every colour token, and documents all of them in `plans/02` §4 as one table — it does not touch the four that exist. Class names are the same story: the twelve already in code (Q2's list — not repeated here) are the real vocabulary, unchanged and un-renamed; the *rejected* BEM alternative and why (test churn, no behavior change) is Q2's `Rejected` line, also not repeated here. The colour tokens' default *values* (light and dark) are D-S1.10-9's decision, not this one — this decision is only about which tokens/classes exist.

### D-S1.10-2 — `data-flag` is new; `data-kind` is not

Bars already carry `data-kind` (`render/dom/index.ts:139`, shipped with S0/S1's `BarGeom.kind`). S1.10's actual gap is that `FrameBar.flags` (`BarFlags`, computed since S0, still empty until S3's scheduling plugin sets `conflict`/`cycle`) is never read by any backend. `syncBars`'s `BarGeom` gains `flags: BarFlags`, and `patch` writes `data-flag` as a space-joined list of the flags' truthy keys:

```ts
function flagTokens(flags: BarFlags): string {
  return (Object.keys(flags) as (keyof BarFlags)[]).filter((k) => flags[k]).join(' ');
}
// patch: node.dataset['flag'] = flagTokens(geom.flags);
```

Generated, not hand-mapped, per `plans/02` §4's documented selector (`.fg-bar[data-flag~="conflict"]`) — adding a `BarFlags` key needs no `render/dom` edit (U7). `FrameLink` gets the same treatment for `LinkFlags` when link rendering lands (S3); nothing here blocks on that, `LinkFlags`'s shape is already `{ inactive?; cycle? }`.

### D-S1.10-3 — `BarFlags`/`LinkFlags` keys become the CSS vocabulary directly

```ts
// src/layout/frame.ts — renamed, not transformed
export interface BarFlags {
  conflict?: boolean;   // was hasConflict
  cycle?: boolean;      // was inCycle
}
export interface LinkFlags {
  inactive?: boolean;
  cycle?: boolean;      // was inCycle
}
```

Closes `fix-issue1-apis.md`'s Standards + Spec finding (both axes flagged this independently — "Where the axes agree"): generating tokens from the pre-rename keys would yield `data-flag~="hasConflict"`, silently making an internal TS field-naming artifact the public CSS contract `plans/02` §4 documents as `conflict`. The rename is a `plans/01` §4 edit (the `GeometryFrame`/`FrameBar` code block), landed with this step, not a transform layer added in the generator to hide the mismatch.

### D-S1.10-4 — One inclusive-end formatter; `theme` and `a11yLabel` are flat, live keys

```ts
// src/time/format.ts — new file
/** The one place half-open `end` becomes an inclusive display value. No `end - 1` anywhere else
 *  (plans/01 §5, promised since S0, no file has implemented it until now). */
export function formatEndInclusive(zone: string, end: Instant): string;
/** Plain display formatting for an instant needing no conversion — a start is already inclusive. */
export function formatDate(zone: string, i: Instant): string;
```

A span composes as `formatDate(zone, start)` + `formatEndInclusive(zone, end)`; nothing else touches the half-open→inclusive conversion. Two functions ship, not one — `plans/01` §5's "exactly one formatting helper" governs the half-open→inclusive *conversion* specifically, not every formatter: `formatDate` does no conversion at all (a start is already inclusive, it just needs zone-aware display), so it isn't a second instance of the thing "exactly one" counts. The earlier draft's `formatSpanInclusive` is cut for the reason "exactly one" actually names — it would have been a *second path* doing the half-open→inclusive conversion `formatEndInclusive` already owns (`fix-issue1-apis.md` Standards JC).

```ts
// GanttOptions / Gantt — both live, both flat
theme?: 'auto' | 'light' | 'dark';     // default 'auto'; sets data-fg-theme on the host
a11yLabel?: string;                     // default 'Gantt'; sets aria-label on the host
```

Closes `fix-issue1-apis.md`'s HARD finding: the earlier `a11y` object (with `describeBar`) had no setter anywhere, breaking "every config key is live-reconfigurable." `describeBar` stays cut — a host callback producing per-bar text is a level-3 renderer (`plans/02` §4), and it does not belong in a step whose bullet is "roles and labels," not "renderer callbacks." What ships instead is the library's own computed label (D-S1.10-5).

### D-S1.10-5 — `FrameBar.a11yLabel`, computed in `layout/`; host is the one tab stop; no roving tabindex yet

```ts
export interface FrameBar {
  // ...unchanged...
  /** What a screen reader announces: `${entry.name}, ${formatDate(zone, start)} – ${formatEndInclusive(zone, end)}`.
   *  Library-derived text, not host render output — same precedent as FrameBar.label (plans/01 §4:
   *  "no user render output in the frame"). Composed here because it needs the dataset zone and
   *  inclusive-end formatting, both time/-only (layer graph, .dependency-cruiser.cjs). */
  a11yLabel: string;
}
```

Named `a11yLabel`, not `ariaLabel`: `layout/` is backend-neutral and ARIA is a DOM vocabulary (`render/dom` maps it to `aria-label` at sync time, the same relationship `kind` has to `data-kind`).

Roles (`render/dom` writes these at `mount`/`sync`, all new) — **not** the ARIA `grid`/`row`/`gridcell` pattern (revised from an earlier draft of this decision; see the note below the table):

| Element | Role / attribute |
|---|---|
| host | `role="group"`, `aria-label` from `a11yLabel` option, `tabindex="0"` — the **only** tab stop this step defines |
| `.fg-row` | `role="listitem"`, `aria-posinset` = `frame.rows[].index + 1`, `aria-setsize` = total row count (not the windowed count) |
| `.fg-row-label` (new child, D-S1.10-7) | no role — its text is `.fg-row`'s accessible name via normal content-based naming, same as before the child existed |
| `.fg-bar` | `role="img"`, `aria-label` from `FrameBar.a11yLabel` — an image-like element carrying its own description, not a cell of anything |

`aria-posinset`/`aria-setsize` need the frame's absolute `index` and total row count, both already carried (`GeometryFrame.rows[].index`, `contentHeight`) — virtualization without them announces "row 3" with no "of 30" over a 5,000-row dataset.

**Why not `role="grid"`/`"row"`/`"gridcell"`, corrected from an earlier pass of this document:** that pattern requires `gridcell` to be a DOM descendant of its `row`. `.fg-row` renders into the grid pane's row layer; `.fg-bar` renders into the timeline pane's bar layer (D-S1.8-1's split-pane architecture — two independent scroll surfaces sharing row geometry, not one DOM subtree). A row and its bar are DOM cousins under `host`, never ancestor/descendant of each other, so no arrangement of roles on `host`/`.fg-row`/`.fg-bar` alone produces a spec-conformant grid — the earlier draft's table assigned `grid`/`row`/`gridcell` without checking this, and an external review's own fix for it (moving `role="grid"` from `host` to the row layer) doesn't repair the row↔bar relationship either, since that's a different pair than the one it diagnosed. `role="listitem"`/`role="img"` make no claim the DOM can't back up: each row is independently reachable and self-describing, each bar is independently reachable and self-describing, and nothing asserts a containment relationship between them that doesn't exist. The full grid pattern returns if a later step ever puts a row's cells in the same DOM subtree as the row itself (§9) — not committed to a specific slice, since S6's column work adds cells beside `.fg-row-label` in the *grid pane*, and doesn't by itself move bars out of the timeline pane.

**Closes `fix-issue1-apis.md` §(a).4.** The earlier draft's roving `tabindex="0"` on "the active row" had no mover defined anywhere in S1–S3, so the ring would sit permanently on row 0 — worse than not claiming it, against D11. This step ships one honest `tabindex="0"` on the host; S4's keyboard controller changes the host's `tabindex` to `-1` and starts moving one row's, in the same commit that introduces the thing being roved.

*Rejected:* deferring roles/labels entirely until S4. D11 is explicit that a11y lands with the slices that create the affected surface, not as a retrofit — rows and bars exist now, so their roles and labels ship now; only the *navigation* waits for the controller that provides it.

### D-S1.10-6 — `pane-layout.ts`'s structural inline styles move to the base stylesheet; only per-frame geometry stays inline

The new lint rule (`freegantt/no-inline-style-outside-geometry`, `src/render/**` + `src/view/**`, allowing only `transform`/`width`/`height`) makes `pane-layout.ts` non-compliant as shipped: `display`, `overflow`, `flexDirection`, `flexShrink`, `flex`, `minWidth`, `cursor`, `position` are all set inline there (`pane-layout.ts:51-105`). This step's stylesheet absorbs every one of them as class rules keyed to the six `fg-*` pane class names (D-S1.10-1):

```css
:root {
  --fg-pane-bg: #FAFAF7;
  --fg-splitter-color: #E6E2D9;
  --fg-header-bg: #F4F2EC;
  --fg-header-band-bg: #FFFFFF;
  --fg-header-text: #1A1815;
  --fg-header-subtext: #9A958B;
  --fg-header-divider-color: #E6E2D9;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(26, 24, 21, 0.028);
  --fg-row-label-color: #1A1815;
  --fg-bar-fill: oklch(0.55 0.13 245);
  --fg-bar-label-color: #FFFFFF;
  --fg-warn: #D97706;
}
[data-fg-theme='dark'] {
  --fg-pane-bg: #15161A;
  --fg-splitter-color: #2B2F36;
  --fg-header-bg: #22252B;
  --fg-header-band-bg: #1B1D22;
  --fg-header-text: #ECEAE3;
  --fg-header-subtext: #6E6A62;
  --fg-header-divider-color: #2B2F36;
  --fg-row-odd-bg: rgba(255, 255, 255, 0.032);
  --fg-row-label-color: #ECEAE3;
  --fg-bar-fill: oklch(0.72 0.13 245);
  --fg-bar-label-color: #ECEAE3;
  --fg-warn: #FBBF24;
}
@media (prefers-color-scheme: dark) {
  /* 'auto' (no data-fg-theme attribute) follows the system; an explicit attribute always wins on
   * specificity grounds over this block, which is why 'light'/'dark' never fight the media query. */
  :root:not([data-fg-theme]) { /* same custom properties as [data-fg-theme='dark'] above */ }
}

.fg-grid-pane { display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; background: var(--fg-pane-bg); }
.fg-grid-spacer { flex-shrink: 0; }
.fg-rows-clip { position: relative; flex: 1 1 auto; overflow: hidden; }
.fg-rows { position: relative; }
.fg-splitter { flex-shrink: 0; cursor: col-resize; background: var(--fg-splitter-color); }
.fg-timeline-pane { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; background: var(--fg-pane-bg); }
.fg-header { background: var(--fg-header-bg); }
.fg-band { background: var(--fg-header-band-bg); color: var(--fg-header-text); border-bottom: 1px solid var(--fg-header-divider-color); }
.fg-tick { color: var(--fg-header-subtext); }
.fg-row { background: var(--fg-row-even-bg); }
.fg-row:nth-child(odd) { background: var(--fg-row-odd-bg); }
.fg-row-label { color: var(--fg-row-label-color); }
.fg-bar { background: var(--fg-bar-fill); color: var(--fg-bar-label-color); border-radius: var(--fg-bar-radius, 3px); }
.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--fg-warn); }
```

Colour values above are D-S1.10-9's — this decision only owns which class gets which property (structure), not what the property defaults to (colour). `pane-layout.ts` keeps exactly the writes the rule already allows: `gridPane.style.width`/`splitter.style.width` (both driven by live numbers — `gridWidth`, `--fg-splitter-width`), `spacer.style.height` (`--fg-header-height`, a live number). `rowLayer.style.height = '100%'` also stays inline, on a narrower rationale than the others: `'100%'` isn't a live number, but it depends on `.fg-rows-clip`'s `flex: 1 1 auto` sizing its parent — moving it to a `.fg-rows { height: 100% }` CSS rule works exactly as well (nothing about it needs JS), so this is a judgement call kept inline for now for one reason only: `height` is already an allowed property under the lint rule, so leaving it doesn't need a rule exception, and it keeps `pane-layout.ts`'s few remaining writes visually grouped instead of splitting one element's sizing across two files. `render/dom/index.ts`'s `position: absolute`/`relative` and `contentSizer`'s `top`/`left`/`visibility` move the same way, onto `fg-row`, `fg-bar`, `fg-tick`, `fg-band`, and a new `fg-content-sizer` class; its `transform`/`width`/`height` per-frame writes are unchanged (they're exactly what the rule exists to protect).

This is the concrete instance of what the comment's §3 called "R3's countermeasure, made concrete" — recorded here as a decision because the comment predates `pane-layout.ts` and could not have named these specific lines.

### D-S1.10-1a — `fg-host` is a 13th class, added to close a gap D-S1.10-1's twelve-class list left open

D-S1.10-1 enumerated the twelve `fg-*` part classes already in code as "the real vocabulary, unchanged" — but it was written before the guardrail lint rule (§3.3) existed, and none of the twelve targets the host element itself. `PaneLayout`'s host carries structural styles too (`display: flex; overflow: hidden`, D-S1.8-1's "the host is never the scroller") that have nowhere legal to live once inline non-`transform`/`width`/`height` writes are banned. `fg-host`, set once in `PaneLayout`'s constructor with a matching `.fg-host` rule in `view/styles.ts`, closes that gap.

*Rejected:* targeting the host via `[role="group"]` instead of a class. Rejected because `role="group"` is an accessibility contract (D-S1.10-5), not a styling hook — overloading it as a CSS selector couples two concerns that should stay separable (a future step could need `role="group"` without `fg-host`'s layout, or vice versa), and every other structural element in this codebase is already styled by class, not by ARIA attribute.

### D-S1.10-7 — the grid row gains a label cell child; role structure is additive for S6

`.fg-row`'s `patch` currently writes `node.textContent = geom.label` directly. It now creates one child once (`create`, not `patch` — the child is structural, not per-frame) and writes text to *that*:

```ts
create: () => {
  const node = document.createElement('div');
  node.className = 'fg-row';
  node.setAttribute('role', 'listitem');
  const label = document.createElement('div');
  label.className = 'fg-row-label';
  node.append(label);
  return node;
},
patch: (node, geom) => {
  node.style.transform = `translateY(${geom.top}px)`;
  node.style.height = `${geom.height}px`;
  node.setAttribute('aria-posinset', String(geom.index + 1));
  node.setAttribute('aria-setsize', String(geom.rowCount));
  node.querySelector('.fg-row-label')!.textContent = geom.label;
},
```

`RowGeom` gains `index` (already on `FrameRow`) and `rowCount` — the latter isn't a `FrameRow` field (it's a frame-level fact, the same one `aria-rowcount` would have used on the host), so `sync()`'s `toGeom` callback stamps it onto every row's geom object from `frame.rows.length`, closing over the frame the same way `syncKeyed`'s other `toGeom` callbacks already close over per-call context. `BarGeom` does **not** need `index` — D-S1.10-5's revised role table drops `.fg-bar`'s dependency on row position entirely (no `gridcell`, so no `aria-rowindex` to derive), closing what an earlier pass of this document left as an open question about how a bar would learn its row's index. `.fg-row-label` stays a plain, role-less child: S6's column work adds sibling cells beside it inside the same `.fg-row` — this shape is why the label got its own child now instead of later — and revisits the row's ARIA role at the same time, if the grid pattern becomes reachable then.

### D-S1.10-8 — `styles.css` package export stays cut; `ensureBaseStyles` is the only writer, idempotent per document

**Why this doesn't trip I2:** I2 governs shared *mutable state* — configuration, subscriptions, caches that would let two Gantt instances see each other's changes. `ensureBaseStyles`'s `<style data-freegantt-styles>` marker isn't that: it's an idempotent one-time DOM write guarded by an attribute on the *document*, not a module variable, and the second Gantt's call is a no-op precisely because the marker makes it safe to call twice — no state is shared, exchanged, or capable of drifting between instances. Stated here, not only in the function's own doc comment, so a review checking this decision against I2 doesn't have to go find the source to see the reasoning.

```ts
/** src/view/styles.ts — the only place the library writes a stylesheet. Idempotent per document via
 *  a <style data-freegantt-styles> marker: the DOCUMENT holds the state, not a module variable, so
 *  two Gantt instances in one document share one injected sheet without this being I2's kind of
 *  module-level singleton (I2 governs shared *mutable state*, not an idempotent one-time DOM write —
 *  the second Gantt's call is a no-op precisely because the marker makes it safe to call twice). */
export function ensureBaseStyles(doc: Document): void;
```

`package.json`'s `exports` map stays sealed to `"."` (CLAUDE.md: "only `api/` and `model/` types are public"). A host needing to own the stylesheet itself (CSP, a bundler policy) is a real, distinct request — it gets its own decision and its own justified `plans/04` §1-style entry for the new export, not a `'none'` option riding in in a step whose bullet is tokens/parts/light-dark. Restated from the comment's own revision (Q-none — not reopened, listed for completeness since §0 says everything here is closed).

### D-S1.10-9 — Default colour tokens are sourced from an existing, non-shipping palette; light/dark are the only preset axis this step ships

The `--fg-*` colour defaults the base stylesheet writes (D-S1.10-6) are not invented for this step — they're carried over from a colour palette already in use and tuned on a separate project this team maintains. **That project's name never appears here or anywhere in `src/`, `docs/`, or `plans/`** (CLAUDE.md: "Vendor Gantt product names never appear in specs, docs, or code") — only the *values* cross over, the same way a designer hands over a colour ramp without the file it was designed in being named in the code that consumes it.

Only the tokens with a real FreeGantt part to attach to are pulled — the source palette also carries ~90 keys for canvas-only geometry (stroke widths, corner radii, popup shadows, drag-ghost offsets, dash patterns) that have no DOM counterpart in anything S1.10 renders. Pulling those over now would be dead spec: undocumented CSS custom properties nothing reads. The cut list stays a `plans/04` §1.1-shaped "rejected, and why" note, not a silent drop:

| Token | Light default | Dark default | CSS target | Source key |
|---|---|---|---|---|
| `--fg-pane-bg` | `#FAFAF7` | `#15161A` | `.fg-grid-pane`, `.fg-timeline-pane` background | `chromeShellBg` |
| `--fg-splitter-color` | `#E6E2D9` | `#2B2F36` | `.fg-splitter` background | `chromeShellSplitBorder` |
| `--fg-header-bg` | `#F4F2EC` | `#22252B` | `.fg-header` background | `timelineHeaderBg` |
| `--fg-header-band-bg` | `#FFFFFF` | `#1B1D22` | `.fg-band` background | `timelineHeaderBand0Bg`/`Band1Bg` (identical in both source themes — one token, not two) |
| `--fg-header-text` | `#1A1815` | `#ECEAE3` | `.fg-band`/`.fg-tick` text | `timelineHeaderText` |
| `--fg-header-subtext` | `#9A958B` | `#6E6A62` | `.fg-tick` text (finer bands read dimmer) | `timelineHeaderSubText` |
| `--fg-header-divider-color` | `#E6E2D9` | `#2B2F36` | rule between header bands | `timelineHeaderRowDividerColor` |
| `--fg-row-even-bg` | `transparent` | `transparent` | `.fg-row:nth-child(even)` | `rowEvenBg` |
| `--fg-row-odd-bg` | `rgba(26,24,21,.028)` | `rgba(255,255,255,.032)` | `.fg-row:nth-child(odd)` | `rowOddBg` |
| `--fg-row-label-color` | `#1A1815` | `#ECEAE3` | `.fg-row-label` text | `taskListText` |
| `--fg-bar-fill` | `oklch(.55 .13 245)` | `oklch(.72 .13 245)` | `.fg-bar` background | `barDefaultFill` |
| `--fg-bar-label-color` | `#FFFFFF` | `#ECEAE3` | `.fg-bar` text | `barLabelColor` |
| `--fg-warn` | `#D97706` | `#FBBF24` | `.fg-bar[data-flag~="conflict"]` outline (U2) | `alertWarning` |

`gridLineColor`/`todayLineColor`/every `taskList*Drag*`/`popup*` source key is cut for the same reason as the geometry keys: nothing in `render/dom` today draws a grid line, a today marker, a drag ghost, or a popup. They return when the render surface that needs them ships (grid lines: S6 columns; today marker, drag ghost, popup: S3+/interaction slices) — each gets pulled from the same source palette at that point, on the same "only what's rendered" rule, not bulk-imported now.

**Preset axis stays `theme: 'auto' | 'light' | 'dark'` only — no widening.** "Preset themes to pick from" beyond light/dark needs a place to register one, and every registration seam in this codebase (`registerItemEmitter`, `registerColumn`, `registerRenderer`, …, `plans/01` §10) is scoped to one Gantt instance via `PluginContext` — because a module-level `registerThemePreset(name, tokens)` would be exactly I2's forbidden shared mutable state, and `extensions/` (the plugin host `PluginContext` comes from) doesn't exist until S6. Shipping a global registry three steps early, just for this, means either breaking I2 or building a one-off instance-scoped registry that `extensions/` then has to reconcile with its own. Neither is this step's job. A caller fully replaces the shipped palette today the same way U4 already promises: set any `--fg-*` property on the host, which the stylesheet's `var(--fg-x, default)` always prefers over its own fallback — that is "replace the theme," no registry required. §9 carries the named multi-preset picker forward to S6 explicitly, next to the other `extensions/`-gated deferrals already there.

---

## 3. API

### 3.1 `src/view/styles.ts` — new file

```ts
export function ensureBaseStyles(doc: Document): void;
```

```ts
// GanttOptions / GanttShellOptions gain, both live:
theme?: 'auto' | 'light' | 'dark';   // default 'auto'
a11yLabel?: string;                   // default 'Gantt'
```

`GanttShell` calls `ensureBaseStyles(host.ownerDocument)` once at construction, before `PaneLayout` builds anything — the stylesheet must exist before the classed elements it styles are inserted, or there's a one-frame flash of unstyled content.

### 3.2 `src/time/format.ts` — new file

```ts
export function formatEndInclusive(zone: string, end: Instant): string;
export function formatDate(zone: string, i: Instant): string;
```

Soft cap ~150 lines (R1) — mostly `Intl.DateTimeFormat` plumbing through `time/zone.ts`'s existing zone-aware primitives.

### 3.3 `eslint/rules/no-inline-style-outside-geometry.cjs` — new rule

```
bans `node.style.<prop> = …` for prop ∉ { transform, width, height }
scope: src/render/**, src/view/**
```

Lands **first**, with its red fixture, per `plans/04` §3.2/§3.3's "guardrail before the code it guards" — the earlier draft cited "`plans/04` §55", which doesn't exist (`plans/04` has five top-level sections); the real citation is §3.2 (boundary enforcement before real code) and §3.3 (custom rules land with a fixture). Scope is `src/render/**` + `src/view/**` because those are the only directories writing inline styles today; `src/interaction/` doesn't exist yet, but when it ships gesture previews (hover/drag, per CLAUDE.md's "hot path = class toggles + transforms only") it will need the same per-frame-geometry allowance, so the rule's scope is expected to widen to include it then — not a gap in this step, just not yet applicable.

### 3.4 `src/layout/frame.ts` — flag keys renamed; `FrameBar` gains one field

```ts
export interface BarFlags { conflict?: boolean; cycle?: boolean; }
export interface LinkFlags { inactive?: boolean; cycle?: boolean; }

export interface FrameBar {
  // ...unchanged fields...
  /** D-S1.10-5. */
  a11yLabel: string;
}
```

Every `BarFlags`/`LinkFlags` literal in `src/layout/**` (currently only the empty-flags default at bar/link construction) updates in the same commit — a mechanical rename, not a behavior change until S3 sets a flag true.

### 3.5 `src/render/dom/index.ts` — flags, roles, the row label child, the class/inline-style split

- `BarGeom` gains `flags: BarFlags`; `patch` writes `data-flag` (D-S1.10-2) and `aria-label` (from `a11yLabel`, carried the same way `label` already is) and `role="img"` (`create`) — not `gridcell` (D-S1.10-5, revised).
- `RowGeom` gains `index: number` and `rowCount: number`; `.fg-row`'s `create` adds the `.fg-row-label` child and `role="listitem"`; `patch` writes `aria-posinset`/`aria-setsize` and the label child's `textContent` (D-S1.10-7).
- `mount` sets `role="group"`, `tabindex="0"`, `aria-label` (from the `a11yLabel` option, threaded through `RenderSurfaces` or a `mount`-time option — exact plumbing point is `GanttShell`'s call into `backend.mount`, extended with one field) on the host — not `role="grid"`/`aria-rowcount` (D-S1.10-5, revised).
- Every `node.style.position/visibility/top/left` write in `mount`/`syncHeader`/`syncRows`/`syncBars` deletes; the corresponding class picks it up per D-S1.10-6's stylesheet. Concretely: tick `create` (`position: absolute`), band `create` (`position: relative`), row `create` (`position: absolute`), bar `create` (`position: absolute`), `headerLayer`/`barLayer` at `mount` (`position: relative`), `contentSizer` at `mount` (`position: absolute`, `top`, `left`, `visibility`) — six call sites, not a line-number range (an earlier pass of this document cited `index.ts:48,71,108,131,161,164,171-176`, which drifts as the file changes; naming the call site survives edits the way a line number doesn't).
- `data-testid="fg-bar"` + existing `data-item-id` (already `bar.dataset['itemId']` — just needs the testid sibling attribute); `data-testid="fg-row"` + a new `data-row-id`.

### 3.6 `src/view/pane-layout.ts` — inline styles trimmed to `width`/`height`

Per D-S1.10-6: every `display`/`overflow`/`flexDirection`/`flexShrink`/`flex`/`minWidth`/`cursor`/`position` write deletes; the six class names already assigned stay exactly as they are (D-S1.10-1) and pick up those rules from the stylesheet. `gridWidth`'s live `width` write and the header spacer's/row layer's `height` writes are unchanged — they're per-instance geometry, not structure, and the rule already allows both properties.

---

## 4. Public surface

`api/index.ts` gains: `Gantt.theme` (get/set), `Gantt.a11yLabel` (get/set), `GanttOptions.theme`/`.a11yLabel`, `formatEndInclusive`, `formatDate`. `ensureBaseStyles` is **not** exported — it's an internal `view/` call `GanttShell` makes at construction; there is no host-facing way to opt out (D-S1.10-8), matching `plans/02` §4's own "level 1: CSS custom properties" framing (a host restyles, it doesn't disable the sheet).

**Declared gaps, now closed:** the `--fg-*` token table (`plans/02` §4) goes from five documented properties (`--fg-row-height`, `--fg-grid-pane-width`, `--fg-bar-radius` mentioned by example, plus the two S1.8 additions never written into the table) to the complete level-1 list (§7), now including 13 colour tokens with real default values, not just placeholder examples (D-S1.10-9). `data-flag` goes from documented-but-unimplemented to real. A11y goes from zero roles to every row/bar reachable and self-describing (`group`/`listitem`/`img`, not the full ARIA grid pattern — D-S1.10-5, revised; §9), short of keyboard navigation (which stays S4's, by design).

**Unchanged:** no `styles` option, no second package export, no `describeBar`. `Gantt` still never re-exposes `scale`/`scroll` (S1.9, unaffected by this step).

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| A host expects to disable the shipped stylesheet | Not possible by design (D-S1.10-8) — level 1 is "override the tokens," not "opt out of structure." A host with a hard CSP/bundler constraint is a distinct, larger request. |
| Two Gantt instances in one document both call `ensureBaseStyles` | The second call is a no-op — the `<style data-freegantt-styles>` marker makes it idempotent, and the document (not a module variable) holds that state (I2 unaffected). |
| A host writes `.fg-bar { transform: none }` trying to override bar position | It can't stick — `render/dom` writes `transform` inline every frame (allowed by the lint rule precisely because it's per-frame authoritative), and inline always wins the cascade over a stylesheet rule. Position is never a level-1/level-2 customization point; renderer callbacks (level 3) are, if a host needs different geometry logic entirely. |
| Someone adds a `BarFlags` key and forgets `plans/02` §4's documented selector | Nothing enforces the doc stays in sync — the generator (D-S1.10-2) means the *behavior* is always right (the key's own spelling is the token), so the only drift risk is the doc table itself, caught at review. |
| `aria-setsize` read once and never updated as the dataset grows | `sync()` rewrites every row's `aria-setsize` each frame from the frame's row count — the same cadence `contentHeight` already gets, not a one-time `mount` write. |
| A host sets `theme = 'dark'` and also has the page in `prefers-color-scheme: dark` | No conflict: `[data-fg-theme='dark']` and `[data-fg-theme='light']` both win over the media query by selector specificity + being attribute-scoped; `'auto'` (no attribute written) is the only state that lets the media query decide. |

---

## 6. Tests

`dom` (jsdom) throughout except the lint and pure-formatter tests.

- **`view/styles.test.ts`** — `ensureBaseStyles` injects exactly one `<style>` for two Gantt instances constructed in one document; a second call after the first is a true no-op (node count unchanged); the injected sheet's `:root` and `[data-fg-theme='dark']` blocks carry all 13 D-S1.10-9 colour tokens with their documented default values; setting `--fg-bar-fill` on the host before construction overrides the shipped default on the rendered `.fg-bar` (proves U4/D-S1.10-9's "override wins" claim, not just that the property exists).
- **`api/gantt.test.ts` (extended)** — `theme` setter flips `data-fg-theme` on the host live, `'auto'` writes no attribute; `a11yLabel` setter updates `aria-label` on the host live.
- **`render/dom/index.test.ts` (extended)** — a bar with `flags: {conflict: true}` renders `data-flag="conflict"`; adding a hypothetical third `BarFlags` key and setting it true renders that key's name with no `render/dom` change (drives the generated path, not a hand-added case); `.fg-row` has one `.fg-row-label` child carrying the row's label text; `.fg-row`'s `aria-posinset`/`aria-setsize` correct against a windowed frame over a larger-than-window fixture; `.fg-bar` carries `role="img"` and its `aria-label`, not `role="gridcell"`; host has exactly one `tabindex="0"` element in the whole render tree.
- **`eslint/rules/no-inline-style-outside-geometry.test.cjs`** — fires on a banned property (`style.position = ...`), passes on the three allowed ones; the red fixture is a snippet shaped like `pane-layout.ts`'s current `display`/`overflow` writes, proving the rule would have caught what D-S1.10-6 fixes.
- **`time/format.test.ts`** — `formatEndInclusive` across a DST boundary and a month-end in a zone that observes DST; `formatDate` on a plain start; both against the existing `time/zone.ts` fixture zones (`time/zone.test.ts`'s DST zone, reused, not a new one).
- **`layout/frame.test.ts` (extended)** — `FrameBar.a11yLabel` composition matches `formatDate` + `formatEndInclusive` for a known fixture entry.

---

## 7. Spec edits implied — landed **with** this step

- `plans/02` §4 — the complete `--fg-*` token table (metrics + colour, per §2's D-S1.10-1 list) becomes the documented level-1 list, including D-S1.10-9's 13 colour tokens with real light/dark default values (no vendor name attached — the table cites only token/value, per CLAUDE.md); `data-flag` vocabulary (`conflict`, `cycle`) written down as real, not aspirational; `data-testid` hooks documented per `plans/02` §7's "stable test hooks" bullet.
- `plans/01` §4 — the `GeometryFrame`/`FrameBar`/`BarFlags`/`LinkFlags` code block: `hasConflict`→`conflict`, `inCycle`→`cycle`, `FrameBar.a11yLabel` added.
- `plans/01` §5 — `formatEndInclusive`/`formatDate` move from "promised, no file implements it" to shipped (`time/format.ts`), closing the S0-era promise.
- `plans/01` §8.1/§8.3 — a paragraph noting `render/dom`'s inline writes are now geometry-only (`transform`/`width`/`height`), everything else moved to the base stylesheet, and the ARIA roles `mount`/`sync` write.
- `docs/02-lint-rules.md` — new §3.11 for `freegantt/no-inline-style-outside-geometry`, same format as §3.10's `no-flow-layout-rows` entry.
- `docs/01-invariant-guard-matrix.md` — no numbered invariant changes status (a11y has no assigned `In` number; D11 is a locked decision, not one of the eleven), but §2 (CLAUDE.md hard rules not covered by a numbered invariant) gains a row for the inline-style rule, mirroring how §2 already covers other non-numbered hard rules.
- `CONTEXT.md` — new entries: **Base stylesheet** (`ensureBaseStyles`, idempotent-per-document), **Token** (the `--fg-*` vocabulary, level 1), **Part** / **State attribute** (the `fg-*` class and `data-*` vocabulary, level 2), **a11y label** (`FrameBar.a11yLabel` vs. the `Gantt.a11yLabel` option — two different things sharing a root word, disambiguated explicitly since #7's "chart" lesson applies).
- `plans/temp_todo_for_s1-close.md` §6 — this step's phase list is superseded by this document.

---

## 8. TODO

Guardrail first, then the stylesheet it protects, then flags/roles, then the public edge.

### Guardrail
- [x] `eslint/rules/no-inline-style-outside-geometry.cjs` + rule test + red fixture (§3.3); add to `eslint/rules/index.cjs` and `eslint.config.js`; `docs/02-lint-rules.md` §3.11

### `time/`
- [x] `src/time/format.ts` — `formatEndInclusive`, `formatDate` (§3.2)

### `layout/`
- [x] `BarFlags`/`LinkFlags` key rename (§3.4); `FrameBar.a11yLabel` computed from `time/format.ts` + the dataset zone

### `view/`
- [x] `src/view/styles.ts` — `ensureBaseStyles`, the full stylesheet (D-S1.10-1 class rules + D-S1.10-6's structural rules + colour rules + the `--fg-*` token defaults, light/dark values per D-S1.10-9's table)
- [x] `pane-layout.ts` — delete every non-`width`/`height`/`transform` inline write (§3.6); confirm `pane-layout.test.ts` still passes unmodified (proof that the visual result is unchanged, only the mechanism moved)
- [x] `GanttShell`/`GanttShellOptions` — `theme`, `a11yLabel` live accessors; call `ensureBaseStyles` at construction, before `PaneLayout`

### `render/dom`
- [x] `data-flag` generation from `BarFlags` (§3.5); role attributes (`group`/`listitem`/`img`, not `grid`/`row`/`gridcell` — D-S1.10-5 revised), `aria-posinset`/`aria-setsize`, host `tabindex="0"` + `aria-label`; `.fg-row-label` child; `data-testid` on `fg-row`/`fg-bar`; delete the position/visibility/top/left inline writes

### `api/`
- [x] `Gantt.theme`, `Gantt.a11yLabel`; `GanttOptions` gains both; re-export `formatEndInclusive`/`formatDate` from `api/index.ts`

### Harness
- [x] Review `harness/index.html` and `harness/scroll-sync.html` against CLAUDE.md's harness rule — both currently hand-write `.fg-*` rules the library will now ship (temp_todo §1 row 24); drop what's now redundant, record any gap that isn't in `src/`

### Review and docs
- [x] The §7 spec edits, landed with this step
- [x] `pnpm verify` green; `pnpm test:e2e` green

### Acceptance

Moved to §1 — each user story carries its own acceptance checkbox now, not a separate copy here.

---

## 9. Deferred, with the caller that will bring it back

| Deferred | Returns at | Needs |
|---|---|---|
| Roving tabindex — moving `tabindex` off the host onto a row and back as focus moves | S3 | the keyboard controller (`plans/01` §9) that defines and moves "the active row"; shipping it earlier means a focus ring with no mover (D-S1.10-5, closing `fix-issue1-apis.md` §(a).4) |
| `barRenderer`/`cellRenderer`/`headerRenderer`/`tooltipRenderer` (level 3) — including any per-bar host-authored description | S5 | `extensions/`'s plugin host and the renderer-callback seam (`plans/02` §4 level 3); `describeBar` specifically stays cut, not renamed (D-S1.10-4) |
| A host-owned stylesheet delivery mode (`styles: 'none'` + a second package export) | when a host asks | a written justification for widening the sealed `exports` map, per `plans/04` §1's bar for any new public dependency/export surface (D-S1.10-8) |
| Grid columns beside `.fg-row-label` | S4 / S5 | the field registry (S4) and grid presentation (S5); the row/label-cell split lands now specifically so this is additive (D-S1.10-7) |
| Named multi-preset picker (beyond `theme: 'auto'\|'light'\|'dark'`) — a caller choosing from more than one built-in colour set by name | S5 | `extensions/`'s `PluginContext` (`plans/01` §10) — the only I2-safe place a `registerThemePreset`-shaped seam can live; a module-level version would be shared mutable state (D-S1.10-9) |
| The cut geometry/grid-line/today-marker/popup/drag-ghost tokens from the source palette (`gridLineColor`, `todayLineColor`, every `taskList*Drag*`/`popup*` key) | S3+ (grid lines: S5 columns) | the render surface each one styles — pulled from the same source palette when that surface ships, same "only what's rendered" rule as D-S1.10-9 |
| The full ARIA grid pattern (`role="grid"`/`"row"`/`"gridcell"`, `aria-rowcount`/`aria-rowindex`) — S1.10 ships `group`/`listitem`/`img` instead (D-S1.10-5, revised) | not committed to a slice | a DOM structure that puts a row's cells in the same subtree as the row; S5's column work adds cells to the *grid pane* but doesn't by itself move `.fg-bar` out of the timeline pane, so it isn't guaranteed to close this on its own — revisit when it's clear what does |
