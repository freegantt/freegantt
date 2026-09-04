# Open issue plans

The first four tracked issues (#112, #124, #127, #129) closed on
2026-09-01. (#128 "Tools" was considered but dropped from this set — its
body is just an unexplained external link, with no actionable scope.) New
issue plans land here as they're opened.

**Open:**
- [#154](https://github.com/Pawel-IT/FreeGantt/issues/154) — one
  registration table behind the plugin `register*` seams, closing #146,
  #147 and the two-plugin half of #152 in the same change. See
  [154-registration-table.md](./154-registration-table.md).

**Closed:**
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
