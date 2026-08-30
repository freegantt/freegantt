# S1.13 — Date lines: public shape, header caption, line style

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.13 · **Position: done, gate passing.** S1.12 landed and
its gate (`S1.12 → S3`) passes; S2 landed; S3 has not started. `.slice` is `S1.13`, and
`scripts/slice-gate.mjs`'s `S1.13 → S3` gate over this step's acceptance ids is green.
**Status: landed.** §8 is the work list; every item is checked off.
**Builds on:** [`plans/s1.12-timeline-navigation/README.md`](../s1.12-timeline-navigation/README.md)
D-S1.12-14 (the today-line decoration seam) and the `layout/date-line.ts` / `render/dom/date-line.ts`
split already landed against it (issue #96).
**Closes:** the remaining `src/layout/date-line.ts` / `src/render/dom/date-line.ts` checklist tracked
on issue #96 (`.fg-today-line` → `.fg-date-line` rename, `placeAt`/`className`, index-keying,
`Gantt.dateLines` wired to the public surface) and issues #96/#99's gaps 1–4 (today-line caption,
status/as-of dates, named time markers, line style). Gap 5 (cursor date hairline) and issues #97,
#100, #101 stay out — §2, §9.

> **§0 is settled.** #96's own grill (rounds 1–5, linked below) already answered the shape questions.
> This step's own calls are the ones #96 left for "later, when code lands": the internal/public type
> split, the caption's DOM home, and how line style reaches CSS.

---

## 0. Prior art — settled on issue #96, not reopened here

| # | Question | Answer | Source |
|---|---|---|---|
| **Q1–Q3** | Today special-cased? Line-only? Colour via class? | Today is the `todayLine` wrapper over the same `DateLine` type; class only, no public `color`; a line may carry a label, the default now-line stays unlabelled. | [round 1](https://github.com/Pawel-IT/FreeGantt/issues/96#issuecomment-5463042917) |
| **Q4–Q7** | One Part, not two? Bands in scope? Where does the list live? Merge/dedupe? | One Part, today is a class/state on it; bands are #97, not here; the list is `Gantt.dateLines`, next to `todayLine`; no merge — the wrapper is the now-line, the list is extra lines only. | [round 2](https://github.com/Pawel-IT/FreeGantt/issues/96#issuecomment-5463050705) |
| **Q8–Q10** | Label placement? Wrapper shape? List field names? | Label in the header, at the line's x, stroke stays 1px; wrapper is `true \| false \| InstantInput`; list is `dateLines: { placeAt, label?, className? }[]`. | [round 3](https://github.com/Pawel-IT/FreeGantt/issues/96#issuecomment-5463058224) |
| **Q11–Q13** | Rename now? Same-instant collisions? Type name? | Rename `.fg-today-line`→`.fg-date-line` / `--fg-today-line-color`→`--fg-date-line-color`, no alias; two lines at one instant both render, later label wins; type is `DateLine`, glossary term **Date line**. | [round 4](https://github.com/Pawel-IT/FreeGantt/issues/96#issuecomment-5463063205) |
| **Q14–Q15** | Field name for the instant? An `id`? | `placeAt`, not `at`/`instant`/`location`. No `id` — plain array, index-keyed like Header bands (two lines may share an instant, ruling out a `Map`). | [round 5](https://github.com/Pawel-IT/FreeGantt/issues/96#issuecomment-5470659912) |

CONTEXT.md's **Date line** and **Today line** entries already describe this settled shape. What is
**not** true yet: the code. `src/layout/date-line.ts` still has `DateLineInput { id, instant, label }`,
keyed by `id`; `src/render/dom/date-line.ts` still paints `.fg-today-line`, keyed by `id`, with the
label as the line's own `textContent`; `Gantt.dateLines` does not exist; `Gantt.todayLine` is still a
plain `boolean`. This step lands the code the grill already specified, then closes the residual #99
gaps that only needed that code to exist.

---

## 1. User stories

- **U1.** I set `gantt.dateLines = [{ placeAt: '2026-09-08', label: 'Launch' }, { placeAt: '2026-12-31', className: 'fg-deadline-line' }]`. Both lines render with their own caption/class; the default red today line stays where it was.
- **U2.** I set `gantt.todayLine = '2026-09-14'` to mark a status/as-of date instead of the clock. No caption appears — same unlabelled stroke `todayLine: true` gives me, just at a date I chose. If I want a caption, I turn `todayLine` off and add my own `dateLines` entry.
- **U3.** I write `.fg-deadline-line { border-left-style: dashed; border-left-width: 2px; }` in my own stylesheet. The line I named `className: 'fg-deadline-line'` picks it up; the library never had a `style` or `dashed` option to learn.
- **U4.** I scroll the timeline horizontally. Every date-line caption stays glued to its line, because both live in the same content-pixel space the bars do.
- **U5.** I inspect `.fg-today-line` in devtools after upgrading. It is gone; `.fg-date-line` is there instead, with `data-flag` state (or a plain modifier class) marking the one at `now()`.

---

## 2. Decisions

### D-S1.13-1 — Position and scope

Whose scope: S1's, same reasoning as D-S1.12-1 — axis furniture, not a new capability area. When: next,
after S1.12 (done, gate passing) and S2 (done); before S3. `.slice` becomes `S1.13`; the live gate
becomes `S1.13 → S3`.

This step closes:
- The #96 tracking checklist for `src/layout/date-line.ts` / `src/render/dom/date-line.ts` (rename,
  `placeAt`, `className`, index-keying) — code debt against an already-settled shape.
- #99 gap 1 (today-line caption — resolved as "authored lines get one, the wrapper still doesn't",
  D-S1.13-6), gap 2 (status/as-of date — resolved as "already `dateLines`", D-S1.13-7), gap 3 (named
  time markers — same, D-S1.13-7), gap 4 (line style — resolved via `className` + a stroke that uses
  `border-left`, D-S1.13-5).

Out of scope, staying on their own issues: #97 (`RangeBand`, shaded spans), #99 gap 5 (cursor date
hairline — needs `interaction/`'s pointer plumbing, which stays empty pre-S3, CLAUDE.md), #100
(period views, shift-by-tick, fit-selection), #101 (new axis presets).

### D-S1.13-2 — `DateLineInput` (public, loose) is not `layout/`'s internal resolved type

The codebase already has the `EntryInput` (loose) / `Entry` (resolved-and-stored) split and the
`{ start: InstantInput; end: InstantInput }` (loose) / `TimeSpan` (resolved) split `range` uses
(D-S1.12-8). Date lines get the same split, not a second use of one name for two shapes:

```ts
// src/api/gantt.ts — public, loose. What GanttOptions.dateLines and Gantt.dateLines both take.
export interface DateLineInput {
  placeAt: InstantInput;
  label?: string;
  className?: string;
}
```

```ts
// src/layout/date-line.ts — internal, resolved. Instant fits InstantInput's union, so
// DateLineInput itself is still a legal *return* type for the getter (below) — only the
// layout-internal resolved shape needs its own name, because layout/ is DOM-free and never sees
// loose input (CLAUDE.md: "api/ maps fields; it never does date math of its own").
export interface DateLineSpec {
  placeAt: Instant;
  label?: string;
  className?: string;
}
```

`Gantt`'s `#toDateLines(input: readonly DateLineInput[]): readonly DateLineSpec[]` reads each
`placeAt` through `toInstant(zone, …)`, mirroring `#toRange` exactly. `Gantt.dateLines`'s getter
returns what was resolved — legal against `DateLineInput` because `Instant` is one of
`InstantInput`'s member types, the same reasoning `range`'s getter already relies on.

`layout/date-line.ts`'s exported `DateLine` (the decoration — `{ kind: 'dateLine', x, label?,
className? }`) is unchanged in spirit, just drops `id` (D-S1.13-3) — it was never the input type and
keeps its own name.

### D-S1.13-3 — Index-keyed, `id`-free, `className` carried through

`resolveDateLines` and `attachDateLines` both key by array position, not `id` — Q15's answer, and
already the precedent Header bands use (`syncKeyed(..., { key: (_band, i) => i })`,
`render/dom/index.ts:87`). `TODAY_DATE_LINE_ID` is deleted; nothing keys off it once `id` is gone.

```ts
// src/layout/date-line.ts
export interface DateLine {
  kind: 'dateLine';
  x: number;
  label?: string;
  className?: string;
}

export interface ResolveDateLinesInput {
  scale: Pick<TimeScale, 'range' | 'xForInstant'>;
  /** `true` = now(); `false` = omit; an Instant pins it (Q9). Default `true`. */
  todayLine?: boolean | Instant;
  dateLines?: readonly DateLineSpec[];
  /** Frozen Instant for tests, used only when `todayLine` resolves to "now" mode. */
  now?: Instant;
}

export function resolveDateLines(input: ResolveDateLinesInput): DateLine[];
```

Resolution order for `todayLine`: `undefined` and `true` both read `now()` (or the test-frozen
`input.now`); `false` emits nothing; an `Instant` pins the line there with no clock read at all —
consistent with D-S1.12-14's "no timer," now extended to "no clock read either, once pinned."

`attachDateLines`'s `syncKeyed` call moves from `key: (line) => line.id` to `key: (_line, i) => i`, and
`toGeom`/`patch` carry `className` onto the node (`node.className = 'fg-date-line ' + (geom.className
?? '')`, trimmed) the same way `flagTokens` composes `data-flag` for bars — a base class plus an
optional caller class, not a class replacement.

**Known consequence, accepted (already recorded on #96 round 5):** reassigning `dateLines` re-keys
every line by position. Toggling `todayLine` off shifts every list entry's index by one and remounts
its node. Config-frequency, not per-frame — the same trade the grill already accepted.

### D-S1.13-4 — `Gantt.dateLines` and widened `Gantt.todayLine` join the public surface

```ts
// GanttOptions, and live on Gantt
todayLine?: boolean | InstantInput;   // was boolean-only (S1.12); default true
dateLines?: readonly DateLineInput[]; // new; default []

get todayLine(): boolean | InstantInput;  set todayLine(v: boolean | InstantInput);
get dateLines(): readonly DateLineInput[]; set dateLines(lines: readonly DateLineInput[]);
```

Both live (`plans/02`'s "every config key is live-reconfigurable"), both loose on the way in
(`InstantInput` through `toInstant`, D-S1.13-2's `#toDateLines`), delegated straight through
`GanttShell` to `LayoutInput.todayLine` / `.dateLines` the way `locale`/`todayLine` already are
(D-S1.12-14).

### D-S1.13-5 — The stroke is `border-left`, not `background`, so `className` reaches dash and width in one declaration

Today's `.fg-today-line { width: 1px; background: var(--fg-today-line-color); }` needs two properties
overridden to change width (`width`) and cannot express `border-style: dashed` at all — `background`
has no dash. `.fg-tick` already solved this for the header's own divider
(`border-left: 1px solid var(--fg-header-divider-color)`, `view/styles.ts`). Date lines adopt the same
shape:

```css
.fg-date-line { position: absolute; top: 0; border-left: 1px solid var(--fg-date-line-color); pointer-events: none; }
```

Answers #99 gap 4 with no new option: `gantt.dateLines = [{ placeAt: d, className: 'fg-deadline-line' }]`
plus `.fg-deadline-line { border-left-style: dashed; border-left-width: 2px; }` in the consumer's own
sheet is the whole feature — level-2 Customization ladder, the same ladder `className` already put
this on. Rejected: a `style`/`dashed`/`width` field on `DateLineInput` — one more config surface for
something CSS already expresses, and `render/dom` writing anything but transform/width/height inline
would break D-S1.10-6.

### D-S1.13-6 — The label is a second keyed layer, mounted in the header, not `textContent` on the 1px stroke

Q8 settled *where* (`.fg-header`, at the line's x); this decides *how*. `.fg-today-line`'s current
`node.textContent = geom.label` writes the caption into the 1px-wide stroke itself — unreadable by
construction, and never actually exercised by a passing test (`gantt.test.ts` only asserts presence
of `.fg-today-line`, never a label). It has to be a sibling element.

`headerLayer` (`.fg-header`, `render/dom/index.ts:48`) is already sized to `frame.contentWidth`
(`headerLayer.style.width`) and lives in the same content-pixel space `DateLine.x` is computed in
(`layout/date-line.ts`'s `xForInstant`) — a caption mounted there at `translateX(x)` lines up with its
stroke with no coordinate conversion, the same way header ticks already do.

```ts
// src/render/dom/date-line.ts — new Part, sibling keyed layer inside attachDateLines
export function attachDateLines(timelineHost: HTMLElement, headerLayer: HTMLElement): DateLineAttachment
```

New Part, `.fg-date-line-label`: absolutely positioned inside `.fg-header`, `left: 0`,
`transform: translateX(x)`, `white-space: nowrap`; clipped by `.fg-header`'s existing
`overflow: hidden` (D-S1.12-9) the same way an over-wide tick already is (S1.12 HANDOFF, the
`scrollWidth` fix). Only lines carrying a `label` get a caption node — `toGeom`/`create` skip
labelless entries the way `BandGeom`'s always-equal geometry already lets `syncKeyed` no-op.

Colour: the caption reuses `--fg-date-line-color` (`color: var(--fg-date-line-color)`) rather than a
new token — one line, one colour, cap included. A per-line `className` restyles both the stroke and
the caption together, since both carry the same base class plus the caller's class.

**Two lines at one instant (Q12, settled):** both strokes render; both captions render at the same x
and visually overlap; "later label wins in document order" is about which one a reader's eye lands on
last, not a collision the code resolves — no z-index rule is added beyond DOM order.

### D-S1.13-7 — #99 gaps 2 and 3 need no new API; the wrapper's own caption stays cut

**Status/as-of date (#99 gap 2), named time markers (#99 gap 3):** both are exactly
`gantt.dateLines` entries — a status date is `{ placeAt: statusDate, label: 'Status' }`; a sprint
boundary or a project-finish marker is the same shape with a different label/class. No second wrapper,
no closed set of "kinds" (rejected explicitly on #99's own survey — the closed Current-Date/Status-
Date/Project-Start/Finish kind list one competitor ships was the option *not* taken). D-S1.13-4
shipping is what closes these two gaps; no further decision is needed here.

**Today-line caption (#99 gap 1), first half:** the grill already closed this at Q3 — *"Default
now-line with no extra config stays an unlabelled red stroke."* That is a locked decision
(`round 1`), not reopened by #99 filing it again as a gap. What #99 actually needed was the label
mechanism to exist and work *somewhere* (D-S1.13-6 supplies it) plus a documented path to a captioned
"Today" marker: turn `todayLine` off and author it — `gantt.dateLines = [{ placeAt: 'now', label:
'Today' }]` reads wrong (`'now'` is not a valid `InstantInput`) — the honest form is
`gantt.dateLines = [{ placeAt: new Date(), label: 'Today' }]`, which the app must re-assign itself to
track the clock, exactly as D-S1.12-14 already refuses to give the wrapper a timer. Documented on
`todayLine`'s doc comment and in CONTEXT.md's **Today line** entry, not built as a second option.

**Today-line caption (#99 gap 1), second half — "document how an app keeps today visible":** already
answered by S1.12's own surface, not new here — `panToToday()` (D-S1.12-8) pans the scroll position;
`range: 'fitDataset'` grows to include it automatically; a pinned `range` needs the app to check
`now()` is inside it, same as any other date the app cares about. One paragraph on `todayLine`'s doc
comment cross-referencing `panToToday`, no code.

### D-S1.13-8 — Rename lands with no alias, same commit as the shape change

`.fg-today-line` → `.fg-date-line`; `--fg-today-line-color` → `--fg-date-line-color`. Both in `view/
styles.ts` (light and dark palettes) and `render/dom/date-line.ts`'s `create()`. No consumers exist
pre-1.0 (round 4's own reasoning) — no compatibility alias, no deprecation window. `api/gantt.test.ts`'s
existing `.fg-today-line` assertions (`[S1-A10]`, `gantt.test.ts:410-433`) are rewritten against
`.fg-date-line` in the same change, not left passing against a name that no longer exists.

### D-S1.13-9 — Cursor date hairline (#99 gap 5) stays deferred to S3

It needs the instant under the pointer during a drag — `interaction/`'s pointer state and
`instantForX`, per #99's own text ("Pairs with viewport gestures, see #100"). `src/interaction/` stays
empty until S3 (CLAUDE.md), same boundary D-S1.12-17 already drew for wheel/keyboard zoom-pan
gestures. `plans/03` §S3 gains a TODO line for it, alongside the existing D-S1.12-17 block — §7.

---

## 3. API

### 3.1 `src/api/gantt.ts`

```ts
export interface DateLineInput {
  placeAt: InstantInput;
  label?: string;
  className?: string;
}

interface GanttOptionsBase {
  // …unchanged keys…
  /** Live. Default `true`. `true` = now(); `false` = off; an instant pins it with no clock read
   *  (S1.13, widened from S1.12's boolean-only form). To keep today visible, pan with
   *  `panToToday()` or grow `range`. */
  todayLine?: boolean | InstantInput;
  /** Live. Default `[]`. Extra Date lines beside the today wrapper — status/as-of dates, sprint or
   *  holiday markers, project start/finish. No id: index-keyed, like Header bands (S1.13, D-S1.13-3).
   *  The wrapper's own line never gets a caption; give one of these a `label` instead. */
  dateLines?: readonly DateLineInput[];
}

export class Gantt {
  get todayLine(): boolean | InstantInput;
  set todayLine(v: boolean | InstantInput);
  get dateLines(): readonly DateLineInput[];
  set dateLines(lines: readonly DateLineInput[]);
}
```

`#toDateLines` joins `#toRange` as the second `api/` conversion helper, same shape:
`readonly DateLineInput[]` in, `readonly DateLineSpec[]` out, one `toInstant` call per entry.

### 3.2 `src/layout/date-line.ts`

`DateLineInput` (old, `{ id, instant, label }`) → `DateLineSpec` (`{ placeAt, label?, className? }`,
D-S1.13-2). `DateLine` drops `id`, gains `className?`. `TODAY_DATE_LINE_ID` deleted.
`ResolveDateLinesInput.todayLine` widens to `boolean | Instant` (D-S1.13-3). `resolveDateLines` keys
nothing itself — it returns a positional array; keying is `render/dom`'s job, same split as
`FrameHeaderBand`/`FrameHeaderTick`.

### 3.3 `src/render/dom/date-line.ts`

`attachDateLines` takes a second parameter, `headerLayer`, and mounts a second keyed layer inside it
for captions (D-S1.13-6). Both layers key by index. Node `className` composes a fixed base class plus
the line's own `className` (D-S1.13-3).

### 3.4 `src/layout/frame.ts`

`LayoutInput.todayLine` widens to `boolean | Instant`; `LayoutInput.dateLines` retypes to
`readonly DateLineSpec[]`. `computeFrame` threads both into `resolveDateLines` unchanged otherwise.

### 3.5 `src/view/gantt-shell.ts`

`GanttShellOptions.todayLine` widens to `boolean | Instant`; `.dateLines?: readonly DateLineSpec[]`
added, live get/set, delegated into `render()`'s `LayoutInput` the way `locale`/`todayLine` already
are.

### 3.6 `src/view/styles.ts`

`.fg-today-line` → `.fg-date-line`, `border-left` in place of `width`+`background` (D-S1.13-5);
`--fg-today-line-color` → `--fg-date-line-color` in both palettes; new `.fg-date-line-label` rule
(D-S1.13-6).

---

## 4. Public surface

`api/index.ts` gains: `DateLineInput`, `Gantt.dateLines`, the matching `GanttOptions.dateLines` key.

**Changed:** `Gantt.todayLine` / `GanttOptions.todayLine` widen from `boolean` to
`boolean | InstantInput`. `--fg-today-line-color` → `--fg-date-line-color`. `.fg-today-line` →
`.fg-date-line` in the closed Part vocabulary; `.fg-date-line-label` joins it.

**Unchanged:** every other S1.12 key (`locale`, `zoomPresets`, `zoomIn`/`zoomOut`, `panToDate`,
`panToToday`, `range`, `fit`, `preset`, `scale`).

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| `gantt.dateLines = [{ placeAt: 'now', label: 'Today' }]` throws or silently drops | `'now'` is not a valid `InstantInput`; the doc comment shows the real form (`new Date()`), and TypeScript rejects the string literal at the call site. |
| A consumer expects the wrapper's line to carry a caption when `todayLine` is set to a pinned date | It never does (Q3, locked) — pin *and* caption means turning `todayLine` off and authoring the line in `dateLines`. Stated on `todayLine`'s doc comment. |
| Two `dateLines` entries share one `placeAt` | Both render, both caption, no error, no dedupe (Q12) — the app asked for two lines. |
| Reassigning `dateLines` remounts every node, not just the changed one | Index-keyed by design (Q15); documented as config-frequency, not a per-frame path. |
| A `className` collides with the base `fg-date-line` class | It doesn't — composed, not replaced (`node.className = 'fg-date-line ' + custom`), same pattern `flagTokens` already uses for bars. |
| `.fg-today-line` CSS a consumer wrote pre-S1.13 stops matching anything | Expected — no alias, no consumers pre-1.0 (D-S1.13-8). Migration line: `.fg-today-line` → `.fg-date-line`, `--fg-today-line-color` → `--fg-date-line-color`. |
| A long label overlaps the next band's tick text | Clipped by `.fg-header`'s `overflow: hidden`, same as an over-wide tick already is (S1.12 HANDOFF). No truncation/ellipsis added beyond what `.fg-header` already does. |

---

## 6. Tests

`pure` (Node, no DOM) except where noted.

- **`layout/date-line.test.ts` (rewritten)** — `resolveDateLines` with `todayLine: true`/`false`/an
  `Instant` (pinned, no `now` read); positional output for a mixed today+authored list; `className`
  passes through unchanged; the old `id`-keyed assertions are gone, replaced with index-position
  assertions.
- **`layout/frame.test.ts` (extended)** — `decorations` carries a `DateLine` with `className` when
  `dateLines` supplies one; a pinned `todayLine` Instant outside `scale.range` emits nothing, same as
  the boolean form already does.
- **`render/dom/date-line.test.ts` or `api/gantt.test.ts` (dom, extended)** — `[S1-A11]` a `dateLines`
  entry with a `label` renders a `.fg-date-line-label` positioned at the line's x in the header; one
  without a label renders no caption node; `[S1-A12]` `.fg-today-line` does not exist anywhere in the
  rendered DOM and `.fg-date-line` does, with `--fg-date-line-color` in the token table and
  `--fg-today-line-color` absent from it; `[S1-A13]` `todayLine = '2026-09-14'` renders one
  `.fg-date-line` at that instant with no caption, and no `now()` read (a frozen-clock test proves the
  line doesn't move when the clock advances); `[S1-A14]` a `dateLines` entry's `className` reaches the
  rendered node's `classList` alongside the base class.
- **e2e (`e2e/date-lines.spec.ts`, new)** — a consumer stylesheet setting `border-left-style: dashed`
  on a `className`d line actually renders dashed (computed style check); scrolling the timeline pane
  keeps a caption glued to its line's x.

---

## 7. Spec edits — landed **with** this step

- `plans/03` — the `S1.12` scope block's `· **runs next**` marker moves to a new `S1.13` block
  directly below it, carrying this step's scope and acceptance `[S1-A11]`–`[S1-A14]`. `plans/03` §S3
  gains a second TODO line, alongside D-S1.12-17's, naming the cursor date hairline (D-S1.13-9).
- `.slice` → `S1.13`; `scripts/slice-gate.mjs` gains the `S1.13 → S3` gate.
- `CONTEXT.md` — **Date line** and **Today line** entries updated: `placeAt`/`className`/index-keyed
  is no longer "not yet landed," the Part is `.fg-date-line` with no "until #96 lands" caveat, and a
  new **Date line label** entry for `.fg-date-line-label`.
- `plans/02` §4 — token table: `--fg-date-line-color` replaces `--fg-today-line-color` (with the
  migration line); `.fg-date-line` and `.fg-date-line-label` replace `.fg-today-line` in the closed
  Part vocabulary.
- Issue #96 — closed, with a pointer to this spec and the landing commit.
- Issue #99 — gaps 1–4 closed with a pointer to D-S1.13-5/-6/-7; gap 5 left open, re-pointed at
  `plans/03` §S3's new TODO line (D-S1.13-9).

---

## 8. TODO

Glossary first, then the engine, then the seam, then the public edge.

### Glossary and specs
- [x] `CONTEXT.md` **Date line** / **Today line** entries updated; new **Date line label** entry
- [x] `plans/03` §S1.13 block + §S3 TODO line

### `layout/`
- [x] `DateLineSpec` replaces the old `DateLineInput`; `DateLine` drops `id`, gains `className?`
- [x] `resolveDateLines`: `todayLine: boolean | Instant`, positional output, `TODAY_DATE_LINE_ID`
      deleted
- [x] `LayoutInput.todayLine`/`.dateLines` retyped

### `render/dom/`
- [x] `attachDateLines` takes `headerLayer`; second keyed layer for `.fg-date-line-label`
- [x] Index-keyed `syncKeyed` calls (both layers); `className` composed onto the base class
- [x] `.fg-date-line` (border-left) / `.fg-date-line-label` in `view/styles.ts`; `--fg-date-line-color`
      replaces `--fg-today-line-color` in both palettes; no alias

### `api/`
- [x] `DateLineInput`; `Gantt.dateLines` get/set + `#toDateLines`; `Gantt.todayLine` widens to
      `boolean | InstantInput`
- [x] `GanttShellOptions.dateLines`; `GanttShell.todayLine` widens

### Tests
- [x] `layout/date-line.test.ts` rewritten for the new shape
- [x] `[S1-A11]`–`[S1-A14]` written and passing
- [x] `api/gantt.test.ts`'s existing `.fg-today-line` assertions rewritten against `.fg-date-line`
- [x] `e2e/date-lines.spec.ts`

### Review and gate
- [x] The §7 spec edits, landed with this step
- [x] `S1.13 → S3` gate green; `.slice` bumped

---

## 9. Deferred, with the caller that brings it back

| Deferred | Returns at | Needs |
|---|---|---|
| Cursor date hairline during drag (#99 gap 5) | S3 | `interaction/`'s pointer state, `instantForX` (D-S1.13-9); pairs with #100's gesture work |
| `RangeBand` shaded spans (#97) | when the plugin-dogfood or a caller needs bands | its own decoration/paint pair; explicitly not folded into `DateLine` (grill Q5) |
| "This period" views, shift-by-tick, fit-selection (#100) | when a caller asks | builds on `zoomToSpan`/`panToToday`, unrelated to the Date line shape |
| New axis presets — quarter, sub-hour rungs, fiscal year (#101) | when a consumer asks | a preset-table addition, not `time/` engine work |
