# Handoff — fix the s5-231 branch-review findings

Written 2026-09-06 by session `upper-crab-df`. The next agent starts cold and works from this file.

## Goal

Fix findings F1–F5 of `plans/reviews/2026-09-06-s5-231-snap-inverted-span-discard.html`. F6 needs no
work of its own. F7 is a question for the repo owner, not a task.

## State when this was written

- The review branch `s5-231` **is merged**. `s5-start` is at `8f841ce` and pushed to `origin`.
- `pnpm verify` is green on that commit: typecheck, lint, boundaries (291 modules, 0 violations),
  1,619 tests (692 node, 927 dom), guards, `format:check`, e2e, `api-report`.
- **No finding is fixed.** The review changed no source. Every fix below is unstarted.
- Every claim in the findings was re-verified against the source at `8f841ce` before this handoff was
  written. The line numbers below are good at that commit. Re-check them after you rebase.

## Ground rules

Read `CLAUDE.md` first. Four of its rules decide these fixes:

- **The stop rule.** Harness code that compensates for the library is an API gap. Deleting the
  workaround is part of the fix, never a tidy-up. F5 is exactly this.
- **One meaning per word.** F1 is a one-word-two-meanings fault, and that is why it is high.
- **Name the job, not the pipeline.** `runDiscardCommand` fails this; see F2.
- **Read the call site aloud** before you settle any name.

Two more, from this branch's history:

- **A decision id is often reserved in an issue comment before it lands in the tree.** The documented
  grep over `plans/` cannot see a reservation. Ask the other active sessions before you mint one.
  As of 2026-09-06: D-S5-46 and D-S5-47 landed; **48 is reserved for #142, 49 for #232**;
  D-S5-43 is retired and must never be reused.
- **`pnpm api-report` compares against `dist/`.** Run `pnpm build` first or it fails spuriously.
  `pnpm verify` does both in the right order.

## Do these in this order

Order matters once: F2 deletes the port that F3 also touches. Do F2 before F3.

---

### F1 (high) — split the notice off `data-reason` and `.fg-cell-editor`

**Why it is first.** It is the only finding that silently breaks a seam the library documented to
consumers, and the only one that gets expensive to retract.

**The fault.** Before this branch, `data-reason` meant one thing: a `REFUSAL_TEXT` key, which is also
the kebab-case code of the `Error` report the plugin raises, and which always has user-visible words.
#160 now stamps the same attribute with `CellEditorCommitRefusal` — `'unreadable-value'` and
`'refused-write'` — which have no `REFUSAL_TEXT` entry, raise no report, and carry no words. One
attribute, two disjoint vocabularies.

**What it breaks for a consumer.** `src/extensions/features/inline-editing.ts:429-430` still tells a
consumer that `view/styles.ts` styles `.fg-cell-editor[data-state='invalid'][data-reason]` "so a
consumer stylesheet can still win". It no longer does — `src/view/styles.ts:298` is now
`…[data-reason]:not(:has(.fg-cell-editor-control))`. A consumer who followed that documented advice
and wrote the old selector paints the **live** editor with the notice's `pointer-events: none`. The
invalid editor becomes unclickable, including its new discard button.

**The smell that names the fix.** `src/extensions/features/inline-editing.test.ts:145-149` had to
learn the identical `:not(:has(…))` trick. When a stylesheet and a test both need the same structural
workaround to tell two things apart, the two things want different names, not a cleverer selector.

**Fix.** Give the notice its own class — `fg-cell-notice` — and keep `.fg-cell-editor` for things
that hold a control. Both `:not(:has(…))` sites and the stale doc sentence then delete themselves.
If the shared class must stay, stamp the commit refusal on a second attribute
(`data-commit-refusal`) so `data-reason` keeps answering exactly one question.

**Sites.** `inline-editing.ts:367` (invalid editor stamps it), `:444` (notice stamps it),
`:143-148` (`CellEditorCommitRefusal`), `:127-133` (`REFUSAL_TEXT`), `:429-430` (the stale doc);
`src/view/styles.ts:290-298`; `inline-editing.test.ts:145-149`.

**Done when.** No `:not(:has(…))` remains in either the stylesheet or the test helper; the doc
sentence names the selector that actually ships; a consumer stylesheet written against the documented
selector cannot reach a live editor.

---

### F2 (high) — one road for discard, and a decision record to correct

**The fault.** Escape and the discard button take two different roads to one job:

- Escape: `inline-editing.ts:274` — `bindEscape(() => this.#ports.requestDiscard())` → `editing.discard()` directly.
- Button: `:388` — `runDiscardCommand()` → `ctx.commands.run('freegantt.discardCellEdit')`.

Two ports (`:217` `requestDiscard`, `:222` `runDiscardCommand`) for one job.

**The false comment.** `:219-222` states that D-S5-26 "puts one command behind both". `:215` calls
`requestDiscard` "the same 'one implementation, two entry points' shape". Both are true of the button
and false of Escape. A consumer who overrides `freegantt.discardCellEdit` — to also clear their own
side-panel form, say — gets the override on click and not on Escape. Two behaviours from one gesture
pair, with nothing in the API saying so.

**This is not only a comment.** The same claim was relayed into the **D-S5-47 decision record** on
`s5-start`. Correcting the record is part of this fix, not a follow-up. The decision index is owned by
another session — coordinate before you edit `plans/s5-extensibility-and-editing/README.md`.

**Fix.** Bind Escape through the command too, and delete `requestDiscard`. One port,
`runDiscardCommand`, becomes the only road; D-S5-26's principle becomes true rather than claimed; the
comment stops needing a caveat.

**Check first.** Whether Escape must still close a *valid* editor when the command's `when` declines.
It should not — `when` is `editing.editor !== undefined`, which covers both states. Verify rather
than assume; there are DOM tests on the Escape path.

**Naming.** `runDiscardCommand` is a **reject** — it names the pipe (the command registry), not the
job. It disappears with this fix. If both ports somehow must stay, the job's name is `discardEdit`.

**Sites.** `inline-editing.ts:200`, `:212-222`, `:274`, `:388`, `:597-603`, `:617-629`.

**Done when.** One port; Escape and the button both run the command; the `:212-222` comment describes
what the code does; the D-S5-47 record no longer claims the false thing.

---

### F3 (medium) — delete the dead port behind `when: () => false`

**The fault.** `src/view/core-commands.ts:150-156` registers the placeholder with
`when: () => false` and `run: () => ports.discardCellEdit()`. `CommandRegistry.run` returns before
`command.run(ctx)` whenever `when` declines (`src/extensions/commands.ts:63`), and this `when` is a
constant. So `ports.discardCellEdit` can never be called. `src/view/core-commands.test.ts:162-169`
asserts exactly that — it proves the port is dead rather than proving behaviour.

Four artifacts across three files service a call site that cannot be reached, and `CoreCommandPorts`
grows a member every future reader must trace before learning it does nothing.

**Keep the registration.** Its purpose is sound: without it,
`gantt.commands.run('freegantt.discardCellEdit')` throws `UnknownCommandError` on a Gantt with no
`inlineEditing()`. Only the plumbing is surplus.

**Fix.** `run: () => {}` inline at `core-commands.ts:155`. Delete the port (`:45-49`), the shell
implementation (`src/view/gantt-shell.ts:1281-1283`), and the port half of the test. Keep the
registration and its comment — those carry the design. Keep the test's first assertion (the id never
appears in `available()`); the second goes with the port.

**Warning.** `src/view/gantt-shell.ts` is the most contended file on this branch. Check with the
other sessions before you edit it.

---

### F4 (medium) — give `InvertedSpanError` a structural constructor

**The fault, four ways.** `src/model/errors.ts:186-191` takes a bare `message: string`.

1. **Wrong caller.** `src/data/entry-reader.ts:218` says `entries.update: "t1" would end before it
   starts`. It is thrown from `reconcileEnvelope`, which `reconcileExtenderEdits` also calls — the
   branch's own test `entry-reader.test.ts:479-493` ("refuses an inverted cascade against a
   sole-Segment Entry") proves it. A plugin author whose `EditExtender` cascade is wrong is told
   `entries.update` failed, a call they never made, and looks in the wrong place.
2. **Wrong subject.** That same line sits inside `for (const segment of next.segments)` yet names the
   entry. Its sibling at `:61` names the segment. One fault, two spellings, neither naming both.
3. **An id the author has never seen.** `:61` reports `segment.id`, which for a segment written
   without an id is whatever `context.mintSegmentId()` just minted. Feed it
   `{ id: 't1', segments: [{ start: '2026-09-05', end: '2026-09-01' }] }` and the message names a
   synthetic id and omits `t1` — the one identifier the consumer wrote and can search for.
4. **No values, no members.** No message states the two instants. Nothing is exposed, so
   `catch (e) { if (e instanceof InvertedSpanError) highlight(e.entryId) }` is impossible.

**The model to copy is one file over.** `InvalidSnapIncrementError` (`errors.ts:35-48`), born in this
same branch, prints the offending value and exposes `.unit`/`.increment`. Two errors, one branch, two
shapes.

**Fix.** `constructor(entryId, span, segmentId?)`. Build the message from those — name the entry and,
when it applies, the segment, and print both instants. Expose all three as readonly members. Then drop
the caller name from the text, or pass it, so a cascade is not told it was an `entries.update`.

**The owner's error rule applies.** An error says what *distinguishes*, not just that something is
wrong. A consumer bulk-loading 500 rows whose date parsing shifted a timezone currently gets
`entries: "t1" would end before it starts` — no start, no end, no way to see that the two are one hour
apart in the wrong direction.

**Do not touch this.** `end < start` is refused; `end === start` is **legal** and must stay legal
(D-S5-46). That asymmetry is load-bearing: a `rollUpKinds` entry with no dates gets a zero-length span
until the Rollup runs, and `gesture-draft.ts`'s `resizeEdit` clamp produces a zero-length span as its
way of refusing inversion (D-S3-4). A future reader will be tempted to "tidy" `<` into `<=`. That
breaks both at once.

**Sites.** `src/model/errors.ts:186-191`; `src/data/entry-reader.ts:61`, `:129`, `:218`;
`src/data/entry-reader.test.ts:479-493`.

---

### F5 (medium) — snap's second door, and the harness picker that uses it

**The fault.** #201's promise, in `errors.ts:29-32`, is that "the mistake names the assignment rather
than the drag two gestures later". That holds for `gantt.snap = …` (guarded at
`src/view/gantt-shell.ts:1188-1197`) and not for `gantt.preset = { ...gantt.preset, snap }`, which
reaches `#viewport.preset.snap` unchecked. The `time/` guard (`src/time/snap.ts:15-19`) still stops
the hang, so this is not a freeze — it is the deferred-error experience #201 set out to delete,
surviving on the second door.

**The harness proves it.** `harness/editing.ts:140-147` — the function #201 rewrote — sets snap
through `gantt.preset`. `src/api/gantt.ts:447-448` documents that exact spelling as "the old spelling"
which "built a one-off copy of a shipped preset, and the next `zoomIn()` threw the snap away with it."
So in `harness/editing.html`: pick Snap = day, zoom, and the choice is gone. The other picker,
`harness/gantt-toolbar.ts:245`, uses `gantt.snap`.

**Fix, two parts.**

1. **Harness (small, certain).** Move `harness/editing.ts`'s `applySnapChoice` to `gantt.snap = …`,
   matching `gantt-toolbar.ts`. Two harness pickers must not use two doors, one of which the library
   documents as wrong.
2. **Library (needs a call).** Decide whether `set preset` should validate a concrete `snap` the same
   way `set snap` does. The reviewer leans yes: a `ViewPreset` is public input, and CLAUDE.md says
   input is loose on every way in, with the library doing the validating. **Ask the repo owner
   before building this half** — it is a behaviour change on a public setter.

**Second-order, worth folding in.** The two pickers disagree on an unrecognised value:
`harness/editing.ts:145` returns and silently changes nothing; `harness/gantt-toolbar.ts:218` silently
substitutes `'tick'`. Both guard a `<select>` whose options the harness writes, so neither can fire —
but they are two policies for one job in code the library holds up as its worked example.

---

### F6 (low) — no work

`EntryEdits` and `StoredEdits` both ship `@public` and both resolve to
`ReadonlyMap<EntryId, StoredEdit>`; they meet in one signature pair, and `EntryEdits` has no doc. This
is C1 scaffolding. **#209 C3 flips `EntryEdits` to the loose write shape and this resolves itself.**
Nothing to do here — but **C3 must land before this reaches a consumer.**

### F7 (low, unsure) — a question, not a task

`src/api/command.ts:115-118` says omitting `ctx` makes "the registry build the same live context
`run(id)` already builds internally." True of `CommandRegistry`, which holds a `#buildContext` its
constructor was given. `CommandRegistryOf` is public, so anyone else implementing it must invent a
context builder to satisfy a clause written from one implementation's internals.

Whether `CommandRegistryOf` is meant as an implementable contract, or only as the shape of the thing
core hands out, decides whether this matters at all. **Repo owner's call. Do not build either way.**

## Out of scope

- **#209 C3 and C4.** Unbuilt by ruling; a separate handoff covers them. Do not start them here.
- **#143's drag path.** The owner reports that dragging past start still lands end one minute before
  start. The guards that landed are on the **mutation** boundary; `gesture-draft.ts`'s `resizeEdit`
  clamp was out of scope by D-S3-4 and was never touched. This is real and open, but it is its own
  investigation — do not fold it into F4.
- **`#142`, `#208`, `#210`, `#232`.** Held by other sessions or awaiting decisions.
- **Sentence-length findings in files outside `SCOPED_FILES`.** The scope of
  `scripts/check-sentence-length.mjs` is deliberate and documented in its header (lines 9-19): 679
  known over-ceiling sentences across `src/`, tracked as #163 loose end (a). Do not file an issue
  about it. If your change lands substantial new prose in a file, run the sentence pass over that file
  and add its path to `SCOPED_FILES` — that is the intended way the scope grows.

## Completion test

`pnpm verify` green — typecheck, lint, boundaries at 0 violations, node + dom suites, guards,
`format:check`, e2e, `api-report`. Then:

- **Review `harness/main.ts` even though you did not change it.** CLAUDE.md makes this a standing
  duty on every commit. Code there that re-derives what the library computes is an API gap.
- New tests for F1 (a consumer selector cannot reach a live editor), F2 (overriding the command
  changes Escape *and* the button), F4 (the message names the entry, the segment when it applies, and
  both instants; the members are readable).
- Report each finding as fixed, deferred with a reason, or refused with a reason. A finding you
  disagree with is a finding you argue against in the report — not one you drop.

## Issue hygiene, when the work lands

`#160` and `#201` carry `fixed needs review` and are closed, and both now carry a correction comment
naming these findings. When a fix lands, comment on the issue with the **work commit hash and the
merge commit that carried it to `s5-start`** — the earlier comments on this branch all named hashes
that three rebases had already destroyed, which is what made the record useless. Use the
`label-issues` skill.

## Files most likely to fight you

| File | Why |
|---|---|
| `src/view/gantt-shell.ts` | Most contended on the branch. Prefer `src/view/core-commands.ts`. |
| `src/data/entry-reader.ts` | Another session holds `:376-378` for #232. |
| `plans/s5-extensibility-and-editing/README.md` | The decision index. Another session owns it. |

Run `git log --oneline -5 s5-start` and check with the other sessions before you start.
