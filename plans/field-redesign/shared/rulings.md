# Shared rulings — the field redesign

**Three closed rulings serve more than one ADR.** They stay here because the folder's rule is *state a fact once*, and every one of them is cited from two ADRs or more. Read the ADR that governs your change first; come here when it points at one of these.

| Ruling | Who cites it |
|---|---|
| **3 — the schema restart's release gate** | all five. Every ADR that changes the Document spends a number |
| **The registration lock** | [0011](../0011-consumer-values-in-props/README.md) (decision 11) and [0014](../0014-plugin-author-surface/README.md) (decision 9) |
| **`ComputedFieldCannotBeWrittenError`** | [0011](../0011-consumer-values-in-props/README.md) at registration, [0015](../0015-write-door/README.md) at `entries.update()` |

**Numbers do not move.** A decision keeps the number it was given in the single-ADR folder, whichever ADR now owns it. The split re-homed the rulings; it did not renumber them. This is the one exemption to the old folder's rule 2, and it is recorded here so nobody re-derives the numbering.

**One schema counter, not five, and [its table is below](#3--the-schema-restarts-release-gate).** That table is the folder's only copy. An ADR states the one number it spends and links here.

---

## 3 — the schema restart's release gate

**Closed 2026-09-09.** Its own text read *"and that stands"*, so only a one-line addition was ever in question.

**The count restarts at `1` on release.** HEAD writes `4`. Each ADR that changes the Document spends the next number, in landing order. The old single-ADR count ended at `5`. The split spends one number per Document change, which is what dissolved decision 25 already required.

| ADR | Document change | Writes |
|---|---|---|
| [0012](../0012-optional-dates/README.md) | optional `start` / `end` | **5** |
| [0011](../0011-consumer-values-in-props/README.md) | `meta` → `props`, `source` leaves `SerializedField` | **6** |
| [0013](../0013-what-decides-derivation/README.md) | omit a rolling-up parent's derived keys | **7** |
| [0014](../0014-plugin-author-surface/README.md) | plugin-key prefix (decision 12, closed 2026-09-10) | **8** |
| [0015](../0015-write-door/README.md) | `editable` enum on `SerializedField` (decision 18, closed 2026-09-10) | **9** |

**The library reads one schema, and no old one. Ruled by the author, 2026-09-10.** Each build leaves exactly one reader — the number it writes — and deletes every earlier reader with its fixtures, in the same commit. A Document at any other number raises `UnsupportedSchemaError`. Build 0012 deletes readers 1, 2, 3 and 4; ADR 0011's work list gives that deletion to build 0011, and it moves forward one build, because 0012 lands first. Three facts price this at zero: the library has never shipped, no saved Document exists in the tree, and the count restarts at `1` on release, so 5 through 9 are throwaway numbers. **The `readers` map stays a map.** It is the migration seam (`read.ts:122`, `plans/02` §6), and old-schema *support* is what goes, not the mechanism that adds it back after release. The call sites are in [`BUILD-SPEC.md`](../BUILD-SPEC.md) §1 V13.

One rule joins the release gate — **a released reader refuses a file it did not write.** That retires the pre-release-`3`-against-released-`3` hazard permanently. Nothing reads schema 3 today. Spending a public number, or shipping a `preRelease` flag, would solve a problem that ends the day the library goes public. Two Document shapes must not share one number.

## `ComputedFieldCannotBeWrittenError` — one name at two doors

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision.

**One concept: a `compute` Field cannot be written.** Two doors reach it. Registration is the first — `compute` beside `rollUp`, or `compute` beside `editable`. `entries.update()` is the second. **One error name covers both, and the message names the door.** A second error type would be two names for one concept, which is the failure `plans/02` records at #7.

**Do not reuse the name for a derived parent cell.** That is `DerivedFieldNotWritableError`. A rolling-up parent holds a stored value the Rollup owns. A `compute` Field holds no stored value at all. Two concepts, two names.

**The register door is what makes the update() door unambiguous, and that is the argument for one name.** The union is a declaration-site aid, so `FieldRegistry` enforces it at runtime ([`types.md`](../0011-consumer-values-in-props/types.md)). A registered Field therefore sits on the stored arm or the compute arm, never both. On any one Field exactly one of the two errors is reachable. The first door guarantees the second door's precondition, so a consumer never has to ask which name applies.

**Two rules follow, and both are load-bearing.**

**1. The update() door's message says `compute`. It never says *derived*.** This ADR uses *derived* for a rolled-up value **and** for a `compute` value. Decision 21's per-entry flag makes the overlap reachable: a consumer sets the flag, writes a `compute` Field on that Entry, and reads *this value is derived* as *I just turned derivation off*. Naming the door is not enough when the word is ambiguous. This is the same trap that ruled out `derivesValues` as a name for the flag.

**2. The write resolver checks `compute` before `editable`.** The union's compute arm declares `editable?: never`, and the register door throws for `compute` beside `editable`. So a `compute` Field can never carry `editable: 'anywhere'`. Check `editable` first and the consumer reads *declare `editable: 'anywhere'`*, which the register door then rejects. That is a closed loop with no way out. **One name is not enough on its own; the wrong rule must not answer first.**

Decision 18 closed on the enum. The order still holds: `compute` first, then `'never'` / `'api'` / `'anywhere'`.

[0011](../0011-consumer-values-in-props/README.md) throws this error at **registration**. [0015](../0015-write-door/README.md) throws it at `entries.update()`. One name, two doors, two ADRs.

## The registration lock — `fields` and `plugins` are fixed at construction

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision, and nothing had written it down. Decision 11 argued against the flat shorthand on the opposite claim.

**The code already locks both, and no door reopens them.** `dataset.fields` is a read-only getter (`src/api/dataset.ts:240`) and `Dataset.plugins` is read-only (`src/api/dataset.ts:180-183`). Two doors add a Field, and both close inside the constructor: `DatasetOptions.fields`, and `ctx.fields.register` during a plugin's own `setup()`. A `register` call after that `setup()` returns throws `RegistrationClosedError` (`src/extensions/plugin-runtime.ts:54`). **This ruling states what ships; it adds no code.**

**Four things depend on the lock today.**

- `FieldRegistry.all` is **one array identity for the registry's whole life** (`field-registry.ts:137-139`). Readers cache by identity and carry no invalidation branch.
- `diffEdit` walks the registry for ChangeSet row order, so **row order cannot change mid-life**.
- `toJSON` output does not depend on **when** it is called, because `authored` filters a fixed set.
- The construction Rollup walks **once**, at the end of the constructor, after every plugin has declared.

**The payback is that a Field arriving mid-life causes a whole-dataset Rollup.** Declaring a Field on a Dataset that already holds Entries makes every rolling-up parent owe a new aggregate. That is a pass outside any user action, writing stored values that enter undo. A declaration is a **config assignment**, and `ChangeSet` has no row shape for one — `added`, `removed` and `updated` each name a store entity. Decision 6 closed the sibling problem (a live `rollUpKinds` flip) as drop-and-recalculate; [0013](../0013-what-decides-derivation/README.md) then **deleted** `rollUpKinds` with 26. **Unlocking `fields` makes that class of problem two problems.** Keeping the lock leaves it at one.

**A late install rebuilds, and the door already ships.** `Dataset.fromJSON(dataset.toJSON(), { fields, fieldTypes, aggregators, plugins })` — `src/api/dataset.ts:328`. **Say its price in the same sentence that offers it:** a new Dataset identity, so every subscriber rebinds and the undo History is lost. That price suits a *turn scheduling on* toggle. **Grill 2026-09-10:** Fields are the schema. No new Field keys after construction. Hide/show columns stay live. Do not ship “add a column” as a feature that clears History. Live `editable` is `dataset.setFieldEditable` — [0015](../0015-write-door/README.md) Q16.

**Written into `plans/02`.** *Reconfiguration is just assignment* names `fields` and `plugins` as the two exceptions, with the Rollup-and-undo reason above. The sentence there that cites a live `rollUpKinds` flip is stale (26 deleted the key); the [prose sweep](prose-sweep.md) rewrites it. The lock itself stands.

---

## 25 — dissolved by the split

Was: *one schema bump, or one per group?* It recommended **per group**, so that each Document change lands in a commit a reader can check against a running build.

**The split delivers that outcome without a decision.** Each ADR spends its own number in landing order — [the table above](#3--the-schema-restarts-release-gate). Decision 3 already prices a pre-release number at zero.

**Its one constraint is now structural rather than remembered.** The old warning was *bump per group only if the storage rename carries the nested ingest too*, or the intermediate commit is green and silently lossy. That constraint lives inside [0011](../0011-consumer-values-in-props/README.md), which carries the public shape and the nested ingest in one ADR, because splitting them was never on the table.

**The number is retired, not reused.** Nothing else takes 25.
