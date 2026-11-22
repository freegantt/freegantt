---
status: accepted — ruled 2026-11-22 by the owner. Reverses the retirement of "Lane" in #298.
decided: A Lane is a horizontal band inside one Row. A consumer states how many Lanes a Row holds and which Lane a Bar sits in. Lane geometry comes from `--fg-lane-*` tokens only. The library does not pack Bars into Lanes.
open: none.
---

# A Lane is a band inside a Row

## Context

#298 retired the word "Lane". At that time the only packing behaviour was the one every Row has: Bars centre in the Row. No consumer needed more.

A consumer app needs more. One Row can hold several parallel bands, such as one band per assignee. An empty band is a band with no Bar. A Row with two bands is taller than a Row with one.

## Decision

- **Lane**: a band inside one Row. A Row holds zero or more Lanes.
- **`gantt.lanes`**: `{ count(entry), of(entry) }`. `count` says how many Lanes the Row holds, and an empty Lane still counts. `of` says which Lane a Bar sits in, zero-based.
- **Geometry is tokens only**: `--fg-lane-height`, `--fg-lane-gap` and `--fg-lane-padding`. The library reads them through `pixel-property.ts`, as it reads `--fg-row-height`. An option for the same value would be a second source.
- **Row height with Lanes**: `2 × padding + n × lane + (n − 1) × gap`.
- **The frame** carries `FrameRow.lanes` as `{ top, height }[]` and `FrameBar.lane`.
- **No packing**: the consumer assigns the Lane. The library never moves a Bar to another Lane.

## Options rejected

- **Keep Lane retired and use one Row per band.** The Row then no longer stands for one thing, and the Rollup and the label column break.
- **Lane geometry as options and tokens.** Two sources for one value.
- **Automatic Lane packing.** The old `heightMode: 'pack'` was retired because no consumer used it. This consumer assigns Lanes from its own data.

## Consequences

- `CONTEXT.md` reinstates *Lane* and drops the "Lane retired" wording from *Row*.
- With no `lanes` option, a Row draws as before.
