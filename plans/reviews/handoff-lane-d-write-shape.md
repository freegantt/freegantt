# Handoff — Lane D, the plugin-author write shape

Branch `s5-239-c4`, worktree `/home/pawel/.polyscope/clones/d8643765/wt-data`, based on `s5-start`
at `901f884`. Three commits, each green under `pnpm verify` and each reverts alone.

| Commit | Task |
|---|---|
| `5950356` | #239 option A, D-S5-50 — `moveEntryTo` writes `segments` and lets core derive the envelope |
| `3aa508d` | #209 C4 — the doc pass, and the `harness/plugins/lock-entries.ts` API gap |
| `286b37e` | #237 — the error-message sweep, F4 first |

## 1. `moveEntryTo` (#239, D-S5-50) — one thing the issue got wrong

```ts
moveEntryTo(entry: Entry, start: InstantInput, timeZone: string): EntryEdit
```

**#239's premise is wrong and the record now says so.** The issue argues a loose edit naming only
`segments` "would compose without a computed envelope to contradict". It would not.
`reconcileEnvelope` gates the `'conflicting'` refusal on whether the *merged* edit states `segments`
at all, not on where the envelope came from. A later plugin merging `{ end }` over this move is
refused identically before and after. Pinned by the test *"still refuses a later plugin merging its
own end over this move — before and after alike"*, which runs both shapes side by side.

**What the change does buy** is the composition in the other direction, which nothing covered.
`ExtenderWrapper`'s documented idiom is `mergeEntryEdits(next(request), mine(request))`, so an
earlier plugin's writes are the merge base. A stated envelope overwrote an earlier plugin's `end` per
key and left a *self-consistent* edit, so core had nothing to refuse: it committed and that write
vanished with no error. Naming `segments` alone makes it a refusal. Same defect class as #238.
Pinned by *"turns a silent overwrite of an earlier plugin's end into a refusal"*.

### The one design call a reviewer should weigh

`start` widened to `InstantInput` because CLAUDE.md says input is loose on every way in. A loose date
has no meaning without a zone — that is `time/input.ts`'s own header — so the function gained a third
parameter, `timeZone`. A plugin author has it: `ctx.dataset.timeZone`, in scope inside `setup`.

The alternative was to keep `start: Instant` and argue `moveEntryTo` is a pure builder, not a way in
to the Dataset — the looseness gets resolved at the hook's own door (`readEdits`). Both readings are
defensible. The three-parameter form was taken because the dispatch asked for `InstantInput`
explicitly, and because a two-parameter loose `start` would be a half-truth: it would read a `Date`
and refuse a Plain string, which is exactly the sort of trap #239 was filed about. **If the repo
owner prefers the two-parameter `Instant` form, reverting is a three-line change plus the report.**

## 2. What #237 still owes

The sweep covered every class in `src/model/errors.ts`. Two things are deliberately unfinished.

1. **`InvalidInstantError` still takes a free-form `message`.** It now also takes and exposes
   `value`, and every throw site passes it. It stays message-shaped because its three call sites
   carry three different reasons (unparseable, not a calendar date, not finite), and a reason enum
   is a design call, not a sweep.
2. **`time/input.ts` still prefixes `toInstant():`** — an internal name the consumer never called,
   the exact fault this issue names. It is reached from construction, `entries.add`,
   `entries.update` and a cascade alike, so fixing it means threading `operation` into `toInstant`
   and `toEndInstant`, which touches every `time/` caller. That is its own commit. It is the largest
   remaining item on #237.

Nothing on #237 was blocked by Lane C's files: no error is thrown from
`src/extensions/features/inline-editing.ts`, `src/view/styles.ts`, `src/view/core-commands.ts` or
`src/api/command.ts`. `UnknownCommandError` is thrown from `src/extensions/commands.ts`, which is not
one of the four.

## 3. Untouched, as instructed

- `src/data/entry-reader.ts:376-378` — #232 / D-S5-49, after C4. Not started.
- `plans/s5-extensibility-and-editing/README.md` — one row added, D-S5-50, nothing else.

## 4. `harness/main.ts` — the standing review

Read in full at each commit. Nothing new. Two workarounds are there, both already recorded, neither
tidied:

- The `window.__dataset` double cast through `unknown`. Its own comment records it against #226:
  `Dataset<TFields>` gives no common type two differently-fielded instances both satisfy.
- Nothing else. `rowHeight`, the hand-built `TimeScaleModel` and `--fg-grid-pane-width` are all gone;
  `gridWidth: 'fitColumns'` is in place with the #157 comment on it.

**One observation, not a workaround, worth an issue.** `harness/plugins/lock-entries.ts`'s extender
writes `{ start, end }` for a locked Entry. On an Entry that draws several Segments that write is
refused (`SegmentsOutOfSyncError`, `'ambiguous'`) — it is exactly the write `moveEntryTo` exists to
replace. The demo dataset does not currently lock a several-Segment Entry, so it does not fire. C4's
scope was the type name, so the write was left alone rather than rewritten to `moveEntryTo`. It is
the natural first consumer of `moveEntryTo` and would be a good demonstration.
