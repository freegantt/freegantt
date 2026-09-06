# Open issue plans

The first four tracked issues (#112, #124, #127, #129) closed on
2026-09-01. (#128 "Tools" was considered but dropped from this set — its
body is just an unexplained external link, with no actionable scope.) New
issue plans land here as they're opened.

**Open:**
- [#160](https://github.com/Pawel-IT/FreeGantt/issues/160) — an open Cell editor whose
  commit was refused has one exit, Escape, and nothing on screen says so. Grilled
  2026-09-05, not implemented. The design: a discard button inside the editor's own
  wrapper, a `freegantt.discardCellEdit` command behind it (D-S5-26's rule that a
  pointer affordance and its command land together), and blur stops re-committing a
  value the Field just refused. Five answers need the repo owner — see §7. Plan:
  [160-discard-an-open-cell-editor.md](./160-discard-an-open-cell-editor.md).
- [#130](https://github.com/Pawel-IT/FreeGantt/issues/130) — WBS. Settled as a
  first-party Dataset plugin; no code written yet. Plan: [130-wbs.md](./130-wbs.md).

**Closed:**
- [#157](https://github.com/Pawel-IT/FreeGantt/issues/157) — no way to say
  "size the grid pane to its columns". `gridWidth` now takes `'fitColumns'`:
  the pane sits on the columns' own edge and re-measures on every rebind, so
  a consumer never restates a width the library already computes. The getter
  still answers in px; a Splitter drag ends the instruction. See
  [../closed/157-fit-grid-pane-to-columns.md](../closed/157-fit-grid-pane-to-columns.md).
- [#139](https://github.com/Pawel-IT/FreeGantt/issues/139) — Grid columns
  flex-resize instead of supporting fixed widths with overflow scroll. A Grid
  column is fixed-width by default now: `resolveColumns` fills a width from
  this Gantt's column, then the Field's `column.width`, then
  `--fg-column-width` (fallback 120), which is what finally gives #126's
  horizontal scroller something to reach. `flex` is the one opt-out. See
  [../closed/139-fixed-width-grid-columns.md](../closed/139-fixed-width-grid-columns.md).
- [#154](https://github.com/Pawel-IT/FreeGantt/issues/154) — one
  registration table behind the plugin `register*` seams. `layout/`'s
  `createRegistrationTable` holds a stack of live registrations per key: the
  newest wins, and a disposer removes exactly its own registration, in any
  disposal order. The three Gantt-side seams (item producer, kind defaults,
  plugin grid column) all adopt it, which closes #146, #147 and the
  two-plugin half of #152. See
  [../closed/154-registration-table.md](../closed/154-registration-table.md).
- [#112](https://github.com/Pawel-IT/FreeGantt/issues/112) — DI seams:
  PaneLayout host + DatasetState reference date. Seam A landed
  (`33b72c5`); Seam B folded into S6's scope in `plans/03-slices.md`. See
  [../closed/112-di-seams.md](../closed/112-di-seams.md).
- [#124](https://github.com/Pawel-IT/FreeGantt/issues/124) — Aggregator
  callback ergonomics. `RollUpContext.values`/`numericValues` shipped, shipped
  aggregators refactored onto them. See
  [../closed/124-aggregator-context-helpers.md](../closed/124-aggregator-context-helpers.md).
- [#127](https://github.com/Pawel-IT/FreeGantt/issues/127) — Left pane min
  size, columns resize weird. `minGridWidth` shipped as a live, wired-through
  `GanttOptions` property, default `40`, bounding the splitter drag only; the
  optional collapse-toggle affordance was left for a future follow-up. See
  [../closed/127-pane-min-width-and-collapse.md](../closed/127-pane-min-width-and-collapse.md).
- [#129](https://github.com/Pawel-IT/FreeGantt/issues/129) — Default Dataset
  timeZone to the browser zone when omitted. `timeZone` is now optional;
  omitted, it resolves the environment's zone once at construction
  (`'UTC'` fallback in bare Node), stored as a concrete IANA string, never a
  sentinel. See
  [../closed/129-default-dataset-timezone.md](../closed/129-default-dataset-timezone.md).

`#112`'s other half (`PaneLayout` host injection) is closed out of this
list — it's now S6 scope, tracked in `plans/03-slices.md` and
`plans/issues/closed/112-di-seams.md`, not a standalone open issue.
