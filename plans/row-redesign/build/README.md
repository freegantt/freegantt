# The row redesign — the build plan

Four ADRs give one row one object. None is built. This folder is the work.

**Read this file once. Then read one build file and work from it.** Do not read the other three.

---

## Hard rules

1. **Read the ADR that governs your build.** It holds every decision. Never re-derive one.
2. **Tick each box as you finish it. Do not save the ticks for the end.** A build that stops halfway must show where it stopped. A reviewer reads the boxes, not the diff.
3. **`pnpm verify:full` is the gate, and its last line is the answer.** Capture it with a redirect, never a pipe:
   ```bash
   pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log
   ```
   Report the verdict line. Never report `EXIT: $?`. A run with no verdict line is unproven.
4. **Each build lands as one change.** Do not stage a rename behind the old interface. This library has never shipped.
5. **Rename with `pk-rename-symbol`, then `pnpm typecheck`.** It renames through the language service, so it follows re-exports and aliases and skips prose (`CLAUDE.md`, `.claude/skills/pk-rename-symbol/SKILL.md`). A same-named string in a comment or a doc is a separate decision. **Build 1 has one rename that stays green while its meaning inverts — its file says so.**
6. **A line number here is a hint, not a fact.** Every number was measured against `f61e1a5` on 2026-09-11. Open the file.
7. **Never work around a gap in `src/` from `harness/`.** Stop. Report the gap. Ask the author whether core closes it first. This is `CLAUDE.md`'s stop rule.
8. **Review `harness/main.ts` on every commit, changed or not.** `CLAUDE.md` requires it.
9. **Edit `plans/**` freely, then report it.** `.claude/hooks/protect-spec.sh` warns and exits 0. That warning is not a stop sign. Two arms still block: a new runtime dependency, and a loosened `eslint.config.js` or `.dependency-cruiser.cjs`.
10. **Work you defer goes in the receiving build's file**, with its gate assertion. A defer nobody receives is a deletion.
11. **Log every question and every judgement call in [`../BUILD-LOG.md`](../BUILD-LOG.md)**, the moment it comes up. A call you made alone gets a **J** entry, so a reviewer can reverse it. A question for the author gets a **Q** entry.
12. **Read the refuted lists before you propose an alternative.** Nine in [`../README.md`](../README.md), fourteen in [`../../field-redesign/shared/refuted.md`](../../field-redesign/shared/refuted.md). **Both lists start at 1, so a bare "refuted item 3" names two different refusals.** Every citation says which file: *refuted item 3 in `field-redesign/shared/refuted.md`*, or *refuted item 3 in `row-redesign/README.md`*. Write yours the same way.

---

## Landing order

The order is fixed. Each ADR states it in its own "Lands after" line.

```
0017  →  0018  →  0019  →  0020
```

| Build | ADR | The job | File |
|---|---|---|---|
| 1 | 0017 | The Entry answers questions about itself | [`build-1-0017-the-entry.md`](build-1-0017-the-entry.md) |
| 2 | 0018 | A variant is a rule, not an id list | [`build-2-0018-variants.md`](build-2-0018-variants.md) |
| 3 | 0019 | One plugin, one install site | [`build-3-0019-install-site.md`](build-3-0019-install-site.md) |
| 4 | 0020 | A plugin may own the hierarchy | [`build-4-0020-hierarchy.md`](build-4-0020-hierarchy.md) |

**0017 lands first.** A variant rule, a capability predicate and a hierarchy source all read questions off the row. None can be written until the row answers them. Change the order only with a stated reason.

---

## What the end state is

- **One row is one object.** `Entry` answers questions about now. `StoredEntry` carries the stored values. A read seam takes an `Entry`; the edit pipeline carries `StoredEntry`.
- **`entries.fieldValue` and `entries.childrenOf` go.** The doors move onto the row: `entry.read(key)`, `entry.children()`, `entry.hasChildren`.
- **A variant is a rule.** Four registrations become one `EntryVariant` object — `variants` on the `Gantt`, `ctx.variants.add` in a plugin. Nothing stores a variant. `EntryLook` is deleted, and a variant name is a `string`.
- **A plugin has one install site.** `definePlugin({ data, view })` replaces the `GanttPlugin` / `DatasetPlugin` pair.
- **A data plugin may own the tree.** A `HierarchySource` states one parent per Entry, and core inverts it.

---

## What is still open

**Nothing is open. Every question closed on 2026-09-11.** If you find a new one, file a **Q** in [`../BUILD-LOG.md`](../BUILD-LOG.md) the moment it comes up, and **check that one does not already exist** — add to it rather than opening a second.

**`Q2` is answered and deferred.** The renderer contexts do not become generic over `TProps` in this redesign. It settles on [#284](https://github.com/Pawel-IT/FreeGantt/issues/284) after Build 4. Build 1 leaves `harness/planner.ts:104,114,116` exactly as they are — that is the evidence, and tidying it hides the gap.

**Seven things were ruled on 2026-09-11. Do not re-open one.**

- All three Field-read doors leave the **row** surface — `entries.fieldValue`, `FieldContext.read(entry, key)` and `FieldContext.durationOf(entry)` — into `entry.read(key)` and `entry.duration()` (`Q1`).
- **The read binds to the pass.** A seam that holds a row the store does not hold — the Rollup, the ChangeSet, every `compute` Field — carries `StoredEntry` values and asks the pass, not the row: `ctx.read(key)`, `ctx.duration()` and `ctx.children()`, none of them taking an entry (`Q7`, corrected by `J5`). `RollUpContext` adds `values(key?)`, `numericValues(key?)` and `durations()`. This closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).
- **Three contexts, three lifetimes**: `FieldContext` is `{ timeZone }` per Dataset, `ComputeContext` is per pass, `FormatContext` stays per column resolve (`J5`). `parseValue` takes the live `Entry` as a third argument.
- A segmented Entry's duration is an option on the `Dataset`: **`measureDuration: 'span' | 'segments'`**, default `'span'` (`Q6`, and the key name in `J12`). **Build 1 writes it.**
- A `data` plugin handed to a `Gantt` raises `PluginSetupError`, and the message says where to install it. No new error type ships (`Q4`). **The type refuses the combination first** (`J8`).
- The hierarchy seam is the **hierarchy source**, set through `ctx.hierarchy.setSource`, beside `ctx.edits.setExtender` on the `data` half (`Q3`, `J7`).
- **Setup order comes from `requires`, and no build adds an ordering knob.** D-S5-31 ruled this on 2026-09-01: the host topologically sorts the installed set before any `setup` runs. Siblings must not depend on load order.
- **The newest rule wins a double claim** (`Q5`). Build 2 flips `claimedLookFor`, walks newest-first, and keeps the early exit. **Core registers `parent` and `leaf` first, not last** — every earlier draft said last, and under this ruling that would make core beat every plugin.

**A plan review on 2026-09-11 closed six more. Each is a `J` entry in [`../BUILD-LOG.md`](../BUILD-LOG.md) — reversible, and none of them reopens a ruling above.**

| What | Where it lands |
|---|---|
| A `compute` Field keeps its by-key read and its duration, bound to the pass (`J5`) | Build 1, Unit D |
| `VariantRule` is published: a field match is equality, AND across keys, never "has a value" (`J6`) | Build 2, Unit A |
| `entry.read('parentId')` answers `parent()?.id` (`J9`) | Build 1, Units B and E |
| `entries.all` hands back live rows; which rows stays committed-only (`J10`) | Build 1, Unit B |
| `ctx.variants.add` and `ctx.hierarchy.setSource` — namespaced, like every other plugin door (`J7`) | Builds 2 and 4 |
| A command context names the resolved variant, so the owned-id `Set` goes (`J11`) | Build 2, Unit E |

---

## Traps

Four things bite across more than one build. Each build file carries its own.

- **No sample on `harness/docs/plugin-authoring.html` is typechecked.** `scripts/check-doc-examples.mjs` gates `docs/06-plugin-authoring.md` and nothing else. That page describes a design that is not built, so extending the gate to it now fails by construction. **Treat every sample on it as prose, not as a compiled contract.** Build 4 extends the gate, after the page finally describes `src/`.
- **`props` merges per key, never whole-object** (`src/data/fields/field-access.ts:65-78`, ADR 0011). `entryAfterEdit` spreads `StoredEntry` on the drag path, which is why a prototype getter cannot live on the stored type (ADR 0017, finding P2).
- **`sentence-length` covers 15 declared files in `src/` only.** ADRs and specs are not gated. **ASD-STE100 still applies to every line you write.**
- **`check-vendor-names.mjs` scans 496 files.** An ADR may name a vendor Gantt. A spec, `CONTEXT.md` and `src/**` may not.

---

## Close every build

Do all five, in this order, for the build you just finished.

- [ ] Run the `verify:full` redirect from rule 3. Report the verdict line.
- [ ] Review `harness/main.ts` for an API gap, changed or not.
- [ ] Flip the ADR's `status: proposed` to `accepted`. Link the verdict line in the same commit.
- [ ] Make the locked-spec edits your build file lists. Report them.
- [ ] Close your build's issues on GitHub. Apply labels with the `label-issues` skill.

---

## Where the reasoning lives

Go here only when you need it. None of it is needed to build.

| What you want | Where |
|---|---|
| Why a decision was taken | [`docs/adr/0017`–`0020`](../../../docs/adr/) |
| The rulings, the refuted list, the naming checks | [`../README.md`](../README.md) |
| The author-facing surface all four produce | [`../../../harness/docs/plugin-authoring.html`](../../../harness/docs/plugin-authoring.html) |
| An open question, or a call an earlier build made alone | [`../BUILD-LOG.md`](../BUILD-LOG.md) |
| Why there is no ADR 0014 | [`docs/adr/README.md`](../../../docs/adr/README.md#the-gap-at-0014) |
