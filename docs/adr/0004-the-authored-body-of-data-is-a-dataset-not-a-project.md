# The authored body of data is a Dataset, not a Project

ADR 0003 retired `Task` because the word carried a methodology into a core that claims not to assume one. `Project` had the same problem one level up: it's the class that wraps a host's entries plus the settings that give them meaning (above all the IANA zone), and "project" reads as project-management vocabulary the instant a host isn't running one — a shift roster, a room-booking calendar, or a machine-uptime chart has no project, the same way it has no tasks. We renamed the class (and everything derived from its name) to `Dataset`.

## Why now, and why this word

CONTEXT.md's own glossary entry for `Project` already listed `dataset` under `_Avoid_`, unexplained. Revisited on its merits: `dataset` reads as passive, read-only, analytics-flavored — closer to "a CSV you loaded" than to something that owns a timezone, runs transactions, and drives undo/redo. That's a real objection, not a style nit.

It's outweighed by two things. First, a survey of adjacent libraries: the ones that keep PM-flavored vocabulary (a top-level `ProjectModel` with task/resource/dependency stores, in the fullest PM-oriented Gantt libraries) are ones where project management *is* the product, so the vocabulary is earned, not incidental. The one genuinely domain-neutral peer surveyed — a general-purpose timeline library with no `Task` concept, just items and groups over time — calls its container `DataSet`. Among libraries that actually avoid PM vocabulary the way this one does, `Dataset`-shaped naming is the real convention, not an oddity.

Second, the "passive" objection assumes the noun has to carry the "owns settings, mutates, drives undo" identity on its own. It doesn't — the verbs do: `dataset.transaction(...)`, `dataset.entries.add(...)`, `dataset.on('change', ...)` (`plans/02` §2, §6) read as an owned, live thing regardless of what the container is called, the same way `Array` is a fine name for something with `.push()` on it.

## Considered options

- **Keep `Project`.** Rejected for the reason above: it's the same category of leak ADR 0003 closed for `Task`, just one layer up — a host with no project has to translate the whole public API on every read.
- **`Ledger` / `Journal`.** Echoes `Entry`'s own definition ("the accountant's word... a dated line in a ledger"), and stays domain-neutral. Rejected only because it's less familiar than `Dataset` to a newcomer skimming the API, and the accounting metaphor, while accurate, isn't load-bearing enough to prefer over the more immediately legible option.
- **`DataSource`.** Considered and initially preferred in discussion; set aside in favor of `Dataset` largely on the strength of the vis-timeline precedent and because "source" implies something upstream feeding the object, which isn't the shape here — the object *is* the data, not a pointer to it elsewhere.
- **`Board`, `Sheet`, `Registry`, `State`, `Docket`, `Roster`.** Each rejected for importing its own wrong connotation — `Board` reads Kanban, `Sheet`/`Registry` undersell the owned-settings-and-mutation identity the same way `dataset` was first suspected of doing, `State` is too generic and collides with `TimeScaleModel`/`ScrollModel` also being "state," `Docket`/`Roster` skew toward specific domains (legal, staffing) that are no more privileged than any other host use case.

## Consequences

- `Project` → `Dataset`, `ProjectOptions` → `DatasetOptions`, `src/api/project.ts` → `src/api/dataset.ts`, `GanttOptions.project` → `GanttOptions.dataset`, `ProjectLike` (`view/gantt-shell.ts`) → `DatasetLike` → moved to `src/model/dataset.ts` and renamed `Dataset` (S1.7 §3.2 — `layout/` needs the shape for `Viewport.bind` and may not import `view/`). Design-only names not yet in `src/` follow the same rename: `ProjectData` → `DatasetData`, `ProjectApi` → `DatasetApi`, `ProjectPlugin` → `DatasetPlugin` (ADR 0002's consequences, issue #15).
- `TimeScaleIntent.range`'s `'fitProject'` literal → `'fitDataset'` — it's data (a discriminant string), not just a type name, so it gets the same treatment ADR 0003 gave the `'task'` kind literal.
- No deprecation alias: pre-1.0, no released consumers, same policy ADR 0003 set.
- `docs/adr/0002` and `0003` keep their original wording as historical records (0003 illustrates the old `Project` API in passing) with a pointer note added at the top of each, rather than being rewritten in place.
- `CONTEXT.md`'s `_Avoid_` list for `Entry` and the codebase generally: `Project` becomes the retired word here, the way `Task` is retired for `Entry`. `dataset` is removed from anyone's avoid-list — it's now the concept's own name.
