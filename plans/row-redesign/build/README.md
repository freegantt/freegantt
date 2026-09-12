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
5. **Rename with a word-boundary replace (`\bOldName\b`), then `pnpm typecheck`.** Read each hit before you change it. Never a blind text replace. **Build 1 has one rename this rule does not protect — its file says so.**
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
- **A variant is a rule.** Four registrations become one `EntryVariant` object. Nothing stores a variant. `EntryLook` is deleted, and a variant name is a `string`.
- **A plugin has one install site.** `definePlugin({ data, view })` replaces the `GanttPlugin` / `DatasetPlugin` pair.
- **A data plugin may own the tree.** A `HierarchySource` states one parent per Entry, and core inverts it.

---

## What is still open

Five questions wait on the author. **Do not answer one alone. Do not file one that already exists** — add to it. Every one is in [`../BUILD-LOG.md`](../BUILD-LOG.md) under the id below, and each build file says what to do meanwhile.

| Id | Question | Build | Does it block? |
|---|---|---|---|
| `Q2` | Do the renderer contexts become generic over `TProps`? **Deferred past this redesign.** Leave the three `fieldValue as Instant` casts in place; they are the evidence | 1 | no |
| `Q7` | What reads a Field off a row the store does not hold — the Rollup's effective child, the ChangeSet's post-edit row, and every `compute` Field? | 1 | **yes — Unit D stops here** |
| `Q5` | Which rule wins when two plugins both answer yes? Registration order decides it today | 2 | no |
| `Q4` | Which error does a misplaced plugin raise, and what does it say? | 3 | no |
| `Q3` | What is the hierarchy seam called? `setHierarchySource` is the draft word | 4 | no |

**Two things were ruled on 2026-09-11. Do not re-open either.**

- All three Field-read doors retire — `entries.fieldValue`, `FieldContext.read` and `FieldContext.durationOf` — into `entry.read(key)` and `entry.duration()`. `Q7` decides how, not whether (`Q1`, closed).
- A segmented Entry's duration is an option: `duration: 'span' | 'segments'` on the `Dataset`, default `'span'`. **Build 1 writes it** (`Q6`, closed). Only the config key's name wants a nod.

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
