# Consumer brief — CRM_Filament, labor fulfillment (2026-09-15)

**Source:** written by the consumer team's agent against `.slice` = S6 and `etc/freegantt.api.md` @ `d07b628`.
Landed here unchanged, so the issues it backs cite a path in this repository instead of a scratchpad
in another workspace.

**Issues raised from it:** packaging, per-tick value rows, Segment props, the S6 leak check, and
`shading()`. Each one names the section it came from.

---

# Handoff to FreeGantt — asks from the first real consumer

**From:** CRM_Filament (Laravel/Filament construction CRM), `workforce` module.
**Consumer surface:** `LaborFulfillmentPage` — the "manpower view". We intend to delete ~1,500 lines of
hand-rolled grid and mount FreeGantt in its place, both panes.
**Written against:** `.slice` = S6, `etc/freegantt.api.md` @ `d07b628`.

This is a capability handoff, not a design. Where I sketch a shape it is to be argued with, not
implemented as written — you own the vocabulary.

---

## 1. What the page is

A split view, two panes, one shared time axis, one shared horizontal scroll.

**Top pane — labor requests.** One row per `LaborRequest`. A request has one `LaborRequestBlock` per
working day in its span (weekends and unchecked days-of-week are absent, so rows are *sparse*). A block is
either open (click to select) or filled (shows the assigned worker's initials). The user multi-selects
blocks, then assigns a crew member to all of them at once. Rows nest: project → position group → request.

**Bottom pane — workforce capacity.** One row per worker, nested under position group, plus two aggregate
rows ("Whole Team", per-position-group rollup). Every row is *dense*: it carries a value in **every**
bucket, including empty ones. A cell reads `booked/capacity h` with a fill meter and one of four states —
open (blue), partial (grey + meter), fully booked (green), over-allocated (red, with an "over" caption).

Most of this maps onto what you already ship, and maps well:

**Checked 2026-09-22 against `etc/freegantt.api.md` and the code behind it, at commit
`dda983c4` (#407). The table below is the current answer; the original table, sent 2026-09-15,
is superseded — see the change notes under each row that moved.**

| Ours | Current API | Checked |
|---|---|---|
| `LaborRequest` | `Entry` | Works as assumed. Name unchanged. |
| `LaborRequestBlock` | A child `Entry` drawn on its parent's row through `childrenAsSegments` (ADR 0026, #421) | **Superseded.** `Segment` retired before this brief could be checked. `etc/freegantt.api.md` has no `Segment` type now. A block is an ordinary `Entry` with a `parentId`. `rowSource: { childrenAsSegments: … }` says which parent draws its children as bars on its own row, instead of on rows of their own. |
| block multi-select → assign | `selectedEntryIds` + `selectionChange` | **Superseded.** `selectedSegmentIds` retired with `Segment` — the Selection holds Entry ids only (`docs/08-a-bar-is-an-entry.md` §"nine call sites"). A segmented row can still select several of its children at once; each selected block is one Entry id in `selectedEntryIds`. |
| project / position nesting, collapse | tree `rowSource`, `collapsed` | Works as assumed, with a caveat. A segmented parent (a request row, once blocks land) is never expandable — its children draw as bars on its own row, not as rows of their own, so there is nothing under it to collapse (`src/layout/rows/entries-source.ts`: "a segmented parent is never expandable"). Collapse still works normally on the project/position rows above it. |
| two panes scrolling as one | shared `scroll: { x }` (one `ScrollAxis`) plus a shared `scale: TimeScaleModel` | **Corrected by #405, not merely renamed.** The 2026-09-15 row asked for a shared `ScrollModel`, which links both axes. The panes hold different row sets, so a shared y was never wanted; D-S6-1 (2026-09-15) ruled y stays private by default. `ScrollModel` retired. Pass the same `ScrollAxis` instance as `scroll.x` on both Gantts to share x, and a shared `TimeScaleModel` instance as `scale` to keep one zoom and one pixels-per-millisecond on both panes. |
| day / week / month zoom | `zoomPresets` | Works as assumed. Name unchanged. |
| sticky label column + splitter | grid pane, `gridColumns`, `gridResizable` | Works as assumed. `gridResizable` is the one addition since 2026-09-15 (#432): it locks the splitter and every column resizer together, live. |
| search, "hide filled" | `RowSource.filter`, `filterPolicy` | Works as assumed, with a caveat. The default `filterPolicy: 'keepAncestors'` (`src/layout/rows/row-source.ts`) keeps a project or position row visible when any of its own requests still match the filter — "hide filled" hides a fully-covered request without also hiding the group it sits under. `filterPolicy: 'matchOnly'` is the other choice, for a search box that should hide the whole ancestor chain when nothing under it matches. |
| read-mostly | `capabilities: { move: false, resize: false }` | **Superseded.** `interactions` retired; the current key is `capabilities`, same shape. |

The 2026-09-15 close — "We are not asking for any of that. It works." — held for five of the nine
rows unchanged. Two rows (`Segment`, `selectedSegmentIds`) named a type retired before anyone
checked this table, one row (scroll sharing) was outright wrong and became #405, and one row
(`interactions`) was renamed. #407 is the record that the table is checked now; #405 is the one
row that needed its own issue.

---

## 2. Ask 1 — a row whose items are one value per tick (BLOCKING, bottom pane)

**The requirement.** A row that paints a value in every bucket of the visible axis, aligned to the
header ticks, where the value is a number plus a state — not a span.

**Why this is the ask and not a workaround.** I can build it today: emit one single-tick `Segment` per
bucket per row and paint it with `barRenderer`. At our scale it would even perform fine (see §6). I am
raising it anyway because the result is a lie about your model. A `Segment` is a piece of an entry's
span — a discontinuous entry that resumes. A worker's Tuesday capacity is not a piece of anything; the
worker has no span. Modelling it as one makes `start`/`end` meaningless on the entry, makes
`durations()` and every span-shaped rollup return nonsense, and makes `resize` a capability we must
disable to stop the user from doing something incoherent. Five consumers will hit this — a resource
histogram under a schedule is the single most common second pane in this product category — and each
will invent the same fiction differently.

**Roughly what would satisfy us**, for you to reshape:

- A row source or variant that produces one item per tick across the axis, from a consumer-supplied
  `(rowId, bucketStart) -> value | undefined` — `undefined` meaning "paint nothing" (our top-pane
  summary rows are sparse; the bottom pane's are dense).
- The existing `barRenderer`/`ElementDescription` is enough to paint it. We need text, a class hook for
  the four states, and a percentage-width child for the meter. Nothing new there.
- A11y: each cell needs its own label ("Tuesday 9 September, 8 of 8 hours booked, over-allocated").

**Related ask, lower priority.** Our aggregate rows ("Whole Team", per-position rollup) are sums of the
child rows *per bucket*. Your Field aggregators sum up the tree, but per-Field, not per-bucket. We
currently compute these server-side and will keep doing so, so **this is a nice-to-have, not a
requirement** — but if the per-tick row concept lands, per-bucket rollup is the obvious second half of it
and you may want to design the two together rather than paint yourself into a corner.

**Touches:** #265 (ready-made cell renderers / meter cells). Our meter is the same meter, on the
timeline side rather than the grid side. #265's accessibility conclusion — graphic `aria-hidden`, the
adjacent text carries the value — is the right rule for these cells too.

---

## 3. Ask 2 — segments carry no consumer data (HIGH, top pane)

`SegmentInput` is `{ id?, start, end }`. `Segment` is `{ id, start, end }`. Neither has `props`.

Every block in the top pane carries data the bar must paint: filled/open state, the assigned worker's
name and initials, hours, and whether the current selection came from "Fill All". `BarRendererContext`
gives us `entry` and `item.segmentId`, so the workaround is a side-map in `entry.props` keyed by segment
id, which we then index on every paint. That works. It also means the segment's data lives somewhere
other than the segment, and the two can drift.

**Ask:** `props` on `SegmentInput`/`Segment`, reaching `BarRendererContext` for the segment being
painted. Whether it goes through the Field registry the way `Entry.props` does (ADR 0011) or stays an
opaque bag is your call — we would be happy with opaque.

**Touches:** #267 (renderer has no way to read a declared Field), #302 (variant shape as data). If a
variant can be per-segment rather than per-entry, that solves our filled/open paint without a renderer at
all, and may be the better door.

---

## 4. Ask 3 — make the package installable (BLOCKING, and cheap)

`version: 0.0.0`, private repo, never published, `dist/` gitignored, and `package.json`'s `prepare`
script sets `core.hooksPath` rather than building. A `github:Pawel-IT/FreeGantt#<sha>` dependency
therefore installs **with no `dist/`**, and `exports` points at a file that does not exist.

We cannot consume the library at all until this is fixed. Nothing else on this list matters before it.

Cheapest path we can see: a build on publish, a real version, and GitHub Packages. We will handle the
`.npmrc` token in our app container and CI. **Touches #342** — we do not need the budget number settled,
only a tarball that installs.

---

## 5. Ask 4 — finish S6's mount/destroy leak check (MEDIUM)

S6 acceptance *"100 mount/destroy cycles leak no nodes, listeners, or observables"* is unticked.

This matters more for us than the 10k-row throughput item next to it. Filament is a Livewire SPA: our
users navigate in and out of this page repeatedly without a full page load, and each visit mounts two
Gantt instances sharing a `ScrollModel` and a `TimeScaleModel` and destroys them. If `destroy()` leaks,
we find out as a slow tab after forty minutes of dispatcher work, which is the worst possible way to find
out. Please make sure the shared-model case is in that test, not just the single-instance one.

---

## 6. Ask 5 — ship non-working-time shading (LOW)

`harness/plugins/weekend-shading.ts` is the S5 dogfood demo and is harness-only. We need weekend and
non-working-day shading on both panes, and we would rather not maintain a copy of your example. Ours is
slightly more than weekends — a tenant's `WorkSchedule` defines working days, so the shaded set is
per-dataset data, not `day % 7`. If it ships as a plugin taking a predicate or a list of spans, we are
covered.

---

## 7. Explicitly NOT needed — please do not build these for us

- **Dependencies / links / the scheduling plugin (S7).** Labor requests have no predecessors. Nothing on
  this page draws a link. We will want this the day we build a *project schedule* Gantt, which is the
  obvious next consumer — but it is not this consumer, and it should not be pulled forward for us.
- **Progress %, baselines.** Same answer. ADR 0008's placement is fine by us.
- **`dataset.apply(changeSet)` / any save format.** We are writing our own shim against your existing
  events and `entries.add/update/remove`. ADR 0016 is not a problem for us. Deferring D-S2-11 further
  costs us nothing.
- **External drag-and-drop** (dragging a worker chip onto a block). Our assign flow is select → drawer,
  and stays that way.
- **A `barClick` event.** `selectionChange` is enough.

---

## 8. Numbers, so nothing is over-engineered

The axis is small. Our four ranges are: 1 week (**7** day ticks), 3 weeks (**21**), 1 month (**~4** week
ticks), 1 year (**~12** month ticks). There is no 10,000-column case and there never will be — the page
is a dispatcher's working horizon, not an archive.

Rows: tens, low hundreds at the largest tenant. Both panes together, worst realistic case, is roughly
**200 rows × 21 buckets**. Ask 1's per-tick items therefore top out around 4,000 items, which is well
inside what S1's virtualization already handles.

Nothing here needs to be fast. It needs to be *right*, because we are deleting our fallback.

---

## 9. Priority, if you only take one thing

1. **Ask 3** (packaging) — blocks everything, costs a day.
2. **Ask 1** (per-tick value rows) — blocks the bottom pane, and is the one real gap in the model.
3. **Ask 2** (segment props) — we can ship without it; it will read badly in our code until it lands.
4. **Ask 4** (leak test), **Ask 5** (shading) — before we cut over, not before we start.
