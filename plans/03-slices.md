# FreeGantt — Vertical Slices

Each slice cuts through the whole stack and ends with something visible and pokeable in the dev harness (`harness/`). No slice is pure infrastructure; no slice's value depends on a later slice landing. Gates from `00-overview.md` §4 apply between slices.

Slices are scope, not calendar estimates. Within a slice, entries are ordered so the visible result appears as early as possible.

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
- Theming foundation: CSS custom properties + parts vocabulary (`--fg-*`, `data-flag`); light/dark, default colour tokens sourced from an existing palette (`plans/s1.10-theming-and-a11y/README.md` D-S1.10-9), fully overridable per level 1; a named multi-preset picker beyond light/dark is deferred to S6 (same doc, §9).
- A11y foundation: the Gantt is focusable, rows/bars have roles and labels, focus visible.

**Acceptance**

- [ ] Scroll a 5,000-entry fixture smoothly; only windowed rows exist in the DOM.
- [ ] Grid and timeline row tops are pixel-identical under fractional zoom (I9).
- [ ] Preset switch and zoom are live reconfigurations — no remount, anchor preserved.
- [ ] Two harness Gantt instances given the same `ScrollModel` scroll together (a 5-line harness demo — the D9 seam proven now, cheaply).
- [ ] Axis headers correct across a DST transition in the dataset zone (unit-tested in `time/`).

---

## S2 — Data core: transactions, undo, changesets, JSON

**Goal:** the data layer that everything else rides on (D10 first half, D7). Programmatic mutation with transactions, exact undo/redo, changeset events, versioned serialization — all visible live in the harness.

**Scope**

- `data/`: normalized stores + indexes; instance-scoped reactivity façade (one small dep, swappable); `DatasetData` owning stores + zone.
- Transactions: batching, auto-wrap of single mutations, one changeset per transaction (`origin` tagged).
- Undo/redo: transaction = atomic unit; recorded changesets replayed exactly; history API (`canUndo`, capacity).
- Changesets: `{ added, removed, updated: {field, from, to} }` (`01` §6); `dataset.on('change')`; `dataset.apply(changeSet)` with validation + rejection reporting.
- Serialization: `toJSON()`/`fromJSON()` with `schema: 1`, ISO instants, opaque `meta` round-trip.
- Public mutation API: `dataset.entries.add/update/remove`, `dataset.dependencies.*`, typed, validating.
- View binding: committed changesets invalidate layout incrementally (changed rows only), not globally.
- Harness: mutation playground — edit fixture via console/buttons, watch the Gantt update; undo/redo buttons; changeset log panel; export/import JSON.

**Acceptance**

- [ ] Property test: random mutation sequences + undo-all restores byte-identical `toJSON()` (I7 groundwork — engine patches join in S3).
- [ ] `fromJSON(toJSON(p))` round-trips byte-stable.
- [ ] A 500-entry bulk update inside one transaction produces one changeset, one layout pass, one frame.
- [ ] Changeset log in harness shows `from`/`to` per field for every edit.

---

## S3 — Dependencies & the scheduling plugin

**Goal:** links drawn, and FreeGantt's first-party default scheduling plugin (D3) — occupying the resolve hook `data/` exposes (D4; `01` §1; exact contract tracked in issue #12) — with its policy seam: propagation with lag, cycle detection with named members, diagnostics, pinned entries. Cascades visible live in the harness. Core itself does not require this plugin (D4); S3 is where FreeGantt's own default happens to occupy the hook it ships with.

**Scope**

- `scheduling/`: `schedule(request) → { patch, diagnostics }` — pure, deterministic; worklist-loop propagation (I3) with the 5,000-link chain fixture; lag per dependency type (FS/SS/FF/SF, negative legal); cycle diagnostics naming members; pinned-entry semantics (report, never move — the pin flag lives in the plugin's own per-entry storage per the #12 contract, not on `Entry`); parent/`group` rollup as a second pass — kind semantics owned by the policy per `01` §2.5 (tree exists in data from S2; visual tree lands in S5).
- `SchedulingPolicy` seam + `defaultPolicy` (`01` §7): `resolveEdit` (proposed fields decide what moves), precedence (`pinned > dependency`), dev-assert that a proposed field is never overwritten (I4).
- Plugin registration: this scheduling plugin occupies the core resolve hook exclusively via the `01` §1 mechanism (issue #12) — `data/` calls the hook generically and has no scheduling-specific code path.
- `data/` integration: transactions run the resolve hook, which (with this plugin installed) builds a `schedule()` call from the transaction's `proposed` edits; the plugin's patch merges into the same changeset (`origin: 'engine'`) — undo now reverts user + engine effects atomically (I7 complete).
- `layout/`: link routing — orthogonal paths from bar edges, rendered as SVG; link flags (inactive, in-cycle).
- Diagnostics surface: `scheduleDiagnostics` event; bars flagged via `data-flag` (level-2 theming shows conflicts with pure CSS). **Hot-path note:** `flagTokens()` in `render/dom/index.ts` does `Object.keys(flags).filter().join(' ')` per bar per frame. Today flags are always `{}` so it's free, but once S3 sets `conflict`/`cycle` true on real bars, this becomes a per-frame allocation in the hot path. Consider pre-computing flag tokens in `computeFrame` (same as `a11yLabel`) so the render path is a simple string copy.
- Golden fixtures: hand-built scenario files with expected `ScheduleResult` JSON — lag combinations, all four types, pinned conflicts, cycles, deep chains. These define correctness from here on.
- Harness: link fixture; edit a predecessor date, watch successors cascade; a cycle fixture showing named diagnostics.

**Acceptance**

- [ ] All golden fixtures pass; 5,000-link chain completes without recursion-depth failure (gate S3→S4).
- [ ] Cycle diagnostic lists the exact member entries; harness renders them flagged.
- [ ] Moving a pinned entry's predecessor produces a diagnostic and moves nothing.
- [ ] Undo of a cascading edit restores every affected entry (I7 property test now includes engine patches).
- [ ] `scheduling/` has zero imports from view/render/interaction (lint-proven), >90% coverage — it's pure; no excuse.

---

## S4 — Direct manipulation

**Goal:** editing with the pointer (D10 second half): drag-move, resize, link-create, selection — each gesture cancelable, transactional, undoable, with live cascade preview.

**Scope**

- `interaction/`: controller base with the pointer invariants (`01` §9 — arm threshold, nothing written on pointerdown, escape-cancel, pointer capture, touch); `Drag`, `Resize`, `LinkCreate`, `Select` controllers.
- Hot path: `InteractionState` + `backend.applyState()` — hover, selection, drag ghost as class toggles and transforms; zero allocation (I5).
- Snapping via the preset's `snap` spec; modifier key for fine placement.
- Capabilities: the `interactions` config resolved per entry over per-kind defaults (`02` §4.1); one resolution gates gesture arming *and* affordance rendering — handles, ports, cursors (I14).
- Cancelable events: `beforeEntryMove/Resize`, `beforeLinkCreate`, `beforeSelectionChange` + after-events; async veto suspends with pending state (`02` §3).
- Speculative cascade preview: throttled pure `schedule()` call per frame with draft `proposed`; ghost positions for affected successors; discard on cancel (`01` §7).
- One transaction per gesture at commit (I6); undo reverts the whole gesture.
- Keyboard parity begins: selected bar nudges by snap with arrow keys; Enter/Escape semantics.
- Harness: full editing playground; a veto demo (drop before a boundary date is rejected with a toast).

**Acceptance**

- [ ] Every gesture: cancelable before-event → exactly one transaction → after-event (event-order test).
- [ ] Escape mid-drag restores exactly the pre-gesture state, including preview ghosts.
- [ ] Hover across 1,000 visible bars allocates nothing and rebuilds no frame (I5 perf test).
- [ ] Dragging a predecessor shows successors' ghost positions live; cancel discards them.
- [ ] An entry whose `resize` capability resolves false shows no handles and cannot be resized by pointer or keyboard (I14).
- [ ] A gesture undone by Ctrl+Z reverts user + cascade in one step.

---

## S5 — Hierarchy, grouping, multi-item rows

**Goal:** the Row ≠ Entry payoff (principle 1). Tree view with collapse/expand, grouped row sources, entry segments as multiple bars on one row, lane packing with variable row heights.

**Scope**

- Tree UI: indent + expand/collapse in the grid's name column; collapse state is view state (per Gantt, not in dataset data).
- Kind-driven item emission (`01` §2.5): `group` → summary bracket (rollup from S3), `milestone` → diamond, consumer-registered kinds via the emitter seam; empty groups render as groups.
- `hierarchy: { autoGroup: true }` on `Dataset`: first child promotes the parent to `group` within the triggering transaction; promote only, never demote (`02` §2).
- Row sources: `{ source: 'group', groupBy }` and `{ source: 'custom', resolve }` (`01` §2.3); group header rows.
- Sort and filter as store-level view specs with tree-aware policies (filter keeps ancestors by default; sort stays within parent).
- Item emission: `entry.segments` → multiple items on one row; overlap auto-packing into sub-lanes; `heightMode: 'pack'` variable row heights through the height index.
- Dependency endpoint rule for multi-item entries: links attach to the earliest item by default, configurable per view (`links.endpoints: 'first' | 'all' | 'none'`).
- Interaction with lanes: drag/resize on packed items; collapse/expand by keyboard.
- Harness: tree fixture; a grouped view of the same dataset side-by-side with the tree view (two Gantt instances, one dataset — the D9/D2 architecture visibly paying off).

**Acceptance**

- [ ] Same dataset renders as tree and as grouped rows simultaneously in two Gantt instances; edits in one appear in both.
- [ ] A segmented entry renders N bars on one row; drag of one segment behaves sanely and transactionally.
- [ ] Pack-mode rows change height correctly as overlaps come and go; scroll position stays stable (height index invalidation test).
- [ ] Collapse state survives data edits and is independent per Gantt.
- [ ] Filter with keep-ancestors shows a matching deep child under its chain of parents.
- [ ] An empty `kind: 'group'` entry renders as a group, accepts children, and its span appears once children exist — no special-casing.
- [ ] With `autoGroup` on: reparenting an entry under a plain entry promotes that parent to `group` in the same undo step; removing all children demotes nothing.

---

## S6 — Extensibility, editing surfaces, a11y completion

**Goal:** the library's extension story is real and dogfooded (gate: a non-trivial built-in feature uses only the public plugin API), the grid grows into a proper editable table, and accessibility reaches its full committed level (D11).

**Scope**

- `extensions/`: plugin runtime implementing the full `PluginContext` (`01` §10) — decorations, columns, renderers, overlay anchor, controllers, keybindings, commands, disposables.
- Built-in features **as plugins**: tooltips (shared `Popup` primitive: anchoring, flipping, clamping, focus trap), context menu (command-registry-driven), row highlight decorations, today line.
- Grid maturation: column types (name, start, end, duration, custom value/renderer), inline editors (text, date via a pluggable date-input seam — no bundled date-picker dependency), column resize/reorder; `beforeEntryEdit` veto/replace flow.
- Renderer callbacks at every declared point (`bar`, `cell`, `header`, `tooltip`), text-safe by default (I13).
- A11y completion: grid pattern with roving tabindex, full keyboard reach for every interaction (link creation included), screen-reader labels with dates/progress, focus management in popups; axe checks in CI on harness pages.
- Docs seed: harness pages get explanatory text and become the example gallery; public API reference generated from types.

**Acceptance**

- [ ] Context menu and tooltips are plugins with zero private imports (lint-proven — the dogfood gate).
- [ ] A harness-only third-party-style plugin (e.g., a "weekend shading + jump-to-today command" plugin) is written against the public contract only.
- [ ] A consumer-defined entry kind (custom renderer + capabilities + context-menu `when` items, registered via config/plugin only) renders and behaves correctly with zero core edits — the §2.5 open-set claim, proven.
- [ ] Every pointer capability has a keyboard path; axe reports no violations on harness pages.
- [ ] Consumer replaces the entry editor via `beforeEntryEdit` (demo in harness).
- [ ] Unused features are absent from a consumer bundle (tree-shaking test in CI).

---

## S7 — Scale validation, hardening, linked Gantt instances

**Goal:** the D2 posture is settled by measurement, budgets become CI-enforced, and the D9 multi-Gantt story ships as a real demo. Ends with a 1.0-able library.

**Scope**

- **Measured spike against the growth targets** (the numbers that decide, not guess): 10k entries / 5k rows scroll p95 frame time; pack-heavy rows layout cost; prefix-sum vs. log-time height index crossover; reconciler cost on 20k-bar sync + 200-bar commit; SVG link cost at 2k paths; zone arithmetic per-tick cost.
- Act on the spike: swap in the log-time height index if warranted (interface already in place); worker seam for `schedule()` above a measured threshold (resident mirror + changeset shipping — only if the numbers demand it); any reconciler fixes.
- Performance budgets in CI on reference hardware; regressions fail the build.
- Linked-Gantt demo: a delivery-schedule Gantt + a workforce Gantt bound to the same `TimeScaleModel`/`ScrollModel` (x, y, and both variants) — the D9 acceptance demo.
- Hardening: error-path audit (typed errors everywhere), memory-leak pass (mount/destroy cycles), `exports` map sealing internals, semver/API-report tooling (I11 automated), bundle-size budget in CI.
- Release: versioned docs from the harness gallery, CHANGELOG, publishing pipeline.

**Acceptance**

- [ ] All §12-style budgets defined numerically from the spike and enforced in CI.
- [ ] 10k-entry fixture: smooth scroll, sub-frame hover, bulk edit in one transaction without jank on reference hardware.
- [ ] Linked-scroll demo works in x, y, and both modes with zero Gantt-side special-casing.
- [ ] 100 mount/destroy cycles leak no nodes, listeners, or observables.
- [ ] `npm pack` output audited: internals unreachable, types complete, bundle within budget.

---

## After S7 — the reserved seams (in likely order)

Each of these was designed-for above; none requires a core change:

1. **Working-time calendars** — richer `SchedulingPolicy` + `time/` calendar arithmetic; non-working shading via a decoration.
2. **Date constraints & analyses** — policy vocabulary + analyses (slack, critical highlighting) as policy output consumed by flags/decorations.
3. **Resources & workload views** — `Resource`/`Assignment` stores + a `resources` row source; the second Gantt in the D9 demo becomes a real workload view.
4. **Sync adapter** — an extension consuming the changeset contract (`02` §6).
5. **Export** — image via the null/static render path; paginated print costed honestly as its own project.
6. **Framework wrappers** — thin adapters (`02` §8).
7. **Non-linear time scale** — a second `TimeScale` implementation.
