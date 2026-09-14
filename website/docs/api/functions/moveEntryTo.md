# Function: moveEntryTo()

> **moveEntryTo**(`entry`, `start`): [`EntryEdit`](../type-aliases/EntryEdit.md)

Defined in: data/entry-reader.ts:444

The move a plugin's cascade is honest about (D-S5-44): every Segment of `entry`, translated rigidly
by `start - entry.start`, each keeping its own `SegmentId` and its own length. This is what a
several-Segment envelope-only write cannot say — `reconcileEnvelope` refuses that write because
`start`/`end` alone name no Segment to move — so a plugin author reaches for `moveEntryTo` instead
of hand-rolling the same rigid translate `layout/gesture-draft.ts`'s own `moveEdit` computes for a
whole-Entry drag. `layout/` and `data/` may not import each other (§1), so that is a second,
private copy of this same rule, not a shared function — `moveEdit` also moves only the gesture's own
selected Segments, never every Segment of the Entry, which this always does.

It names `segments` and nothing else, and core derives the envelope from them (D-S5-50, #239). It
used to state the envelope too, and that cost a plugin author a silent write: composing this result
over an earlier plugin's `{ end }` overwrote that `end` with one these Segments produce, so the
merged edit read as self-consistent and committed with the earlier write gone. Naming `segments`
alone makes the same composition a refusal (`SegmentsOutOfSyncError`, `'conflicting'`) instead — the
defect class #238 closed for `proposedKeys`, closed here for the envelope.

A public export (`api/dataset-plugin.ts`, `api/index.ts`), for the same reason `mergeEntryEdits` is:
it builds the `EntryEdits` map's value type, which only an extender produces, so it is a
plugin-author tool and not an app-author one.

`start` is an `Instant`, not the loose `InstantInput` every way *in* takes. This is a builder, not a
way in: the way in is the extender's return, which `toEditsReading` normalizes. Taking a loose date here
would need a zone to read it, and asking a plugin author to hand back `ctx.dataset.timeZone` — a
zone core already holds — is the zone math core is supposed to fill for them (`plans/02`, "two
callers, two surfaces"). A caller who holds a loose date reads it with `time/`'s own helper first.

## Parameters

### entry

[`StoredEntry`](../interfaces/StoredEntry.md)

### start

[`Instant`](../type-aliases/Instant.md)

## Returns

[`EntryEdit`](../type-aliases/EntryEdit.md)
