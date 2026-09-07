# The change record is a ChangeSet, not a Transaction or a Commit

S2 introduces the record of everything one transaction changed — `{ added, removed, updated }` with `from`/`to` per field — as the payload of `dataset.on('change')` and `beforeChange`, the input to undo and redo, and the contract a future sync adapter reads (`plans/s2-data-core` D-S2-7, D-S2-11). It is the widest new public type in the slice, and the slice that first freezes the `api-report` baseline (D-S2-19), so its name is expensive to change afterwards.

Two better-sounding names were proposed for it during the S2 review: `Transaction` and `Commit`. Both are better words than `ChangeSet` in isolation. Neither is available. Each already names a different concept in this codebase, and in `Commit`'s case the obvious fix — renaming the incumbent to free the word — destroys the reason the word was wanted.

## Why the question keeps coming back

It is not a bad instinct, and this ADR exists because it has now been raised three times in one session. `ChangeSet` is a Mercurial-flavoured word for a thing that reads, in most of its call sites, like a database record. It reads worst exactly where a reader spends the most time thinking about it — the undo stack:

```ts
history.record(commit);        // "record the commit"                  — better
dataset.apply(commit);         // "apply the commit"                   — better
history.record(changeSet);     // "record the change set"              — stiffer
```

Both proposals were correct that `Commit` wins the call-site reading (naming check 2) at the history and `apply` sites. They lose on checks 3 and 4 — the search test, and one meaning per word.

## The three words, and what each already does

| Word | Already names | Where |
|---|---|---|
| **Transaction** | the *scope* you open — nests, buffers into a write set, read-your-own-writes | `dataset.transaction(fn)`, `src/data/transaction.ts`, D-S2-8, D-S2-21 |
| **Commit** | the *act* and the *path* — including S1.8's `gridWidth` flow, which produces no change record at all | ~247 uses across specs, 25 in `src/`; `plans/s1.8` §3.3, `plans/02` §2 and §3 |
| **ChangeSet** | the *record* of what one transaction changed | the payload |

## Why `Transaction` is not available

The scope and the record are not one-to-one, in three directions the spec had already settled before the rename was proposed:

- An **empty transaction commits nothing** — no changeset, no event, no undo entry (D-S2-8). One transaction, zero records.
- A **nested transaction joins the outer one** (D-S2-8). Three transactions, one record.
- **`beforeChange` fires on the built changeset, before the store write** (D-S2-25). The record exists while it is being refused, and a refusal means no transaction ever completed. Under one name, the veto handler receives "a Transaction" that will never be one.

`transaction()` also returns the body's own return value, never the record (D-S2-8) — so under the rename, `dataset.transaction()` would be the one method that does not return a `Transaction`.

The glossary already writes the distinction into its own definitions, which is the shortest proof that both words are load-bearing: **Transaction** is *"a batch of proposed edits that runs the extension hook once and commits as one ChangeSet."* That sentence is unwritable if the two share a name.

## Why `Commit` is not available

`commit` in this codebase names the act, not the record, and it does so **outside the data core**. S1.8's pane splitter runs a *"commit sequence"* (`plans/s1.8` §3.3, `plans/02` §2 and §3) to change `gridWidth`. That flow is shipped, gate-green, and produces no change record whatsoever. Give the record that name and the load-bearing sentence of D-S2-24 — *"The commit path does not push onto the history"* — becomes a sentence about Commits not being pushed onto a history composed entirely of Commits.

D-S2-25 had already ruled on the adjacent case from the other direction, rejecting `beforeCommit` as an event name because *"the notification half of the pair is `change`, and one concept does not get two names."* Naming the payload `Commit` re-opens that from the other end, as `on('change', ({ commit }) => …)`.

## The trap: freeing the word destroys it

The natural repair is to rename the incumbent — call the act something else and let the record have `Commit`. It does not work, and the reason is worth stating because it is not obvious:

**`Commit` reads well only because the reader knows a transaction commits.** The noun is good precisely as the nominalization of the verb. Rename the verb to `settle`, `finalize` or `land`, and `Commit` becomes as arbitrary as `ChangeSet` — the full cost paid, none of the benefit kept. "A transaction settles, producing a Commit" is worse than either state we could have had.

Three further costs, had the trap not been fatal on its own:

- **D-S2-21 forbids it directly.** That decision grounds the design in prior art — Yjs's `doc.transact()`, Immer/Mutative drafts, TanStack DB's optimistic mutations — and states: *"Nothing here is invented, and the vocabulary should not read as though it were."* "Transaction … commits" is the most standard verb pairing in transactional programming.
- **It reaches into a shipped slice for a reason that originates in a later one.** S1.8's commit sequence would be renamed so that S2's payload could have a word.
- **A third grammatical form goes with it.** `all` is *"committed-only"* and returns *"the committed array"* (D-S2-3, D-S2-21). That adjective is what distinguishes `all` from `get`/`has` inside a transaction body. "The settled array" says nothing.

## The strongest surviving form, and why it also stops

This project once nominalized verbs into types this way — `schedule()` → `ScheduleResult`, the extension hook → `EditAdjustment` — and both were later retired: `ScheduleResult` existed only in prose and never had a `src/` type to protect; `EditAdjustment` was replaced by `EntryEdits`, the same shape a caller's own edit already takes, precisely because a wrapped return value was ceremony the extender did not need. So a commit-family noun invented on this pattern would not be extending a live convention — it would be starting one fresh, on the two examples that did not survive contact with a real API. The retirement itself proves the point that matters here: had either survived, the pattern would still give the noun a **distinct surface form** — a `Result`, an `Adjustment` — never the bare verb. Applied consistently it yields `CommitRecord`, and then `history.record(commitRecord)` stutters at the exact call site that motivated the exercise. The pattern that would make the name legitimate is the pattern that kills it.

## What `ChangeSet` gives up

It is not a lovely word, and this ADR does not claim otherwise. It is Mercurial vocabulary in a library with no version control in it, and it reads stiffly on the undo stack. What it buys is that it is the only one of the three doing exactly one job, and that it pairs with the events that carry it: the `change` event carries the `changeSet`, and `beforeChange` refuses one. That is the greppable pair `plans/02` §3's naming rule asks for, in one word family.

The residual stiffness is a **prose** problem, not a type problem. The undo stack really is `ChangeSet[]` plus a cursor; there is no third concept there wanting a name. (`HistoryEntry` was considered and rejected on the same check that decided this ADR — `Entry` is this domain's most loaded word, per ADR 0003.) Where the phrasing grates in a user-facing string — the harness's changeset log panel, `[S2-A4]` — that is display text and may read however it reads best.

## Consequences

- `ChangeSet`, `ChangeSetId`, `changeSetId()` and `ChangeOrigin` keep their names. No rename lands in S2, and the `api-report` baseline (D-S2-19) freezes them as they are.
- `CONTEXT.md`'s **ChangeSet** entry gains `Transaction` and `Commit` to its `_Avoid_` list, beside the existing `Diff, patch`, each with the one-word reason: Transaction is the scope, Commit is the act.
- `CONTEXT.md`'s **Transaction** entry keeps defining itself as committing *as one ChangeSet*. That sentence is the distinction, and it stays.
- `commit` remains the verb for what a transaction does, and *"the commit path"* / *"the commit sequence"* remain the names of the code paths — in `data/` and in S1.8's `GanttShell` alike.
- A **type** may say `Commit` when it names that act or that moment, and never when it names the record. `CellEditorCommitRefusal` (`extensions/features/inline-editing.ts`) is the standing example: it answers why one commit left the cell editor invalid. This ADR reserves the word for the act; it does not retire the word. A 2026-09-06 branch review read it the second way and re-raised that name, so the rule is written here.
- No S2 spec file changes. This ADR is the record; `plans/s2-data-core/README.md` §2 is not amended, because no decision it states has moved.
- If a future slice does rename the payload, it supersedes this ADR rather than editing it, and it inherits the burden of answering the trap above: what happens to the verb.
