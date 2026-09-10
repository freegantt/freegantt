# ADR 0013 — what decides that a row derives its values

**The decision:** [`docs/adr/0013-…`](../../../docs/adr/0013-what-decides-that-a-row-derives-its-values.md)

A derived value lives in the store and never reaches the Document. An Entry derives when it has children. `kind` leaves the record. Behind both sits one question that the single-ADR draft asked four separate times.

## Where it stands

**No decision is open.** Six are closed — **5**, **6**, **26**, and branches **8**, **20**, **21**, **24** with it. 26 closed on 2026-09-10.

**It lands third**, after [0012](../0012-optional-dates/README.md) and [0011](../0011-consumer-values-in-props/README.md). 0012 is a hard gate: this ADR demotes an Entry to *"a normal Entry with no dates"*, and `model/entry.ts:31-33` makes `start` and `end` **required** today.

---

# Open decisions

**None.** 26 closed on 2026-09-10 and is below with 5 and 6.

---

# Closed decisions

## 26 — an Entry derives when it has children; `kind` leaves the record

**Closed 2026-09-10. Ruled by the author.** Was: *what are the inputs to the derivation predicate, and which of them are stored?* Branches **8**, **20**, **21**, and **24** close with it.

**The ruling.** An Entry derives when it has children. That is the whole predicate. `rollUpKinds` is deleted. `hierarchy.autoGroup` is deleted.

**`kind` leaves `Entry`.** No Field, none in the Document, no `update({ kind })`, no default `'span'`. Core does not store a classification. A parent with children draws the parent look. A childless row draws a bar. An empty phase looks like a bar until a child arrives. Core does not ship a diamond.

**Do not replace it with a calculated `kind` Field.** That restates `childrenOf`. Two names for one fact is the failure #7 records. A plugin that needs the fact calls `childrenOf`. A plugin that needs a look that is not parent-or-bar stores which ids it owns — the same pattern as pin and Dependency (ADR 0002).

**No opt-out in this ADR.** A parent with children always derives. A later ADR may add a flag. This one does not name one, and it does not ship `followChildren`.

**What the branches become.**

| Branch | Fate |
|---|---|
| **8** | Dissolves. There is no kind to write on demotion. Losing the last child leaves a normal Entry with no dates (already settled). It draws a bar. |
| **20** | Answered: `kind` is not authored, and it is not a calculated Field. It is gone. No diamond in core. |
| **21** | No flag. The layer question does not arise. |
| **24** | Dissolves. `rollUpKinds` is deleted, so there is no config flip to undo. Gaining or losing a child is a `parentId` write. Undo reverses that write and the drops together. |

**The migration has no mitigation, and that is accepted.** A Document carrying `rollUpKinds: []` today means *keep these parents as I saved them*. Read under this ruling, every parent with children starts deriving, closed decision 6 **drops** the authored values, and `toJSON` omits them — so the next save is permanent. `fromJSON` raises a report. A consumer cannot act on a report. `kind` on an old Entry is dropped. This ADR writes schema **7**.

**The four registries lose their join.** Item producer, bar renderer, capability, and scheduling policy today look up `entry.kind`. After this ADR they ask structure, or they ask a plugin store. D-S5-22 is rewritten in the prose sweep. Do not keep `registerItemProducer('buffer')` keyed from a Field that no longer exists.

**What lost.** Authored `'group'` so an empty phase already looks like a group. Authored `'milestone'` in core. `rollUpKinds: 'none'`. A calculated `kind` that plugins write through.

**The combined spike's (b)** kept kind authored. The author went further: look and derivation both follow children, and the Field goes.

## 8, 20, 21, 24 — closed with 26

**Closed 2026-09-10.** Their bodies asked questions that 26 deleted. Kept here so a number never moves.

**8** asked what kind demotion writes. No kind remains.

**20** asked whether kind is authored. It is not on the record at all.

**21** asked which layer owns a derive-off flag. This ADR ships no flag.

**24** asked how undo reverses a `rollUpKinds` flip. The key is deleted. The cause is a child arriving or leaving.

---

## 5 — a plugin cascade's write to a derived cell is dropped, with a warning

**Closed 2026-09-09. Ruled by the author.**

A plugin cascade that writes a rolling-up Field on a rolling-up parent has that write **dropped**, and the library raises one warning through `raiseError` at `severity: 'warning'` (ADR 0009).

`entries.update()` throws `DerivedFieldNotWritableError` for the same write. A cascade does not, because the guard sits at the public door and the hook reads through a different one. **That placement is deliberate** — a plugin author learns no rule and checks no predicate. **Exempt from the throw was never the same as the write surviving**, and the honest end of that exemption is a drop the author can see.

**Why not let it stand.** `toJSON` omits a derived value in any case, so a cascade that won the pass would still lose at the next save. Letting it stand publishes a number whose whole lifetime is one transaction.

**One code defect to fix first**, and the order matters: unify the proposed-Field predicate before this ADR deletes the `body`/`merged` split. See [`refuted.md`](../shared/refuted.md) item 8.

## 6 — an Entry that starts rolling up drops its authored values

**Closed 2026-09-09. Ruled by the author.** Was: *does a `rollUpKinds` flip refuse or destroy?*

**It drops and recalculates. The library never refuses, at any door.**

**The reason is the author's own story, and the draft had lost sight of it.** A person types `cost: 500` on a row. They then decide that row is a parent, and they give it children. A `cost` on a parent comes from its children, so `500` has no meaning any more and the Rollup replaces it. **Throwing there refuses an ordinary edit over a value the author is plainly finished with.** No product asks a person to empty a cell before they may indent a task under it.

The door is a child arriving. `add({ id: 'c', parentId: 'p' })` drops `p`'s authored `cost`. **Decision 26 deleted the other two doors** — autoGroup, a `kind` write, and a `rollUpKinds` flip. Losing the last child un-dates `p` (0012). The last derived answer does not stay as authored on a childless row: there is nothing to calculate from.

**This ruling follows the ADR's own rule rather than bending it.** *Name a Field and the library answers; change the structure and the library keeps what is yours.* `update('p', { cost: 999 })` on a parent that already rolls up **throws** — the caller named `cost`. `add({ id: 'c', parentId: 'p' })` **drops** `p`'s authored `cost` — the caller named a parent, not a Field. Same split as *`update()` refuses; `add()` drops*, one level out.

**Undo was the draft's stated reason to refuse, and it does not hold** — see [`refuted.md`](../shared/refuted.md) item 12. **History is never cleared, and `RollUpKindsWouldDropValuesError` is not added.**

**Decision 24 closed with 26.** The cause is a `parentId` write. Undo reverses that write and the drops together. `rollUpKinds` is deleted.


---

# The work

## The build

One structural question at every door: *does this Entry have children, and is this a rolling-up Field?* The derived write rule is this ADR's. I14 also needs the editable arm, which is [0015](../0015-write-door/README.md)'s. `toJSON` is not a write.

**This ADR fills the resolver's derived arm.** [0011](../0011-consumer-values-in-props/README.md) moved the resolver into `data/` with HEAD's policies unchanged — `view/capability.ts` calls it; `entries.update()` still throws `UnknownFieldError` only. `rollsUp` already lives in `data/`. **This ADR fills the derived arm and wires `update()` to it**, because the policy is written against the merged patch 0011 produces. [0015](../0015-write-door/README.md) owns the editable arm. This ADR declares and throws `DerivedFieldNotWritableError`. Do not claim I14 until 0015 has wired the editable arm.

**This ADR also deletes `kind` from `Entry`, `rollUpKinds`, `hierarchy.autoGroup`, and the core diamond.** The four registries that keyed on `entry.kind` ask structure, or a plugin store. Wire `capability.ts:119` to children, not to `isRollUpKind(entry.kind)`.

| Door | Answer | State |
|---|---|---|
| cell editor, bar drag | refused when the row has children | **the change** — today it asks kind (`view/capability.ts:119`) |
| `entries.update()` | refused | **the change** — wire `update()` to the derived arm |
| `entries.add()`, `new Dataset({ entries })`, `fromJSON` | value **dropped**, report raised | **the change** |
| the extension hook | write **dropped**, warning raised | decision 5, closed — exempt from the throw only |
| a child arrives | dates change owner mid-commit | **the change** — `autoGroup` is deleted; `parentId` is the door |
| a last child leaves | un-date; draws a bar | already 0012's dates; look follows |
| `toJSON` | derived keys **omitted**; `kind` **omitted** | **the change** |

- Conversion is structure: a child arrives, a last child leaves. No kind write. Dates on demotion are a **normal Entry with no dates**, datable later.
- Delete the `kind` core Field, `EntryKind` as an Entry classification, `rollUpKinds`, `hierarchy.autoGroup`. Ignore `kind` on an old Document.
- Core does not ship a diamond. `--fg-diamond-size` and the milestone producer leave with the Field, or wait on the scheduling plugin.
- Do not publish a calculated `kind` Field.
- The report goes through `raiseError` at `severity: 'warning'`, **always**. Not `isDevMode()`-gated (D-S5-41).
- One report per operation, not per value.
- Delete `reportCorrectedRollUps` — this ADR, not 0011.
- On a rolling-up parent, an Aggregator's `undefined` means **no value**.
- **Write decision 5's warning. The drop already ships; the warning does not.** A cascade's write to a derived cell reaches `merged` and never `body`, so `rollup.ts:196` does not yield and the pass overwrites it in silence. Raise one warning through `raiseError` at `severity: 'warning'`. **Do not unify a predicate** — that instruction was withdrawn on 2026-09-10 as a misread, and [`refuted.md`](../shared/refuted.md) item 8 carries why. **Do not mistake `reportCorrectedRollUps` for this warning** either; it is a `fromJSON` reconciliation report and never sees a cascade.
- This ADR writes schema **7**.

