# Shared rulings — the field redesign

**Three closed rulings serve more than one ADR.** They stay here because the folder's rule is *state a fact once*, and every one of them is cited from two ADRs or more. Read the ADR that governs your change first; come here when it points at one of these.

| Ruling | Who cites it |
|---|---|
| **3 — the schema restart's release gate** | all five. Every ADR that changes the Document spends a number |
| **The registration lock** | [0011](../0011-consumer-values-in-props/README.md) (decision 11) and [0014](../0014-plugin-author-surface/README.md) (decision 9) |
| **`ComputedFieldCannotBeWrittenError`** | [0011](../0011-consumer-values-in-props/README.md) at registration, [0015](../0015-write-door/README.md) at `entries.update()` |

**Numbers do not move.** A decision keeps the number it was given in the single-ADR folder, whichever ADR now owns it. The split re-homed the rulings; it did not renumber them. This is the one exemption to the old folder's rule 2, and it is recorded here so nobody re-derives the numbering.

**One schema counter, not five.** The ADRs bump it in landing order — 0012 writes **5**, 0011 writes **6**, 0013 writes **7**. 0014 writes **8** — decision 12 closed on a plugin prefix. Decision 3 prices a pre-release number at zero.

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

One rule joins the release gate — **a released reader refuses a file it did not write.** That retires the pre-release-`3`-against-released-`3` hazard permanently. Nothing reads schema 3 today. Spending a public number, or shipping a `preRelease` flag, would solve a problem that ends the day the library goes public. Two Document shapes must not share one number.

## `ComputedFieldCannotBeWrittenError` — one name at two doors

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision.

**One concept: a `compute` Field cannot be written.** Two doors reach it. Registration is the first — `compute` beside `rollUp`, or `compute` beside `editable`. `entries.update()` is the second. **One error name covers both, and the message names the door.** A second error type would be two names for one concept, which is the failure `plans/02` records at #7.

**Do not reuse the name for a derived parent cell.** That is `DerivedFieldNotWritableError`. A rolling-up parent holds a stored value the Rollup owns. A `compute` Field holds no stored value at all. Two concepts, two names.

**The register door is what makes the update() door unambiguous, and that is the argument for one name.** The union is a declaration-site aid, so `FieldRegistry` enforces it at runtime ([`types.md`](../0011-consumer-values-in-props/types.md)). A registered Field therefore sits on the stored arm or the compute arm, never both. On any one Field exactly one of the two errors is reachable. The first door guarantees the second door's precondition, so a consumer never has to ask which name applies.

**Two rules follow, and both are load-bearing.**

**1. The update() door's message says `compute`. It never says *derived*.** This ADR uses *derived* for a rolled-up value **and** for a `compute` value. Decision 21's per-entry flag makes the overlap reachable: a consumer sets the flag, writes a `compute` Field on that Entry, and reads *this value is derived* as *I just turned derivation off*. Naming the door is not enough when the word is ambiguous. This is the same trap that ruled out `derivesValues` as a name for the flag.

**2. The write resolver checks `compute` before `editable`.** The union's compute arm declares `editable?: never`, and the register door throws for `compute` beside `editable`. So a `compute` Field can never carry `editable: true`. **If decision 18 lands on its first answer** — *`entries.update()` refuses unless a Field declares `editable: true`* — then every `compute` Field is refused twice, once by each rule. Whichever rule the resolver checks second never fires. Check `editable` first and the consumer reads *declare `editable: true`*, which the register door then rejects. That is a closed loop with no way out. **One name is not enough on its own; the wrong rule must not answer first.**

**What this does not decide.** Decision 18 stays open. This ruling fixes the order of the checks, not the answer to what an absent `editable` means.

[0011](../0011-consumer-values-in-props/README.md) throws this error at **registration**. [0015](../0015-write-door/README.md) throws it at `entries.update()`. One name, two doors, two ADRs.

## The registration lock — `fields` and `plugins` are fixed at construction

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision, and nothing had written it down. Decision 11 argued against the flat shorthand on the opposite claim.

**The code already locks both, and no door reopens them.** `dataset.fields` is a read-only getter (`src/api/dataset.ts:240`) and `Dataset.plugins` is read-only (`src/api/dataset.ts:180-183`). Two doors add a Field, and both close inside the constructor: `DatasetOptions.fields`, and `ctx.fields.register` during a plugin's own `setup()`. A `register` call after that `setup()` returns throws `RegistrationClosedError` (`src/extensions/plugin-runtime.ts:54`). **This ruling states what ships; it adds no code.**

**Four things depend on the lock today.**

- `FieldRegistry.all` is **one array identity for the registry's whole life** (`field-registry.ts:137-139`). Readers cache by identity and carry no invalidation branch.
- `diffEdit` walks the registry for ChangeSet row order, so **row order cannot change mid-life**.
- `toJSON` output does not depend on **when** it is called, because `authored` filters a fixed set.
- The construction Rollup walks **once**, at the end of the constructor, after every plugin has declared.

**The payback is that a Field arriving mid-life reproduces decision 6's open follow-up on a second axis.** Declaring a Field on a Dataset that already holds Entries makes every rolling-up parent owe a new aggregate. That is a whole-dataset Rollup pass, outside any user action, writing stored values that enter undo. Decision 6 already wrote what happens next: *"undoing that step restores the values while `rollUpKinds` still rolls them up, and the next commit that touches the subtree drops them again."* A declaration is a **config assignment**, and `ChangeSet` has no row shape for one — `added`, `removed` and `updated` each name a store entity. **Unlocking `fields` makes that problem two problems.** Keeping the lock leaves it at one.

**A late install rebuilds, and the door already ships.** `Dataset.fromJSON(dataset.toJSON(), { fields, fieldTypes, aggregators, plugins })` — `src/api/dataset.ts:328`. **Say its price in the same sentence that offers it:** a new Dataset identity, so every subscriber rebinds and the undo History is lost. That price suits a *turn scheduling on* toggle. It does not suit an *add a custom column* feature, where losing undo on a column add would surprise anyone. **That is the hole this ruling accepts**, recorded the way the dateless-row hole is.

**Owed to `plans/02`, and not yet written.** `plans/02` rules that *every config key is live-reconfigurable*. `fields` and `plugins` are exceptions, and today the exception is undocumented — which is exactly how decision 11 came to argue from the opposite claim. Write both keys into `plans/02` as named exceptions, carrying the Rollup-and-undo reason above. **`plans/02` is a locked spec, so this edit needs the author.**

---

## 25 — dissolved by the split

Was: *one schema bump, or one per group?* It recommended **per group**, so that each Document change lands in a commit a reader can check against a running build.

**The split delivers that outcome without a decision.** Each ADR spends its own number in landing order — [0012](../0012-optional-dates/README.md) writes **5**, [0011](../0011-consumer-values-in-props/README.md) writes **6**, [0013](../0013-what-decides-derivation/README.md) writes **7**. Decision 3 already prices a pre-release number at zero.

**Its one constraint is now structural rather than remembered.** The old warning was *bump per group only if the storage rename carries the nested ingest too*, or the intermediate commit is green and silently lossy. That constraint lives inside [0011](../0011-consumer-values-in-props/README.md), which carries the public shape and the nested ingest in one ADR, because splitting them was never on the table.

**The number is retired, not reused.** Nothing else takes 25.
