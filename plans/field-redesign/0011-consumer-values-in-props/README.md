# ADR 0011 — a consumer value has a home

**The decision:** [`docs/adr/0011-…`](../../../docs/adr/0011-consumer-values-live-in-props.md)

A consumer's values move from `meta` to **`props`**, and a Field key becomes the whole address, so `FieldSource` retires. `{ key: 'cost' }` reads and writes `entry.props.cost`. `{ key: 'start' }` reads and writes `entry.start`. Nothing declares a `source`.

**This is the ADR that simplifies the API.** The other four came out of it in the 2026-09-09 split, because each answers a different question and none of them is *where does a consumer value live*.

## Read the one you need

| File | Read it when |
|---|---|
| [`types.md`](types.md) | You are about to write the edit types or the Field union |
| [`api.md`](api.md) | You want the call sites, before and after |
| [`../shared/evidence.md`](../shared/evidence.md) | You want the product survey these decisions cite |
| [`../shared/refuted.md`](../shared/refuted.md) | You are about to re-derive something. **Check here first** |
| [`../shared/rulings.md`](../shared/rulings.md) | You hit the registration lock, the schema counter, or `ComputedFieldCannotBeWrittenError` |

## Where it stands

**Three decisions are open — 1, 11 and 22.** All three ask the same kind of question: *what does a consumer's write look like?* Four are closed — 2, 10, 17, and the `props`-names-a-core-key ruling.

**It lands second**, after [0012](../0012-optional-dates/README.md). [0012](../0012-optional-dates/README.md) is decision-free and touches four of the same files, so it goes first and this ADR rebases onto it. `EntryEdit`'s removable keys follow `Entry`, so 0012 first also makes `{ start: undefined }` compile here.

## The write resolver is this ADR's to move, and not its to re-rule

`view/capability.ts:113-121`'s `libraryWriteRule` already holds two of the three arms in one function, and already imports `rollsUp` from `data/` (`field-registry.ts:97` — it already lives there). `entry-store.ts:358` already throws `UnknownFieldError` for the third. **The resolver is a move, not a build.**

**This ADR moves it into `data/` with HEAD's policies unchanged.** `view/capability.ts` calls the moved function and stops restating the rule. **`entries.update()` keeps HEAD's `UnknownFieldError` only** — it does not call the editable or derived arms. No policy changes, so no decision is spent. Then [0013](../0013-what-decides-derivation/README.md) fills the derived arm and wires `entries.update()` to it, and [0015](../0015-write-door/README.md) fills the editable arm. **One function, three owners, one at a time.** Do not wire `entries.update()` to a policy this ADR did not rule. The seven call sites and the throw-versus-drop table belong to 0013 and 0015. Do not claim I14 until 0015 has wired the editable arm.

## What this ADR does *not* decide

- **Where a plugin's values live.** They sit in `Entry.meta` today (`field-registry.ts:148`), and `Entry.meta?: TMeta` is consumer-typed already. This ADR ships `props: Readonly<Partial<TProps>>` — HEAD's exact posture under a new name. [0014](../0014-plugin-author-surface/README.md) then widens the type additively or migrates the values.
- **Whether the core-key override survives.** `#mergeCoreFieldOverride` merges `editable` and **never touches `source`** (`field-registry.ts:211-225`), so `FieldSource` deletes cleanly around it. The override is [0015](../0015-write-door/README.md)'s.
- **What a rolling-up parent's `props` does.** This ADR rules `props` is carried by reference. [0013](../0013-what-decides-derivation/README.md) adds the one exception.

---

# Open decisions

**Three, and they are one family.** 1 and 11 both ask what a consumer may name at the write door, and 11's text says to settle 1 first on one branch. 22 is the type that carries the answer.

## 1. May an undeclared key travel in a `props` patch?

Settled *yes* on 2026-09-08. **Re-opened 2026-09-09** by a survey of what ships elsewhere. **Blocks the merging patch.**

Three patterns ship, and all three are coherent.

| Pattern | Who | Behaviour |
|---|---|---|
| Atomic bag | tldraw `meta`, Excalidraw `customData`, **this library at HEAD** | Undeclared, untyped, **replaced whole**. One identity, one change event, one undo step |
| Declared fields | Bryntum, AG Grid | Per-key merge, per-key change tracking, **declaration required** |
| Namespaced bag, per-key setter | FullCalendar `extendedProps` | Undeclared keys kept and never modified. `setExtendedProp` writes **one** key. **No changeset, no diff, no undo** |

**State the claim exactly.** It is not *"nobody does per-key writes on an undeclared key"* — FullCalendar does. It never pays what we would pay, because it has no ChangeSet, no diff and no undo, so an undeclared key needs no equality rule, no row and no order. **What nobody ships is per-key merge over an undeclared space _inside a transactional store_.** Per-key merge there needs per-key identity, equality and ordering, and the declaration is where all three come from. Bryntum shows the other end: an undeclared field gets no accessor, so no tracking and no re-render.

**What it costs us.** An undeclared key has no `equals`, so a `props` value holding an object emits a ChangeSet row on **every** write, changed or not. It has no deterministic row order. And the merging patch(c) has to stop `fieldValue` throwing `UnknownFieldError`, so a row naming an undeclared key can be read back.

**Recommendation — reuse the ADR's own rule, _records carry and patches name_.** `add()`, `new Dataset({ entries })` and `fromJSON()` **carry** an undeclared key, store it and round-trip it. `update()` **names** a key, so naming an undeclared one keeps throwing `UnknownFieldError`. An undeclared value then never changes, so undo never needs it, no `equals` is needed, row order stays deterministic, and `fieldValue` keeps its guard. this ADR's three edits are not needed at all.

**The objection, and the answer.** *A namespace a consumer may fill and never change is incoherent.* They can change it — by declaring it, which is one line, `{ key: 'phase' }`. Declaring is where a consumer says *I intend to change this*, and it gives *why declare a Field?* a one-sentence answer it does not have today. The cost: `harness/planner.ts`'s `phase` gains that line.

**Two further costs, both real, neither fatal.**

*A plugin that writes a Field it has not registered fails.* Registration closes when `setup()` returns (`RegistrationClosedError`). A plugin that computes a key name later, or writes for another plugin that is not installed, has no way to declare it, and its cascade throws. Today that write succeeds. Whether that is a defect or the rule working is part of this decision.

*The type says yes where the runtime says no.* `TProps` membership and Field declaration are two different things, and the type cannot see the registry.

```ts
interface PlannerProps { owner?: string; phase?: number }   // phase is in TProps…
fields: [{ key: 'owner' }]                                  // …and declared as no Field

update('t1', { props: { phase: 3 } })   // ✅ type-checks — PropsEdit maps keyof TProps
                                        // ❌ throws UnknownFieldError — nothing declares it
```

Closing that gap needs declared-key inference from a `fields` literal, which is #267's machinery and out of scope. It is the same posture `fieldValue` already takes at HEAD. If the recommendation lands, the error message carries the fix: *"'phase' is not a declared Field, so update() cannot name it. Declare it: `{ key: 'phase' }` — or write it at ingest, where undeclared keys are kept."*

---

## 11. Does *common case is a shorthand* survive for Field writes?

`plans/02:459` ships `update('t1', { start, cost })`. This ADR ships `update('t1', { start, props: { cost } })`. One sentence names two Fields; the other names one Field and a container. **This edits a locked spec either way**, so it needs an explicit ruling.

**Nobody nests at the write door**, and **FullCalendar ran the flat experiment to its end and it went wrong twice**. Both surveys are in [`evidence.md`](../shared/evidence.md).

**Read the FullCalendar lesson precisely, because it is narrower than _flat is bad_.** What broke it is an **open** top level, not flatness. **This ADR already closes that door:** `update('t1', { strat: … })` throws `UnknownFieldError`.

**It does not collide with 1's current recommendation.** 1 now recommends that `update()` throws for an undeclared key, so the typo guard *inside* `props` stays. Nesting and the declared-key shorthand are both still live. The collision returns only if 1 lands the other way — undeclared keys writable, inner guard dropped, outer guard kept — because the ADR cannot say *TProps is enough inside* and *we nest for a closed top level for the same typo reason*. **Settle 1 first only for that branch.**

**The third option: a flat shorthand for _declared_ keys only, with `props: {}` as the long form.** `update('t1', { start, cost })` is legal exactly when `cost` is declared; anything the registry does not know still throws. That keeps `plans/02`'s *common case is a shorthand*, and it is **not** FullCalendar's mistake, because the top level stays closed. **This is the option to weigh against the nesting, not the open flat form.**

**Its price, and half of what the first pass charged is not real.** FullCalendar shipped a write whose *meaning* depends on what the library knows about the key. The declared-key flat spelling keeps that shape and moves it one stage later: `update(id, { cost })` compiles always, and throws or writes depending on registry state at the moment of the call.

**The first pass charged this twice, on a false claim about the code.** It read *"`fields` is live-reconfigurable like every config key"*. **It is not.** `dataset.fields` is a read-only getter (`src/api/dataset.ts:240`), and the only two doors that add a Field — `DatasetOptions.fields` and `ctx.fields.register` — both close inside the constructor. See [the registration lock](../shared/rulings.md#the-registration-lock--fields-and-plugins-are-fixed-at-construction).

**So the temporal half of the price is gone, and the cross-instance half survives.** `update(id, { cost })` means one thing on a given Dataset for that Dataset's whole life. It is still legal on one Dataset and a throw on another. **That surviving half does not separate the two options**, because `update(id, { props: { cost } })` throws on the same second Dataset under 1's recommendation. **Weigh the shorthand against the nesting on what is left: a top level that holds core keys and consumer keys side by side.**

---

## 22. Does `ProposedEdit` carry a brand, or does an extender diff its proposed keys?

**Raised 2026-09-09. Gates ADR 0011**, which writes the `ProposedEdit` type.

**The trap, in one line.** After the rename a complete `props` and a `props` patch are the same shape, so a plugin that spreads `request.proposed.get(id)?.props` into a returned edit proposes **every** stored key by accident. The full statement, with the code, is in [`types.md`](types.md).

**Two candidate fixes, and one has to land with the type.**

- **Brand `ProposedEdit`**, so it is not assignable to the hook's return type. The compiler refuses the spread at the seam where it happens. The price is a brand on a published plugin-author type, and a plugin author who legitimately wants one key off `proposed` writes one unwrap.
- **Seed an extender's proposed keys by diffing against the pre-state**, instead of by key presence. The spread stays legal and stays harmless, because a key whose value did not change proposes nothing. The price is that a write of the same value stops being a proposal, which is a behaviour change at the hook, not only a type change.

**Do not close this after ADR 0011.** `plans/02`'s *one write shape, one knob* breaks at exactly this seam. A doc comment is not a third option: the spread reads as *keep everything and add one*, so a plugin author who never suspects a problem never looks for the comment that describes it.

---


---

# Closed decisions

## 2 — `entries.add({ props })` emits one changeset row

**Settled 2026-09-08.**

One `EntityAdded` row carries the whole Entry as stored. Per-Field rows would undo one user action in several steps. The row states what the store now holds rather than what the call passed — after a dropped derived value, and after ingest fills `props: {}` and the Segments.

## 10 — what a `compute` Field shows on a rolling-up parent

**Closed 2026-09-09.** Its own recommendation ended *"take this off the blocking list"*, and nothing gated on it.

**`compute` runs on every row, a rolling-up parent included.** The union closes storage, not reading. A `compute` Field reading `entry.props.cost` on a group sees what the Rollup put in the store — a stored read through a door the union never closed. Blanking it would put `{ key: 'ref', compute: (e) => rowNumber(e.id) }` at an empty cell on every group row, which a consumer reads as a bug. The real limit is that a `compute` Field cannot ask *am I a parent?* — that is [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).

## 17 — the namespace is `props`

**Closed 2026-09-09. Ruled by the author.** Was: *should the namespace be called `props` rather than `data`?*

`props` it is. `Entry.props`, `EntryInput.props`, `EntryDocument.props`, the `props?:` key on `EntryEdit`, and `"props"` in every saved file.

**Why `data` lost.** `data/` is a core layer, so `data` would name a layer and a consumer's bag at once. The mitigation on offer was a prose convention — *write `data/` for the layer and `entry.data` for the bag, never the bare word*. `plans/02` rules that a generic word covering more than one concept is a bug rather than a style nit, and #7 is the cautionary case: "chart" named the public instance and an internal class, and the fix was to **retire the word**, not to write a disambiguation rule and trust context. `data` is the most generic word available.

**What it costs.** One inversion for a reader arriving from tldraw, where `props` is the library's own validated schema and `meta` is the consumer's free-form bag. That is one product's pairing, weighed against a collision on every page of this repo.

**What it deletes.** The prose sweep owes a glossary rule for the `data/`-against-`entry.data` collision. There is no collision, so there is no rule to write.

**Checked before ruling:** `props` and `TProps` appear nowhere in `src/`.

**Renames that follow:** `DataEdit` → `PropsEdit`, `TData` → `TProps`, `ConsumerEntryData` → `ConsumerEntryProps`, `PluginEntryData` → `PluginEntryProps`, `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`. The ADR file itself is renamed, which ADR 0006 permits while its status is `proposed`.

**Left open by this ruling:** decision 12, whether a Field key carries an ownership marker. The ADR said 17 depended on 12. It ran the other way — the word is settled and the marker is not.

## A `props` key that names a core key — warning, and the core definition wins

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat as the fourth bullet of decision 12 (which recommended an **error**) and as a Consequences bullet (which stated a **warning**), marked *contested*.

**A warning, the value is ignored, and core's own definition is used.** `props: { start: … }` never throws.

**The reason is where the data comes from.** A consumer feeds this Dataset from an API they do not own. A column added upstream, named `start` or `kind` or `name`, must not break their page. A warning names the key and the app keeps running.

The leak decision 12 worried about — *it stores a value no door can read back* — closes anyway, because the value is not stored.

**What stays open:** decision 12's other three bullets — the published closed reserved list, bare consumer keys, and a required plugin prefix.

**This ruling covers a `props` _value_ only. The _declaration_ case is open as decision 23**, and it is weighed in [0015 open decisions](../0015-write-door/README.md#open-decisions), not here. `fields: [{ key: 'start', … }]` is set to throw `DuplicateFieldKeyError` after the override is deleted, and whether the posture above should reach it is the question. **ADR 0011 does not implement that throw until 23 closes.**


---

# The work

## The build — the address rule and the storage rename

The key decides the home, so no declaration carries one.

- `Entry.meta` → `Entry.props`, non-optional, filled `{}` at ingest. `Entry.props: Readonly<Partial<TProps>>`. Input and Document keep `props?`.
- **A must move the nested ingest with the public shape, or A alone drops every consumer Field write in silence.** `writeDeclaredMetaFields` (`data/fields/field-access.ts:141-155`) finds a consumer Field value on an edit today, and it walks the edit's **top level**:
  ```ts
  for (const key of Object.keys(edit)) {
    const field = registry.get(key);
    if (!field || !storesInMeta(field)) continue;
    next = writeField(next, overlay, field, edit[key]);
  }
  ```
  Today `update({ cost: 500 })` is flat, so `cost` is found there. After A the only top-level key is `props`, and A **deletes** the `props` core Field — so `registry.get('props')` misses, `continue` fires, and the value is never written. No error, no ChangeSet row. The nested read is the merging patch's `toProposedEdit`. **This is the constraint on splitting A from B.**
- Write the edit types from [`types.md`](types.md). Do **not** write `Partial` on either half, and do **not** factor them into one shared mapped type. Seven type tests.
- **`StoredEdit` → `ProposedEdit`, with serena.** About 184 occurrences. `ProposedEdits`, `toProposedEdit`/`toProposedEdits` and `EditReading.proposed` follow. Lands in A because A already renames the type's own field. Write `ProposedEdit`'s **type** too — `props` is required on it — and decide the branding trap in [`types.md`](types.md) at the same time.
- Public plugin generics lose the second type parameter: `DatasetPlugin`, `DatasetPluginContext`, `DatasetOptions`, `Dataset.fromJSON`.
- `build-commit-change-set.ts:100`'s `fieldsWrittenBy` still skips `'meta'`, and `field-access.ts:26`'s `isOptionalEntryKey` still names it. Both follow the rename.
- **Leave `#mergeCoreFieldOverride`, `#consumerOverriddenCoreKeys`, `CORE_FIELD_OVERRIDABLE_KEYS` and `illegalCoreOverrideKey` standing.** The merge reads `editable` and never reads `source` (`field-registry.ts:211-225`), so `FieldSource` deletes cleanly around it. Deleting the override removes a data-level capability that `interactions.edit` cannot replace — that is [0015](../0015-write-door/README.md)'s decision 19, and what a consumer declaration on a core key then does is its decision 23.
- **One write resolver in `data/`, and this ADR changes no policy in it.** `view/capability.ts:113-121`'s `libraryWriteRule` already holds the *editable* and *derived* arms in one function and already imports `rollsUp` from `data/`; `entry-store.ts:358` already throws `UnknownFieldError` for *exists*. **The resolver is a move, not a build.** Move that function into `data/`, point `view/capability.ts` at it, and stop that file restating the rule. **`entries.update()` keeps HEAD's `UnknownFieldError` only.** [0013](../0013-what-decides-derivation/README.md) then fills the derived arm and wires `update()` to it; [0015](../0015-write-door/README.md) fills the editable arm. **Do not wire `entries.update()` to a policy this ADR did not rule.** The seven call sites and the throw-versus-drop table live in those two ADRs. Do not write their tests here.
- **Two merges shallow-spread, not one. Fix both together or plugin composition breaks in production.**
  - `data/edit-extension.ts:38` — `mergeEntryEdits`, the loose one a plugin author calls. With consumer keys inside `props`, two extenders writing different `props` keys lose one: #197 one level down, against that function's own stated promise (#238).
  - `data/fields/field-access.ts:49` — `mergeStoredEdits`, which the **commit path** uses to fold body + cascade + hierarchy. `{ ...base, ...extra }` has the identical hole, and here it breaks a contract written directly above it: *"`extra` wins per Field key; the proposed keys of both survive."* That is true today only because a top-level key **is** a Field key. Once `props` is one key holding many, `extra` wins per **namespace**, so a body write of `props.cost` beside a cascade write of `props.progress` loses `cost` — while `proposedKeys` still names it, so the ChangeSet emits a row carrying a stale value. **A wrong row is worse than a dropped write**, and only this one is reachable without a second plugin installed.
- Two ingest warnings, one `Object.keys(input)` walk per Entry against `CORE_FIELDS` plus `'props'`: an unknown top-level key, and a key inside `props` that names a core key.
- Delete `FieldSource` and all three arms, `Field.source`, `SerializedField.source`, `source-strategy.ts`, `normalize-source.ts`, `metaRecord` / `metaKey` / `metaSlot`, `DuplicateFieldSourceError`, `InvalidFieldSourceError`.
- Delete the `meta` core Field with **no successor**.
- `CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>`, and `CoreFieldValues` omits `'props'` with it. The registry refuses `{ key: 'props' }` — the **one** reserved key.
- `'compute' in field` replaces `computeStrategy.serialize()` in `encodeFieldDocument`. **Follow the mechanism before deleting it:** `writeStoredSource` calls `computeStrategy.serialize()`, which answers `undefined`, and `encodeDeclaredField` drops the row. Delete the table and that test goes with it.
- **This ADR declares `ComputedFieldCannotBeWrittenError` and throws it at registration.** [0013](../0013-what-decides-derivation/README.md) declares and throws `DerivedFieldNotWritableError`. [0015](../0015-write-door/README.md) declares and throws `FieldNotEditableError`. Every new error is a named `FreeGanttError` with a `code:` and a `plans/02` §7 row.
- `view/capability.ts`'s `hasSomewhereToWrite` becomes `!('compute' in field)`.
- One generic. `harness/planner.ts:31` currently writes two that disagree about `critical`.
- Rename fixture types: `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`.
- The registry's `authored` comment states plugin values sit in `Entry.meta`. One word changes unless decision 9 lands on the plugin store, which deletes the sentence.
- **Not ADR 0011's:** the `harness/main.ts:89` double cast. Declare `window.__dataset` as the bare `Dataset` first, independently — see [`refuted.md`](../shared/refuted.md).

## The build — the merging patch

Written in the new names: `toProposedEdit`, `ProposedEdit`.

- `toProposedEdit` merges the `props` patch onto the Entry's own record, so a `ProposedEdit` always carries a **complete** `props`. The merge belongs on the read side, not the apply side.
- `entryAfterEdit` merges `props` rather than replacing it.
- An explicit `undefined` inside a patch clears that one key.
- `diffEdit` emits one row per Field key, never a path into `props`.

**Decision 1 gates the rest of this group.** If an undeclared key may travel in a patch, three edits ship together or the write is silent — no ChangeSet row, no undo, no subscriber:

- **a.** Seed `proposedKeys` from inside `props`, not only from top-level keys.
- **b.** `diffEdit` keeps the registry walk for row order, then drains undeclared keys in the proposed set.
- **c.** `entries.fieldValue` and `ctx.read` answer `entry.props[key]` for an undeclared key — `undefined` if nothing holds it.

If decision 1 lands as the ADR recommends — `update()` throws, ingest still carries — **skip a–c**. `UnknownFieldError` stays on the top level of an edit either way.

## Done first — 2026-09-09

`mergeColumn` now spreads `sizingPairOf(…)` — the `width`/`flex` pair alone — instead of the whole type-bundle column. Four test rows in `field-registry.test.ts`. `verify:full PASS — all 16 checks green, test:e2e included`. Independent of the ADR; cherry-picks to `main`.


## Naming already landed

`9c3f704` renamed the conversion family. Write against: `toStoredEdit` / `toStoredEdits`, `toEditReading` / `toEditsReading`, `toEntry` / `toEntries`, `fromDocument`, `toDocument`, `entryAfterEdit`, `extraEditsReadingFor`.

**Still owed in this ADR:** `StoredEdit` → `ProposedEdit`, `toStoredEdit` → `toProposedEdit`. Until it lands, today's code still reads `toStoredEdit`.

**Two Document doors, two levels.** Public: `dataset.toJSON()` / `Dataset.fromJSON()`. Internal: `toDocument` / `fromDocument`. This plan names the function it changes; the ADR names the door a consumer calls.

## The Document

This ADR writes `meta` → `props` and takes `source` off `SerializedField`, and it spends **schema `6`**. [0012](../0012-optional-dates/README.md) already wrote **5**. [0013](../0013-what-decides-derivation/README.md) writes **7**. See [`../shared/rulings.md`](../shared/rulings.md).

- Readers 1–4 are deleted. Nothing outside this repo's fixtures was written by them.
- Unknown key inside `props` is passenger data and is kept. Unknown top-level key stays unknown.
- **`props` is carried by reference.** [0013](../0013-what-decides-derivation/README.md) bends D-S2-12 in one place, on a rolling-up parent, and says so where D-S2-12 is written.
- Key order: core keys in their fixed order, `props` last; inside `props`, the consumer's own order.
