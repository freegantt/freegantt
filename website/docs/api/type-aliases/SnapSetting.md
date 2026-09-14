# Type Alias: SnapSetting

> **SnapSetting** = [`TickStep`](../interfaces/TickStep.md) \| `"tick"` \| `"none"`

Defined in: time/scale.ts:20

What a caller states that a drag snaps to (D-S3-12, D-S3-24): a named unit and increment, one
 tick of whatever preset is showing, or `'none'` for raw pixel placement. `ViewPreset.snap` states
 it for one preset; `Gantt.snap` states it for one Gantt, over whatever preset is showing. The
 gesture resolves it to a `SnapUnit` at commit time, when the preset's own tick is known.
