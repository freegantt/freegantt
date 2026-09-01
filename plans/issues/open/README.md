# Open issue plans

Plans for GitHub issues #127, #128, #124, #112, #129. Each file has the
research findings (current code shape) and a step breakdown. None of the
five issues are stale — all were opened 2026-08-30 to 2026-09-01, on a repo
whose most recent commit is from today.

| Issue | Title | Status | File |
|---|---|---|---|
| [#127](https://github.com/Pawel-IT/FreeGantt/issues/127) | Left pane min size, columns resize weird | Bug + small enhancement | [127-pane-min-width-and-collapse.md](127-pane-min-width-and-collapse.md) |
| [#128](https://github.com/Pawel-IT/FreeGantt/issues/128) | Tools | Needs clarification | [128-tools-needs-clarification.md](128-tools-needs-clarification.md) |
| [#124](https://github.com/Pawel-IT/FreeGantt/issues/124) | Aggregator callback ergonomics for custom rollUp functions | Enhancement | [124-aggregator-context-helpers.md](124-aggregator-context-helpers.md) |
| [#112](https://github.com/Pawel-IT/FreeGantt/issues/112) | DI seams: PaneLayout host + DatasetState reference date | Two independent seams | [112-di-seams.md](112-di-seams.md) |
| [#129](https://github.com/Pawel-IT/FreeGantt/issues/129) | Default Dataset timeZone to the browser zone when omitted | Enhancement, needs a design decision first | [129-default-dataset-timezone.md](129-default-dataset-timezone.md) |

## Suggested order

1. **#112 (reference date only)** and **#124** are the lowest-risk, most
   self-contained — pure additive seams/helpers, no public API breakage.
2. **#127** is a real bug (drag-to-zero) with a small, well-scoped fix; the
   collapse-toggle half is an optional follow-up.
3. **#129** needs one design decision made first (Node/headless fallback —
   see the "Decision needed" step in its file) before implementation starts.
4. **#112 (PaneLayout host injection)** is the largest of the five — it's
   prep work for the S6 DOM-free harness, not an isolated bug fix. Sequence
   it against the S6 slice plan (`plans/s4-hierarchy-and-rows/`, and
   whatever plan directory S6 lands under) rather than in isolation.
5. **#128** needs the reporter to clarify scope before any plan can be made.
