---
status: accepted — ruled 2026-09-18, out of branch review F9 on
[#421](https://github.com/Pawel-IT/FreeGantt/issues/421). Working material:
`plans/segment-is-a-bar/BUILD-LOG.md` (Q39, corrected here).
decided: an `EditExtender` that proposes a value core defines as impossible gets a **refusal** — the
gesture drops at `severity: 'warning'`, `by: <the plugin>`. An extender that throws anything else
gets a **fault** — `gesture-commit-failed` at `severity: 'error'`. `severity` answers what it cost;
`by` answers whose proposal it was.
open: the rule is stated for the one impossible value core has today, an inverted span. A second one
takes a `GestureDroppedReason` of its own under this same rule.
---

# A plugin's impossible proposal is a refusal, not a fault

**Reads after [0026](0026-the-segment-retires.md)**, which retired the `Segment` and, with it, a
`GestureDroppedReason` this ADR reinstates under a different name.

## Context

An `EditExtender` runs inside a gesture's commit. It can propose an end that falls before its start.
Core has refused that span since [#143](https://github.com/Pawel-IT/FreeGantt/issues/143) (ruled
2026-09-06: *an inverted span is refused at ingest, not stored and rendered honestly*), and
`InvertedSpanError` is the refusal.

Before #421 the gesture pipeline classified that refusal and reported a dropped gesture,
`droppedReason: 'write-refused'`, at `severity: 'warning'`. Q39 retired the literal on the reasoning
that the store only ever refused *an envelope-only cascade against a several-Segment Entry*
(`D-S5-44`), so with the Segment gone the literal was unreachable and therefore dead surface.

**The premise was half true.** The classifier named two errors:

```ts
// 2c150be:src/data/entry-reader.ts:489
return error instanceof SegmentsOutOfSyncError || error instanceof InvertedSpanError;
```

`SegmentsOutOfSyncError` really did die with the Segment. `InvertedSpanError` never was
Segment-specific — it fires whenever an edit lands `end` before `start`, which an extender can still
do with no Segment anywhere. Branch review F9 reproduced it: the same input that used to give a
`'write-refused'` dropped gesture at `warning` now gives `gesture-commit-failed` at `error`. Nothing
crashed and no data moved, so the change was invisible except to a consumer routing on `severity`.

This left a real question behind the bookkeeping: **when a plugin asks for something core does not
support, who owns the error?** Three answers are in wide use.

| Library | Answer |
|---|---|
| [Rollup](https://rollupjs.org/plugin-development/) | Core validates and refuses; the report carries the blame. Anything a plugin hook raises is augmented with `code: "PLUGIN_ERROR"` and `plugin: plugin.name`, and an existing `code` is demoted to `pluginCode`. |
| [ProseMirror](https://prosemirror.net/docs/guide/) | Core trusts, and offers an opt-in checker. Primitive node-creation methods *"put the responsibility for providing sane input on their caller"*; `createChecked` and `check()` enforce on request. Invalid content is *"even a reasonable thing to do"* for a node open at the edge of a slice. |
| [Luxon](https://github.com/moment/luxon/blob/master/docs/validity.md) | Neither. A third *invalid* state propagates harmlessly, carrying `invalidReason` (a stable code) and `invalidExplanation` (prose), with `Settings.throwOnInvalid` as opt-in strictness. |

ProseMirror's permissiveness is the strongest argument for letting a plugin store an inverted span,
and it does not carry here. An open node is still a node. A backwards bar is not still a bar: there
is no width to draw, no hit target, and no rollup answer. Storage is half-open `[start, end)`, so an
inverted span is not an unusual value — it is a contradiction in the domain model. A negative
`Duration` means *backwards* and Temporal supports it deliberately; a negative *span* means nothing.

Rollup's answer is the one that fits, and **core already implements it**: `ErrorReporter` is
`'core' | 'consumer' | PluginId`, and `error-report.ts` already rules that a plugin's report names
the plugin, *"not `'core'`"*. So blame was never the open question. The open question was severity,
and `error-report.ts` had already ruled on that too: *"a field named `severity` whose values are not
severities would cover two concepts with one word. Telemetry routes on `severity !== 'info'`."*

## Decision

**An extender proposing a value core defines as impossible is a refusal.** The gesture drops, the
entry keeps its stored dates, and the report is `entry-move-dropped`/`entry-resize-dropped` with
`droppedReason: 'inverted-span'`, `severity: 'warning'`, `by: <the plugin>`, and the
`InvertedSpanError` as `cause`.

**An extender that throws anything else is a fault**, unchanged: `gesture-commit-failed` at
`severity: 'error'`, which is what [#258](https://github.com/Pawel-IT/FreeGantt/issues/258) and
[#332](https://github.com/Pawel-IT/FreeGantt/issues/332) ruled when they refused to let a plugin's
bug wear a refusal's clothes. The line between the two is what the plugin meant: a computed span core
answers *no* to is a proposal, and a bare `Error` out of the same hook is the extender falling over.

**`'inverted-span'`, not `'write-refused'` restored.** The old name described the Segment envelope,
which is gone. The new one names the condition it reports and pairs with `InvertedSpanError`'s own
thrown code, which is already the string `'inverted-span'`.

**No escape hatch.** Core publishes no unchecked door for storing an inverted span. A plugin that
wants a zero-length marker or a direction should get a representation for that, not a corrupted span.

## Consequences

- `GestureDroppedReason` gains `'inverted-span'`. It is the first member reporting `by: <plugin>`
  rather than `by: 'core'`, and the first carrying a `cause`.
- A user gesture can never raise it. `layout/gesture-draft.ts`'s `resizeEdit` clamps the dragged edge
  at zero length and `nudge()` drafts through the same call, so an `InvertedSpanError` on the commit
  path always came from an extender. That is why `by` names the plugin without asking.
- A direct `dataset.entries.update()` with an inverted span still **throws** `InvertedSpanError` to
  its caller. That caller is on its own stack and can catch it, so it needs no report.
- Q39's ruling in `plans/segment-is-a-bar/BUILD-LOG.md` keeps its prose and takes a correction
  notice: it is a record of what was thought at the time.
- Both sides are pinned in `src/view/gesture-pipeline.test.ts`. Neither side had a test before, which
  is how the reclassification shipped unnoticed.
