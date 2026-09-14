# Type Alias: DurationMeasure

> **DurationMeasure** = `"span"` \| `"segments"`

Defined in: model/time.ts:27

How core measures an Entry's duration (ADR 0017, Q6/J12). One policy per Dataset — a per-Field
 setting would let two Fields on one Dataset disagree about what a duration is.

 - `'span'` — `end - start`, gaps between Segments counted. The default.
 - `'segments'` — the sum of the Segments, gaps counted nowhere.

 A union rather than a boolean: a calendar-aware third answer (duration in working time) is
 plausible at S7, and a union takes it without deleting a published key.
