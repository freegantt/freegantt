# FreeGantt — Vertical Slices

Each slice cuts through the whole stack and ends with something visible and pokeable in the dev harness (`harness/`). No slice is pure infrastructure; no slice's value depends on a later slice landing. Gates from `00-overview.md` §4 apply between slices.

Slices are scope, not calendar estimates. Within a slice, entries are ordered so the visible result appears as early as possible.

**Remap (2026-08-28):** Direct manipulation is **S3**. Hierarchy is **S4**. Extensibility is **S5**. Scale is **S6**. The first-party scheduling plugin is **S7**, last. S3–S6 must ship a complete Gantt with the identity extender. Extra field writes during drag come from that hook (`EntryEdits`), never from a `schedule()` import in `interaction/` or `view/`.

> **Live Field, date and derivation rules: ADRs 0011–0016.** S0–S6 are done, and each section below records what that slice **shipped at the time**. Where a shipped line says `kind`, `rollUpKinds`, `autoGroup`, `meta` or a field `source`, the live rule is the ADR. Dates are optional (0012). The Field key is the address in `props` (0011). An Entry derives when it has children (0013). There is no save format (0016). `editable` is a three-state enum (0015). All five are built, so `src/` no longer carries the retired words. The by-key door is `entries.fieldValue`. A sixth ADR proposed renaming it, and the author withdrew and deleted it on 2026-09-11 ([the gap at 0014](../docs/adr/README.md#the-gap-at-0014)). The read moves onto the row under [ADR 0017](../docs/adr/0017-the-entry-answers-questions-about-itself.md), which is **proposed** and not built. **Do not rewrite a shipped record to match.** The record says what a slice shipped; the ADR says what is true now. The tracker is [`field-redesign/CLOSE-OUT.md`](field-redesign/CLOSE-OUT.md).

---

## S0 — Walking skeleton

**Goal:** the entire pipeline — model → time → layout → render → API — exists end-to-end at minimum depth, with the guardrails that keep it honest. A fixture project renders as static bars on a timeline in the harness.

**Scope**

- Repo: TS strict, Vite, Vitest, ESLint + import-boundary rules (invariant I1) wired into CI from the first commit.
- `model/`: `Entry` (including `kind` — authored from day one, even while only `'span'` renders), ids, `Instant` brand, `TimeSpan`, `Duration`.
- `time/` (minimal): `instant()`, `toISO()`, zone-aware `startOfDay`/`addDays`/`diff` for one dataset zone; magic-constant lint (I10).
- `layout/` (minimal): row resolution (`source: 'entries'`, flat list), one item per entry, fixed row height, `computeFrame()` returning rows + bars; deterministic `Item.id` (I8).
- `render/dom` (minimal): mount, `sync(frame)` rendering absolutely-positioned row and bar elements; the keyed reconciler in its hard-bounded scope (`01` §8.1); `render/null` for tests.
- `api/` (minimal): `new Dataset({ entries })`, `new Gantt({ container, dataset })`, `destroy()`.
- Harness: a Vite page that mounts the Gantt on a fixture; this page lives forever and every slice adds to it.
- Fixtures: one realistic sample project (~50 entries).

**Explicitly out:** scrolling, headers, grid pane, interactivity, scheduling, mutation.

**Acceptance**

- [x] Harness shows fixture entries as bars positioned correctly against time.
- [x] `computeFrame()` snapshot-tested headlessly; `Item.id` determinism asserted.
- [x] Import-boundary lint fails the build on a violation (proven by a deliberate red test in CI setup).
- [x] `render/null` consumes a frame in Node with no DOM.
- [x] Two Gantt instances mount on one page without shared state (I2 test exists from day one).

---

## S1 — Timeline, viewport, split pane

**Goal:** it looks and scrolls like a Gantt. Time axis with headers and presets, virtualized scrolling, grid pane with a label column — and the shareable scale/scroll objects that make future multi-Gantt sync free (D9).

**Scope**

- `time/`: `TimeScale` (instants ⇄ pixels), `ViewPreset` as data, tick generation, shipped presets hour→year; header band rendering.
- `TimeScaleModel` and `ScrollModel` as standalone observable objects; Gantt instances bind to them, constructing private ones by default (`01` §8.2). The I12 rule (no pixels-from-time or scroll access outside these objects) is in force now.
- `view/`: Gantt shell — grid pane (label column), splitter, timeline pane; single scroll owner; vertical + horizontal virtualization windows; row-height index behind an interface (simple prefix-sum implementation).
- Shared row geometry: grid and timeline both position rows from `frame.rows` (I9 pixel test).
- Zoom: preset switching + `range: 'fitDataset'`; anchored zoom (the instant under the cursor stays put).
- Theming foundation: CSS custom properties + parts vocabulary (`--fg-*`, `data-flag`); light/dark, default colour tokens sourced from an existing palette (`plans/s1.10-theming-and-a11y/README.md` D-S1.10-9), fully overridable per level 1; a named multi-preset picker beyond light/dark is deferred to S5 (same doc, §9).
- A11y foundation: the Gantt is focusable, rows/bars have roles and labels, focus visible.

**Acceptance**

- [x] `[S1-A1]` Scroll a 5,000-entry fixture: only windowed rows exist in the DOM. (Not "smoothly" — that's throughput, D2's measured spike at S6, and a timing assertion in CI is a flaky proxy for it; S1.11 D-S1.11-5.)
- [x] `[S1-A2]` Grid and timeline row tops are pixel-identical under fractional zoom (I9).
- [x] `[S1-A3]` Preset switch and zoom are live reconfigurations — no remount, anchor preserved.
- [x] `[S1-A4]` Two harness Gantt instances given the same `ScrollModel` scroll together (a 5-line harness demo — the D9 seam proven now, cheaply).
- [x] `[S1-A5]` Axis headers correct across a DST transition in the dataset zone (unit-tested in `time/`).

**Debt, paid at S1.12 (runs after S2, before S3 — see below).** These five landed. Three S1 scope items did not: a legible time axis at any density (`fit: 'pane'` has no minimum tick width, so a long dataset compresses to sub-pixel ticks), discrete zoom navigation (`zoomBy` exists; `zoomIn`/`zoomOut` and an ordered preset set do not), and multi-band headers that render as multiple bands (`.fg-header` is one fixed height split N ways). Spec: [`plans/s1.12-timeline-navigation/README.md`](./s1.12-timeline-navigation/README.md).

---

## S2 — Data core: transactions, undo, changesets, JSON

**Goal:** the data layer that everything else rides on (D10 first half, D7). Programmatic mutation with transactions, exact undo/redo, changeset events, versioned serialization — all visible live in the harness.

**Scope**

- `data/`: normalized stores + indexes; instance-scoped reactivity façade (one small dep, swappable); `DatasetData` owning stores + zone.
- Change signalling between `Dataset` and `GanttShell` (#33, deferred here at S1.11 D-S1.11-7): S2 makes the binding live, in one removable attachment (D-S2-20) — `GanttShellOptions` never had an `entries` key to replace, and it gains no `setEntries()` beside the real one. A second reactivity mechanism living next to the real one is #1's R4, and the cheapest moment to forbid it is before this slice starts.
- Transactions: batching, auto-wrap of single mutations, one changeset per transaction (`origin` tagged).
- Undo/redo: transaction = atomic unit; recorded changesets replayed exactly; history API (`canUndo`, capacity).
- Changesets: `{ added, removed, updated: {field, from, to} }` (`01` §6); `dataset.on('change')`. the key type is **`FieldKey`** (retiring `EntryField`, one concept with two names) and it stays **open**, validated at runtime rather than typed `keyof Omit<Entry, 'id'>` — it is public through `FieldUpdated` and the undo record, and S4's field registry (`01` §2.6, ADR 0005) cannot open it later without a breaking change. `dataset.apply(changeSet)` is deferred to the slice that ships a sync adapter (D-S2-11) — `plans/02` §6's "sync adapter is an extension, not a core change" promise is discharged by the changeset contract itself (`from`/`to` on `on('change')`), which S2 ships either way; `apply` is what such an extension would write.
- Serialization: `toJSON()`/`fromJSON()` with `schema: 1`, ISO instants, opaque `meta` round-trip.
- Public mutation API: `dataset.entries.add/update/remove`, typed, validating. `dataset.dependencies.*` is not S2's — `StoreName` was `'entries'` only until the first plugin store existed. **Satisfied in S5.10 (2026-09-04):** `StoreName` is now `'entries' | \`plugin:${PluginId}\``, and `ctx.store.reserve()` makes the first such store (D-S5-24); scheduling's `Dependency` store is the second, in S7, and needs no core change to arrive.
- View binding: committed changesets invalidate layout incrementally as defined and asserted by D-S2-16 — a changeset with only `updated` rows never rebuilds the row-height index, one with `added`/`removed` rows does; row-level incrementality inside `computeFrame` is not S2's, and is S6's to decide.
- Harness: mutation playground — edit fixture via console/buttons, watch the Gantt update; undo/redo buttons; changeset log panel; export/import JSON.

**Acceptance**

- [x] `[S2-A1]` Property test: random mutation sequences + undo-all restores byte-identical `toJSON()` (I7 groundwork — engine patches join in S7).
- [x] `[S2-A2]` `fromJSON(toJSON(p))` round-trips byte-stable.
- [x] `[S2-A3]` A 500-entry bulk update inside one transaction produces one changeset, one layout pass, one frame.
- [x] `[S2-A4]` Changeset log in harness shows `from`/`to` per field for every edit.

---

## S1.12 — Timeline density, zoom navigation, date formatting  ·  **done, gate passing**

**Position:** after S2, before S3. S2 landed at `6e6299b`; S3 has not started. `.slice` is `S1.12` and the live gate is `S1.12 → S3`.
**Scope is S1's** (`plans/03` §S1 above), not a new slice — the numbering says whose gap it closes, this position says when it runs. Full spec, settled: [`plans/s1.12-timeline-navigation/README.md`](./s1.12-timeline-navigation/README.md).

**Goal:** the time axis stays legible at any density, zoom becomes navigable rather than a bare density knob, and dates format through `Intl` in a caller-chosen locale.

**Scope**

- `time/`: per-preset density floor (`minTickWidthPx`, with `tickWidthPx` renamed `preferredTickWidthPx`); three three-band presets (`hourDayWeek`, `dayWeekMonth`, `weekMonthYear`); `DateFormat` = `Intl.DateTimeFormatOptions` or the existing callback, resolved through a memoized `Intl.DateTimeFormat`; `weekOfYear` and `formatWeekNumber`. The two hand-rolled formatting vocabularies collapse to one.
- `layout/`: the floor and a `MAX_CONTENT_PX` ceiling in the one place `pxPerMs` resolves; `zoomPresets` as the ordered set `zoomIn`/`zoomOut` step through; `zoomToSpan`; `panToInstant`. `computeFrame` emits the today line through the `FrameDecoration` seam that already ships, and threads `locale`.
- `view/`/`render/`: header height derived from band count in CSS (`--fg-band-height` replaces `--fg-header-height`); the grid spacer mirrors the header's bands so both panes size from one expression; the sticky header owed since S1.8; `.fg-today-line`.
- `api/`: `locale`, `todayLine`, `zoomPresets`, `zoomIn`/`zoomOut`/`canZoomIn`/`canZoomOut`, `zoomToSpan`, `panToDate`, `panToToday`; `range` accepts loose input like every other way in.
- Harness: `zoom.html` becomes a real demo with a toolbar (it is a headless e2e fixture today, linked from the index as though it were a demo) and keeps `window.__gantt`; a multi-year fixture so the density floor is visible.

**Explicitly out:** pointer and keyboard gestures (S3, listed there); weekend and non-working-time shading (S5's plugin dogfood example).

**Acceptance**

- [x] `[S1-A6]` A multi-year fixture at the `day` preset scrolls horizontally at the density floor instead of compressing ticks below it.
- [x] `[S1-A7]` `zoomIn`/`zoomOut` step exactly one entry of `zoomPresets`, keep the anchored instant fixed, and no-op at the ends in agreement with `canZoomIn`/`canZoomOut`.
- [x] `[S1-A8]` A three-band preset renders three full-height bands, and the grid pane's spacer matches the header's height to the pixel.
- [x] `[S1-A9]` The header stays pinned to the top of the timeline pane while the rows scroll under it.
- [x] `[S1-A10]` `panToToday()` brings the today line into view, and `locale` re-labels every header band and every screen-reader date with no bar remount (I8).

---

## S1.13 — Date lines: public shape, header caption, line style  ·  **done, gate passing**

**Position:** after S1.12 and S2, before S3. `.slice` moves `S1.12` → `S1.13`; the live gate is `S1.13 → S3`.
**Scope is S1's**, same reasoning as S1.12 — axis furniture, not a new capability area. Full spec, settled: [`plans/s1.13-date-lines/README.md`](./s1.13-date-lines/README.md).

**Goal:** finish the `DateLine` shape issue #96's grill already settled but S1.12 never wired to the public surface, and close issues #96/#99's remaining gaps — the rename, `Gantt.dateLines`, a header caption, and line style via `className`.

**Scope**

- `layout/`: `DateLineInput`'s old `{ id, instant, label }` shape renamed to the internal `DateLineSpec` (`placeAt`, resolved `Instant`); index-keyed, `id`-free; `todayLine` widens to `boolean | Instant`.
- `render/dom/`: `.fg-today-line` → `.fg-date-line` (no alias); `--fg-today-line-color` → `--fg-date-line-color`; a second keyed layer, `.fg-date-line-label`, mounted in the header at each labelled line's x; stroke painted via `border-left` so a `className` can set dash/width in one declaration.
- `api/`: `Gantt.dateLines` (new, `DateLineInput[]`, loose `placeAt`); `Gantt.todayLine` widens from `boolean` to `boolean | InstantInput`.

**Explicitly out:** cursor date hairline during drag (S3, listed there — needs `interaction/`'s pointer plumbing); `RangeBand` shaded spans (#97); period views, shift-by-tick, fit-selection (#100); new axis presets (#101).

**Acceptance**

- [x] `[S1-A11]` A `dateLines` entry with a `label` renders a `.fg-date-line-label` at the line's x in the header; one without a label renders no caption node.
- [x] `[S1-A12]` `.fg-today-line` does not exist anywhere in the rendered DOM; `.fg-date-line` does, with `--fg-date-line-color` in the token table and `--fg-today-line-color` gone from it.
- [x] `[S1-A13]` `todayLine` set to a pinned `InstantInput` renders one uncaptioned `.fg-date-line` there, with no `now()` read.
- [x] `[S1-A14]` A `dateLines` entry's `className` reaches the rendered node's class list alongside the base class, and a consumer stylesheet's `border-left-style: dashed` on it actually renders dashed.

---

## S3 — Direct manipulation

**Position:** after S1.13, before S4. Tracker: [`plans/s3-direct-manipulation/README.md`](./s3-direct-manipulation/README.md); work splits into [`s3.1-selection.md`](./s3-direct-manipulation/s3.1-selection.md)–[`s3.8-cursor-line-harness-gate.md`](./s3-direct-manipulation/s3.8-cursor-line-harness-gate.md). **Done, gate passing.** S3 publishes no install API; tests inject through the internal seam D-S2-6 sanctions.

**Goal:** editing with the pointer (D10): drag-move, resize, selection — each gesture cancelable, transactional, undoable. Live preview of the draft plus any extra field writes the extension hook returns.

**Scope**

- `interaction/`: controller base with the pointer invariants (`01` §9 — arm threshold, nothing written on pointerdown, escape-cancel, pointer capture, touch); `Drag`, `Resize`, `Select` controllers. `LinkCreate` waits for S7 (it writes plugin-owned `Dependency` data).
- Hot path: `InteractionState` + `backend.applyState()` — hover, selection, drag ghost as class toggles and transforms; zero allocation (I5).
- Snapping via the preset's `snap` spec; modifier key for fine placement.
- Capabilities: the `interactions` config resolved per entry over per-kind defaults (`02` §4.1); one resolution gates gesture arming *and* affordance rendering — handles, cursors (I14). `select` has no affordance; pointer and keyboard still refuse off the same `can('select')`. Link ports wait for S7.
- Cancelable events: `beforeEntryMove` / `beforeEntryResize` / `beforeSelectionChange` + after-events; async veto suspends with pending state (`02` §3). `beforeLinkCreate` waits for S7.
- Speculative preview: once per animation frame, call the **same** `EditExtender` the commit path uses, with a draft `proposed`. Paint the user's draft and the extender's extra `EntryEdits` as ghosts (transforms on existing nodes). Discard on cancel. Identity extender → only the dragged bar ghosts. A test injects an extender (same seam as S2) to prove extra bars ghost without `scheduling/`; S5.10 wires the public route, so `api/gantt.ts` hands the bound Dataset's own occupant to the preview and an installed Dataset plugin ghosts through the same path. `interaction/` never imports `schedule()` (`01` §7).
- One transaction per gesture at commit (I6); undo reverts the user's edit and any extender extras in one step.
- Keyboard parity begins: selected bar nudges by snap with arrow keys, one transaction per press; Escape clears the selection and hands the arrows back to panning. `Enter` is reserved and a no-op — it opens the inline editor, which is S5 (D-S3-13).
- Timeline navigation gestures (S3.7, D-S3-14, closed D-S1.12-17): ctrl/⌘+wheel anchored zoom calling `zoomIn`/`zoomOut` (one `zoomPresets` step per wheel notch); shift+wheel horizontal pan; `PageUp`/`PageDown`/`Home`/`End`/arrow keys for pan. These write nothing to the dataset, so the arm-threshold, escape-cancel and one-transaction-per-gesture invariants do not apply to them — they are read-only viewport gestures over the surface S1.12 ships. Continuous `zoomBy` stays an expert call; the wheel does not use it.
- Cursor date hairline (deferred here from S1.13, D-S1.13-9, issue #99 gap 5): show the instant under the pointer during a drag, via `instantForX` over the `DateLine` seam S1.13 ships. Read-only, same invariant exemption as the line above; pairs with #100's gesture work.
- Harness: editing playground; a veto demo (drop before a boundary date is rejected with a toast). The lock-style injected extender that makes extra ghosts visible **moves to S5** (listed there): the public way to claim the extender slot lands with the plugin runtime (D-S2-6), and until it does, a harness page cannot install one without reaching past the public API — which the harness rule (CLAUDE.md) forbids. S3 proves the same behaviour in a `dom` test through the internal seam S2 already sanctions (`plans/s3-direct-manipulation/README.md` §0 P1). **The public route landed in S5.10:** the hook has one occupant at a time and installing composes (D-S5-23), so `DatasetOptions.plugins` is how a page claims it.

**Acceptance**

- [x] `[S3-A1]` Every S3 gesture that writes data — pointer move, pointer resize, keyboard nudge — runs cancelable before-event → exactly one transaction → after-event (event-order test). Selection writes no dataset transaction: it fires its own cancelable pair and `dataset.on('change')` never sees it.
- [x] `[S3-A2]` Escape mid-drag restores exactly the pre-gesture state, including preview ghosts.
- [x] `[S3-A3]` Hover across a 1,000-entry fixture allocates nothing and rebuilds no frame (I5 perf test, D-S3-20).
- [x] `[S3-A4]` With the identity extender, only the dragged entry ghosts. With an injected extender that writes a second entry's `start`, that bar ghosts too; cancel discards both. No `scheduling/` import.
- [x] `[S3-A5]` An entry whose `resize` capability resolves false shows no handles and cannot be resized by pointer or keyboard (I14).
- [x] `[S3-A6]` A gesture undone by Ctrl+Z reverts the user edit and any extender extras in one step.
- [x] `[S3-A7]` Viewport gestures (ctrl/⌘+wheel zoom, shift+wheel pan, Page/Home/End/arrows) write nothing to the dataset.
- [x] `[S3-A8]` During a pointer drag, a Cursor line and label follow the pointer; they park when the drag ends.

---

## S4 — Hierarchy, grouping, multi-item rows

**Position:** after S3, before S5. **Done, gate passing.** Tracker: [`plans/s4-hierarchy-and-rows/README.md`](./s4-hierarchy-and-rows/README.md); work splits into [`s4.1-field-registry.md`](./s4-hierarchy-and-rows/s4.1-field-registry.md)–[`s4.11-harness-and-gate.md`](./s4-hierarchy-and-rows/s4.11-harness-and-gate.md). That spec settled scope calls, closed ADR 0005's two open questions, and renamed `derivedSpanKinds` to `rollUpKinds` as the Rollup gate widened from spans to every rolling-up field.

**Goal:** the Row ≠ Entry payoff (principle 1). Tree view with collapse/expand, grouped row sources, entry segments as multiple bars on one row, lane packing with variable row heights. **Lane packing retired by #298:** `singleLane` was the only row-packing behavior ever shipped, so the whole lane concept — and `heightMode` — collapsed to nothing; every row now draws its items at one shared, fixed-height band.

**Scope**

- Field registry (`01` §2.6, ADR 0005): core fields (`name`, `start`, `end`, `duration`) ship as declarations in the registry a consumer adds to; `fields` / `fieldTypes` / `aggregators` on `Dataset`; a declared `meta` key becomes addressable for editing, comparison and rollup. `Field.column` is optional defaults for the bare-key shorthand. A column object shows any declared Field. `gantt.gridColumns` is names in display order plus per-Gantt overrides. `progress` is not a core field (ADR 0008).
- Per-field rollup (#80): `rollUpFields` is a leaf with one importer `data/transaction.ts` (D-S4-7). Default is on. `rollUpKinds: 'none'` (or `[]`) keeps the values the caller assigned on the parent. `start` is `min`, `end` is `max`, a declared `cost` sums, `name` does not roll up. Same precedence (yields to the body, wins over the resolver), still bottom-up. Scheduling cannot occupy this slot. Source decides stored vs. computed: `entry`/`meta` fields store the parent's aggregate, computed fields never reach the document. **Superseded by ADRs 0011 and 0013:** the Field key is the address, `rollUpKinds` is deleted, an Entry derives when it has children, and a rolling-up parent's derived keys never reach the Document.
- Frame rows carry `cells` (one library-formatted string per configured grid column) instead of one `label` — the S1 shape that assumed a single-column grid (#81).
- Tree UI: indent + expand/collapse in the grid's name column; collapse state is view state (per Gantt, `RowId`s, not in dataset data).
- Kind-driven item emission (`01` §2.5): `group` → summary rail (span rollup from S2), `milestone` → diamond, consumer-registered kinds via the emitter seam; empty groups render as groups. **Superseded by ADR 0013, narrowed by ADR 0022:** emission asks structure or a Variant rule — a parent draws the `summary` look, a leaf draws a bar. Core now ships a `diamond()` look too, but no row wears it until a rule claims it. A plugin or a consumer registers a Variant for the rows it owns.
- `hierarchy: { autoGroup: true }` on `Dataset`: first child promotes a `'span'` parent to `group` within the triggering transaction; promote `'span'` only, never demote (`02` §2). **Superseded by ADR 0013:** nothing promotes a stored classification, because there is none. `autoGroup` is deleted, and losing the last child leaves a normal, dateless Entry.
- Row sources: `{ source: 'group', groupBy }` and `{ source: 'custom', resolve }` (`01` §2.3); group header rows.
- Sort and filter on the row source (`rowSource.filter`, `rowSource.sort`, `rowSource.filterPolicy`) with tree-aware policies (filter keeps ancestors by default; `filterPolicy: 'matchOnly'` for flat match lists; sort stays within parent).
- Item emission: `entry.segments` → multiple items on one row; overlap auto-packing into sub-lanes; `heightMode: 'pack'` variable row heights through the height index. **Retired by #298:** `singleLane` is the only row-packing behavior, so packing, sub-lanes and `heightMode` are gone.
- Interaction with lanes: drag/resize on packed items; collapse/expand by keyboard. **Retired by #298:** no lanes remain to drag or resize within; a row's items share its one band.
- Harness: tree fixture, with **one** Gantt and a button that switches `gantt.rowSource` between the tree and a grouped source. That proves the Row ≠ Entry payoff and proves live reconfiguration (`02` §2) in the same demo. Two Gantts on one dataset is not the demo: D9 is about a shared axis and scroll between charts with **different** data (`02` §5), and a shared `Dataset` — while free, since a second Gantt is only a second `change` subscriber — is not a case the library designs around or tests.
- **Known gaps due this slice (issue #91 §9):** §9-E is a bet on `RowHeightIndex.heightAt`/`invalidateFrom` and `RenderBackend.applyState` finally getting production callers — pack-mode row heights above and the hover/selection/drag hot path are exactly that; if either lands and still does not use the methods, remove them rather than leave decoration. **Amended by #298:** pack-mode row heights are gone, so the hot path is the only half of this bet left to settle; `FrameMemoryBind.heightAt` survives as a per-row override independent of packing. §9-G: `render/backend.ts`'s `hitTest(x, y)` does not name its coordinate space (DOM backend takes client coords, `GeometryFrame` is content coords) — this slice's gesture controllers are its first callers, so give it a named `ClientPoint` type before wiring them up, not after. §9-B (`view/gantt-shell.ts`'s `#wiring` boolean) is worth revisiting too: tree UI and lane interaction both add more to wire during construction.

**Acceptance**

- [x] `[S4-A1]` A consumer-declared `meta` field sums up the tree, shows in a grid column beside `start`, edits in the same `update()` call and the same undo step as a core field, and round-trips through `toJSON`/`fromJSON`. *— retired by ADR 0011: the namespace is `props`, and the `meta` Field is deleted.*
- [x] `[S4-A2]` An edit naming an unregistered field key throws `UnknownFieldError` — it is never written silently.
- [x] `[S4-A3]` Switching `gantt.rowSource` between the tree and a grouped source re-resolves rows without a remount, and scroll position survives it.
- [x] `[S4-A4]` A segmented entry renders N bars on one row; drag of one segment behaves sanely and transactionally.
- [x] `[S4-A5]` Pack-mode rows change height correctly as overlaps come and go; scroll position stays stable (height index invalidation test). *— retired by #298: pack mode is gone; the coverage now pins scroll re-clamp when the row count shrinks instead.*
- [x] `[S4-A6]` Collapse state survives data edits and is independent per Gantt.
- [x] `[S4-A7]` Filter with keep-ancestors shows a matching deep child under its chain of parents.
- [x] `[S4-A8]` An empty `kind: 'group'` entry renders as a group, accepts children, and its span appears once children exist — no special-casing. *— retired by ADR 0013: `kind` leaves the record, and an Entry derives when it has children.*
- [x] `[S4-A9]` With `autoGroup` on: reparenting an entry under a plain entry promotes that parent to `group` in the same undo step; removing all children demotes nothing. *— retired by ADR 0013: `autoGroup` is deleted, and a parent that loses its last child demotes.*
- [x] `[S4-A10]` `filterPolicy: 'matchOnly'` returns only matching entries — no ancestor rows.
- [x] `[S4-A11]` `{ source: 'custom', resolve }` produces the resolver's rows.

---

## S5 — Extensibility, editing surfaces, a11y completion

**Position:** after S4, before S6. **Done, gate passing.** Tracker: [`plans/s5-extensibility-and-editing/README.md`](./s5-extensibility-and-editing/README.md); work splits into [`s5.1-plugin-runtime.md`](./s5-extensibility-and-editing/s5.1-plugin-runtime.md)–[`s5.13-gallery-and-gate.md`](./s5-extensibility-and-editing/s5.13-gallery-and-gate.md). That spec settles seventeen scope calls, including OQ8 — `setExtender` composes rather than replaces (answered 2026-09-01), which rewords locked D4 in the same change as S5.10's code.

**Scope calls that changed this slice's own scope, settled in [`s5.13-gallery-and-gate.md`](./s5-extensibility-and-editing/s5.13-gallery-and-gate.md):**

- The `features: { tooltips: true, ... }` name table this section first sketched never shipped. A plugin is a value, not a name in a table: `Gantt.plugins` and `Dataset.plugins` each take an array of factories (`plugins: [tooltips(), contextMenu({...})]`), so an unused feature costs zero bundle bytes because nothing names it (D-S5-2, gate `[S5-A6]`).
- The entry editor is a plugin, not a core feature. `inlineEditing()` ships from `extensions/features/` and installs through `Gantt.plugins`, the same route `tooltips()` and `contextMenu()` take — proof that the dogfood rule (`[S5-A1]`) covers editing too.
- `registerField` moved contract. A Gantt plugin's `PluginContext` no longer carries it: a Gantt plugin shows a Field through `view.registerGridColumn` alone, and only a Dataset plugin declares a Field, through `ctx.fields.register` on the Dataset plugin contract S5.10 shipped (`01` §10.2).

**Goal:** the library's extension story is real and dogfooded (gate: a non-trivial built-in feature uses only the public plugin API), the grid grows into a proper editable table, and accessibility reaches its full committed level (D11).

**Start constraint:** the remaining `GanttShell` split in [`plans/s4-hierarchy-and-rows/c4-split-gantt-shell.md`](./s4-hierarchy-and-rows/c4-split-gantt-shell.md) has landed (`TreeCollapse`, `collapseAll` / `expandAll`). Plugin wiring must not grow tree-collapse policy back into `gantt-shell.ts`. Do not name a new extract `GanttViewport` — `layout/` already owns `Viewport`.

**Scope**

- `extensions/`: plugin runtime implementing the full `PluginContext` (`01` §10) — decorations, columns, renderers, overlay anchor, controllers, keybindings, commands, disposables. Public claim of `data/`'s extender slot (`DatasetOptions.plugins`, `setExtender`, #15) lands here so a later plugin can occupy it. S7 is the first-party occupant; until then the slot stays identity.
- Built-in features **as plugins**: tooltips (shared `Popup` primitive: anchoring, flipping, clamping, focus trap), context menu (command-registry-driven), row highlight decorations, today line.
- Harness: the lock-style extender demo deferred here from S3 — drag one bar, watch a locked second bar ghost — now that a page can install an extender through the public claim above. S3 already proves the preview path; this makes it pokeable. **Landed in S5.10:** `harness/plugins/lock-entries.ts`, installed by `harness/editing.html` (`e2e/plugins.spec.ts`).
- Grid maturation: grid-column **presentation** over S4's fields — header, width, alignment, `cellRenderer`; inline editors (text, date via a pluggable date-input seam — no bundled date-picker dependency), column resize/reorder; `beforeEntryEdit` veto/replace flow. There is no second definition system: a column names a field, and a consumer field and a core field take the same path (ADR 0005).
- `PluginContext.data.registerField` / `view.registerGridColumn` (`01` §10): a plugin declares a field that aggregates exactly like a core one, and shows it like any other.
- Renderer callbacks at every declared point (`bar`, `cell`, `header`, `tooltip`), text-safe by default (I13).
- A11y completion: grid pattern with roving tabindex, full keyboard reach for every S3 interaction, screen-reader labels with dates, focus management in popups; axe checks in CI on harness pages. Link-create keyboard lands with S7. Progress is scheduling-plugin data (ADR 0008), not a core a11y string.
- Docs seed: harness pages get explanatory text and become the example gallery; public API reference generated from types.

**Acceptance**

- [x] `[S5-A1]` Context menu and tooltips are plugins with zero private imports (lint-proven — the dogfood gate).
- [x] `[S5-A2]` A harness-only third-party-style plugin (e.g., a "weekend shading" plugin) is written against the public contract only. (Was "weekend shading + jump-to-today"; the today line and `panToToday` ship in core at S1.12, so shading alone carries the gate.)
- [x] `[S5-A3]` A consumer-defined entry kind (custom renderer + capabilities + context-menu `when` items, registered via config/plugin only) renders and behaves correctly with zero core edits — the §2.5 open-set claim, proven.
- [x] `[S5-A4]` Every S3 pointer capability has a keyboard path; axe reports no violations on harness pages.
- [x] `[S5-A5]` Consumer replaces the entry editor via `beforeEntryEdit` (demo in harness).
- [x] `[S5-A6]` Unused features are absent from a consumer bundle (tree-shaking test in CI).

---

## S6 — Scale validation, hardening, linked Gantt instances

**Goal:** the D2 posture is settled by measurement, budgets become CI-enforced, and the D9 multi-Gantt story ships as a real demo. Core (no scheduling plugin) is scale-proven here.

**Scope**

- **Measured spike against the growth targets** (the numbers that decide, not guess): 10k entries / 5k rows scroll p95 frame time; pack-heavy rows layout cost; prefix-sum vs. log-time height index crossover; reconciler cost on 20k-bar sync + 200-bar commit; zone arithmetic per-tick cost. Graph and SVG-link cost wait for S7, when links exist.
- Act on the spike: swap in the log-time height index if warranted (interface already in place); any reconciler fixes. A worker seam for `schedule()` is not this slice's — measure it after S7 if the plugin's numbers demand it (D2).
- Performance budgets in CI on reference hardware; regressions fail the build.
- Linked-Gantt demo: a delivery-schedule Gantt + a workforce Gantt bound to the same `TimeScaleModel`/`ScrollModel` — the D9 acceptance demo. **Two sharing shapes:** both axes shared, which sharing one `ScrollModel` already gives, and x shared with y private, which is a build (#405, caller arrived 2026-09-15). `yOnly()` stays deferred — it has no caller (D-S1.5-3). Neither Gantt needs the scheduling plugin.
- Hardening: error-path audit (typed errors everywhere), memory-leak pass (mount/destroy cycles), `exports` map sealing internals, semver/API-report tooling (I11 automated), bundle-size budget in CI.
- **Known gap (issue #91 §9-I, remaining half; tracked as issue #112 seam B):** `GanttShellOptions.backend` closed the hardcoded `createDomBackend()` call site, but `render/null`'s backend is still unreachable from `view/` — `PaneLayout` mounts real `HTMLElement`s regardless of which backend paints them. If this slice's measurement/hardening work wants a DOM-free `view/`+`layout/` harness, `PaneLayout` (or an equivalent) needs to accept a non-DOM surface too, not just a swappable backend. Plan and current code shape: `plans/issues/open/112-di-seams.md` (Seam B).
- Release plumbing: versioned docs from the harness gallery, CHANGELOG, publishing pipeline. Product 1.0 waits for S7 (D3).

**Acceptance**

- [ ] All §12-style budgets defined numerically from the spike and enforced in CI.
- [ ] 10k-entry fixture: smooth scroll, sub-frame hover, bulk edit in one transaction without jank on reference hardware.
- [ ] Linked-scroll demo works with both axes shared, and with x shared while y stays private, with zero Gantt-side special-casing. Both-axis sharing is proved by `[S1-A4]`; **x shared with y private is a build, #405** — ruled 2026-09-15. `yOnly()` stays deferred — it has no caller (D-S1.5-3). Slice plan: `plans/s6-scale-and-sync/README.md` §5.3.
- [ ] 100 mount/destroy cycles leak no nodes, listeners, or observables.
- [ ] `npm pack` output audited: internals unreachable, types complete, bundle within budget.

---

## S7 — Dependencies & the scheduling plugin

**Goal:** links drawn, and FreeGantt's first-party default scheduling plugin (D3) occupying the extension hook `data/` already exposes (D4; `01` §1; contract #12 / install API from S5). Policy seam: propagation with lag, cycle detection with named members, diagnostics, pinned entries. Cascades visible live in the harness. Core itself does not require this plugin; S3–S6 already ran without it.

**Split, settled since this section was written (2026-09-02):** the S5.0 grill on #111 split "this plugin" into two, one-way — `entryDependencies()` (the `Dependency` store, the link-create gesture, link rendering) and `scheduling()` (propagation, pins, `SchedulingPolicy`, diagnostics), with `scheduling()` requiring `entryDependencies()` and never the reverse (`plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` D-S5-30/D-S5-31). The scope below still reads as one plugin; #136 carries the reusable design forward and re-splitting this section across the two factories is scoped work for whoever opens S7. #136 also has an **open, undecided proposal** for the link-emitter boundary (a Gantt-side plugin reading a Dataset-side plugin's store) — settle that before writing the `layout/` line below.

**Blocking prerequisite — #197, met (2026-09-05).** The plugin contract used to publish `merge(next(request), mine(request))` while the library exported no `merge`. `mergeEntryEdits` is now a package export, re-exported from `api/dataset-plugin.ts` beside the `DatasetEditHook` contract that hands a plugin the occupant it has to merge with. Every doc example composes with it, and `src/data/edit-extension.test.ts` pins the law extenders on **one** entry obey **at any depth**: every write survives, and every `proposedKeys` with it. The law was first pinned at two extenders only, and it broke at three — `mergeStoredEdits` stamped an empty `proposedKeys` when neither side stated one, so a third merge read the first two plugins' writes as nothing and dropped them from the store, the changeset and undo (#238, fixed 2026-09-06). The depth-three case is pinned now. Two follow-on defects the export uncovered are fixed in the same change — `mergeStoredEdits` lost a raw patch's writes when the other side proposed Field keys, and I4's dev guard read `proposedKeys` as a Field name and refused any composed extender edit. `scheduling()` composing over `entryDependencies()` (D-S5-30/D-S5-31) can now stand on the seam. Gate row: `00` §4, S6 → S7.

**Scope**

- `scheduling/`: `schedule(request) → { patch, diagnostics }` — pure, deterministic; worklist-loop propagation (I3) with the 5,000-link chain fixture; lag per dependency type (FS/SS/FF/SF, negative legal); cycle diagnostics naming members; pinned-entry semantics (report, never move — the pin flag lives in the plugin's own per-entry storage per the #12 contract, not on `Entry`). Kind semantics owned by the policy per `01` §2.5. The engine moves children and stops; span rollup stays `data/`'s commit step (D-S2-22).
- `SchedulingPolicy` seam + `defaultPolicy` (`01` §7): `resolveEdit` (proposed fields decide what moves), precedence (`pinned > dependency`), dev-assert that a proposed field is never overwritten (I4).
- Plugin registration: this plugin occupies the core extension hook via the **public** plugin contract shipped in S5. Its extender body is the only place that calls `schedule()`. `data/` stays generic. `interaction/` and `view/` still do not import `scheduling/`.
- `data/` integration: the extender builds a `schedule()` call from `proposed`; extra writes merge into the same changeset (`origin: 'engine'`). I7 now includes engine patches. Drag preview already calls that extender (S3), so successor ghosts appear with no S3/S4 code change.
- **Staged commit pipeline (parked from the 2026-08-31 `s4-implement` GLM review, candidate 4).** `runTransaction` still runs the body, then `buildCommitChangeSet` (body diff → extension hook → autoGroup promotion → Rollup → fold), then `commitChangeSet` (notify and apply). Construction already writes through `writeCommittedFieldRows` and does not mint a fake `'user'` changeset. S7 must not grow a sixth inline block inside `transaction.ts`. The scheduling plugin occupies the existing extension-hook stage (D4, ADR 0002). If S7 needs extra commit work (diagnostics fan-out, `origin: 'engine'` rows that the extender cannot own), add a named stage in `data/build-commit-change-set.ts` (or a sibling pipeline module), with one test per stage. Unify the construction promote/rollup pass with that pipeline in the same change (S4.11 review C3) so S7 does not keep two orchestrators.
- `layout/`: link emission seam — **design open at #136** (supersedes #16; a `registerLinkEmitter` seam is proposed but the Gantt-side-reads-Dataset-side-store question isn't settled) — orthogonal paths from bar edges, rendered as SVG; link flags (inactive, in-cycle). Multi-item endpoint rule: links attach to the earliest item by default (`links.endpoints: 'first' | 'all' | 'none'`).
- `interaction/`: `LinkCreate` controller; `beforeLinkCreate` / `linkCreate`; link ports on the capability resolver (I14).
- Diagnostics surface: `scheduleDiagnostics` event; bars flagged via `data-flag`. **Hot-path note:** `flagTokens()` in `render/dom/index.ts` does `Object.keys(flags).filter().join(' ')` per bar per frame. Pre-compute flag tokens in `computeFrame` (same as `a11yLabel`) so the render path is a string copy once flags are live.
- Golden fixtures: hand-built scenario files with expected `ScheduleResult` JSON — lag combinations, all four types, pinned conflicts, cycles, deep chains.
- Harness: link fixture; drag a predecessor, watch successors ghost from the extender (S3 paint path); a cycle fixture showing named diagnostics.

**Acceptance**

- [ ] All golden fixtures pass; 5,000-link chain completes without recursion-depth failure (gate S7→1.0).
- [ ] Cycle diagnostic lists the exact member entries; harness renders them flagged.
- [ ] Moving a pinned entry's predecessor produces a diagnostic and moves nothing.
- [ ] Undo of a cascading edit restores every affected entry (I7 property test now includes engine patches).
- [ ] Dragging a predecessor shows successors' ghost positions live; cancel discards them — via the S3 extender preview, not a `schedule()` call in `interaction/`.
- [ ] The plugin uses only the public plugin contract (zero private imports into `src/scheduling/` from `view/`/`render/`/`interaction/`, and the reverse).
- [ ] `scheduling/` has zero imports from view/render/interaction (lint-proven), >90% coverage — it's pure; no excuse.
- [ ] `AGENTS.md`/`CLAUDE.md` no longer says the API can change freely because nothing has shipped — this is the last slice, so drop that framing as the final step of S7 (the API is public now).

---

## After S7 — the reserved seams (in likely order)

Each of these was designed-for above; none requires a core change:

1. **Working-time calendars** — richer `SchedulingPolicy` + `time/` calendar arithmetic; non-working shading via a decoration.
2. **Date constraints & analyses** — policy vocabulary + analyses (slack, critical highlighting) as policy output consumed by flags/decorations.
3. **Resources & workload views** — `Resource`/`Assignment` stores + a `resources` row source. Reachable two ways, and the choice is open until a caller exists: one Gantt switching `rows` to the resource source, or a second Gantt beside it sharing the axis. The second form is the one named case for two Gantts over one `Dataset`; it stays possible and stays untested until then.
4. **Sync adapter** — an extension consuming the changeset contract (`02` §6).
5. **Export** — image via the null/static render path; paginated print costed honestly as its own project.
6. **Framework wrappers** — thin adapters (`02` §8).
7. **Non-linear time scale** — a second `TimeScale` implementation.
