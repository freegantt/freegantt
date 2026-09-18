# The authored record is an Entry, not a Task

> **Vocabulary note.** The text below is preserved as written and says `Project` throughout (`new Project({ tasks })`, `Project.tasks` → `Project.entries`). That wrapper was renamed to `Dataset` by [ADR 0004](./0004-the-authored-body-of-data-is-a-dataset-not-a-project.md) — read every `Project` here as `Dataset`.

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item` below as `Bar`. **Do not rewrite the body.**

ADR 0002 moved scheduling out of the mandatory core and behind a plugin seam, but the *vocabulary* of the core stayed where it was: the one authored, DOM-free record every layer is built on was called `Task`, and its default `kind` literal was the string `'task'`. That word carries a methodology whether or not a scheduling plugin is installed — a `Task` is to-do work, it belongs to somebody, it gets done. We renamed the record to `Entry` and the default kind to `'span'`, so that nothing in the mandatory core names an assumption about what the data means.

## Why the name was actually costing us

Not a style preference. Three concrete costs, in order of how much they hurt:

- **It kept re-importing the assumption ADR 0002 removed.** Every contributor — human and agent — who read `Task` reasoned about scheduling and reintroduced it in places it does not belong: scheduling concepts in `layout/`, dependency assumptions in `render/`, "when does this get scheduled" questions about `data/`. The boundary was drawn in the layer diagram and then talked back out of existence by the noun sitting in the middle of it. This happened repeatedly, and correcting it case by case never held, because the vocabulary regenerated the mistake.
- **It mistranslated the library for its own users.** A host charting units sold per day, machine uptime, room bookings, or headcount per week has no tasks at all. `new Project({ tasks })` forces them to mentally translate the entire public API on every read, and tells them — wrongly — that they are holding the wrong tool.
- **It was about to get expensive.** Pre-S2, `data/` and `scheduling/` are still stubs and nothing is persisted, so the rename is a mechanical sweep. Once transactions, undo, and the serialization contract (D7) are built on the old name, it stops being one.

## What "Entry" buys, and what it gives up

`Entry` is the ledger word: a dated line in a record, with no claim about what put it there. It reads correctly in every domain we tested it against — "a sales Entry", "a shift Entry", "a maintenance Entry", and still "a task, stored as an Entry". It collides with nothing already reserved in `CONTEXT.md` (`Item`, `Row`, `Segment`, `Bar`, `Lane` are all spoken for), and it is short enough to live in `EntryId` / `EntryKind` / `entryId()` without ceremony.

What it gives up is instant familiarity: every competing library calls this thing a task, so a newcomer arriving from one of those has one word to learn. We took that trade deliberately — the cost is one glossary lookup, paid once; the cost of `Task` was paid on every review.

## The default kind is `'span'`, not `'entry'`

A kind literal is *data*, not just a type name, so it survives into every authored record and every serialized project. Renaming the type to `EntryKind` while leaving `kind ?? 'task'` in place would have left the retired word in the data itself, which is precisely the ambiguity this ADR exists to close. `'entry'` was rejected as tautological (an Entry of kind `entry` says nothing); `'bar'` was rejected because `CONTEXT.md` reserves Bar as a rendering detail, not an identity. `'span'` says the one true thing about the default kind — it occupies a stretch of time — and contrasts cleanly with `'group'` and `'milestone'`, which keep their names.

`'milestone'` is left alone for now: it names a rendering and scheduling shape (a zero-duration marker) rather than a kind of work, and it is what every consumer already expects to type. If it proves to carry the same problem, it is a one-line change to a kind literal, not another sweep.

## Consequences

- `Task` → `Entry`, `TaskId` → `EntryId`, `TaskKind` → `EntryKind`, `taskId()` → `entryId()`, `Item.taskId` → `Item.entryId`, `Project.tasks` → `Project.entries`, `src/model/task.ts` → `src/model/entry.ts`, and the event pairs `beforeTaskMove`/`taskMove` → `beforeEntryMove`/`entryMove` (likewise Resize/Edit). `Row.kind`'s `'task'` member becomes `'entry'` — a Row derived from one Entry — which is a different axis from `EntryKind` and keeps its own vocabulary.
- The public API is pre-1.0 and has no released consumers, so this ships as a rename with no deprecation alias. An alias would have kept the retired word greppable and reachable, which defeats the purpose.
- `plans/00`–`04`, `CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/01`–`03` and the open issues were swept in the same change. ADR 0001 and ADR 0002 keep their original wording as historical records, with a pointer to this ADR.
- The scheduling plugin operates on Entries like everything else. "Task" does not come back as plugin-local vocabulary: a scheduling plugin schedules Entries.
