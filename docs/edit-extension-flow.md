# The extension hook — flow and sample usage

**Scope:** `data/edit-extension.ts` (D-S2-6, `plans/s2-data-core`). This doc illustrates the mechanism
closed in **OQ1** (`plans/s2-data-core/OPEN-QUESTIONS.md`), revised 2026-08-27 at the user's explicit
direction — a plain, usable API now over pre-matching an S3 scheduling contract that doesn't exist yet.
It is a walkthrough, not a spec — the authoritative shape is
`plans/s2-data-core/s2.2-transactions-and-changesets.md` §2.2.

Every mutation runs through **one** hook before it commits. With no plugin installed it is the
identity function — the proposed edits become the committed edits, unchanged. An installed extender
gets one chance to return extra edits, layered on top of what the caller asked for, folded into the
same `ChangeSet`, the same undo step. A transaction can carry any number of proposed edits — one or
many — and the hook always sees the whole batch at once, never one edit at a time.

## Vocabulary

| Name | Shape | What it is |
|---|---|---|
| `EntryEdits` | `ReadonlyMap<EntryId, EntryEdit>` | A batch of proposed field changes, keyed by Entry — the same shape `dataset.entries.update()` already takes, whether the batch holds one entry or many |
| `EditRequest` | `{ entries, proposed }` | What goes into the hook: current entries (a `Map`) + the caller's whole proposed `EntryEdits` batch |
| `EditExtender` | `(request: EditRequest) => EntryEdits` | The function occupying the hook — `identityExtender` when nothing is installed |

There is no wrapper type around the extender's return value. An extender returns extra writes, in the
same shape a caller already writes to `dataset.entries.update()` — one vocabulary for "an edit,"
whoever produces it, and whether it's one entry or a batch. `data/` diffs both the caller's edits and
the extender's edits against the store into `FieldUpdated` rows itself (`diffEdit`), so nobody who
writes an edit has to compute a diff by hand.

## Flow

```mermaid
flowchart LR
    A["Caller<br/>one or more entries.update(...)<br/>in a transaction"] -->|proposes edits| B["Transaction<br/>collects the whole batch"]
    B -->|builds request| C["EditRequest<br/>{ entries, proposed }"]
    C -->|extend, once, whole batch| D["EditExtender<br/>one occupant, one call"]

    D -.->|no plugin installed| E1["identityExtender<br/>returns {} (empty)"]
    D -->|installed| E2["cascadeStartDate<br/>returns EntryEdits"]

    E1 -.-> F["diffEdit<br/>against the store"]
    E2 --> F

    F -->|+ rollup| G["One ChangeSet<br/>added / removed / updated"]
    G -->|emits| H["beforeChange → change<br/>one undo step"]
```

The same hook, two occupants: with nothing installed the extender returns no edits; with
`cascadeStartDate` installed it returns one entry per cascade, for as many proposed edits as it finds
a dependent for. Either way the return value is diffed against the store the same way the caller's own
edits are — the caller's code never branches on which is active, and never branches on batch size
either.

## Sample usage

A consumer moves two entries' start dates together, in one transaction — a caller reschedules a whole
phase, not just one bar. Grouping matters here: without it, each `update()` would commit (and undo)
separately, so a shared "undo the reschedule" click would only undo the second entry.

```ts
// caller — harness/main.ts
dataset.transaction(() => {
  dataset.entries.update('pour-foundation', { start: toInstant('2026-09-03', dataset.timeZone) });
  dataset.entries.update('site-survey', { start: toInstant('2026-08-29', dataset.timeZone) });
});
```

A single edit needs none of that — it's still worth showing, because it's the more common call and it
needs no ceremony at all. D-S2-8 auto-wraps a lone mutation in its own transaction, the same
convenience `plans/02` §2 promises: "Single mutations outside an explicit transaction are auto-wrapped
in one — no second code path."

```ts
dataset.entries.update('pour-foundation', {
  start: toInstant('2026-09-03', dataset.timeZone),
});
```

Nothing about either call changes whether an extender is installed — the cascade, if any, happens
inside the hook, not at the call site. `cascadeStartDate` below runs inside whichever transaction is
open, auto-wrapped or explicit, and sees the **whole** proposed batch in one call — not once per edit:

```ts
// an installed extender — data/'s own internal seam only in S2 (DatasetDataOptions.editExtender
// is unreachable through the package's exports map: tests inject it, harness code cannot)
const cascadeStartDate: EditExtender = ({ entries, proposed }) => {
  const extra = new Map<EntryId, EntryEdit>();

  for (const [id, edit] of proposed) {
    if (edit.start === undefined) continue;

    const dependent = findDependent(entries, id);
    if (dependent) {
      extra.set(dependent.id, { start: edit.start });
    }
  }

  return extra;
};
```

Run against the two-entry transaction above, this extender loops twice — once per proposed edit — and
can return up to two extra edits (`frame-walls` cascading from `pour-foundation`, `permit-review`
cascading from `site-survey`), all folded into the one `ChangeSet` the transaction commits.

There is no public way to install an extender in S2 — `DatasetOptions.plugins` and the rest of the
plugin-facing API are S3's job (#15). Until then this shape only exists for `data/`'s own tests to
inject, so the sample above stops at the extender itself rather than showing it wired into a public
`new Dataset({...})` call.

### Walkthrough

1. **The caller** writes plain `dataset.entries.update(...)` calls — one alone, or several grouped in
   `dataset.transaction(() => { ... })`. It has no idea an extender is installed, and no branch for "if
   a plugin is present" or "if there's more than one edit."
2. **The transaction collects the whole batch** — one proposed edit if the call was auto-wrapped
   (D-S2-8), or however many the body made — and, at commit, builds **one** `EditRequest`: the current
   entries plus every proposed edit together.
3. **`cascadeStartDate` runs once**, given the entire batch. It loops `proposed`, and for each entry
   with a proposed `start` and a dependent, adds one extra edit. Nothing outside the loop's matches is
   touched.
4. **The transaction diffs every edit map against the store** (`diffEdit` — the caller's `proposed` and
   the extender's returned edits alike), then rolls up derived spans, and commits everything as one
   `ChangeSet` — one `change` event, one undo step, no matter how many entries moved.
5. **With no extender installed**, `identityExtender` returns an empty `EntryEdits` regardless of batch
   size: same request, same commit path, nothing extra to diff. The caller's code above does not change
   either way.

## Rendered diagram

A designed version of the flow above (graph-paper/blueprint diagram + annotated code, matching the
`EntryEdits` shape and the multi-edit sample) is published at:
<https://claude.ai/code/artifact/229eddd0-6b41-4e37-85b3-e41e08d8af5f>
