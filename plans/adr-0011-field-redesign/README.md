# ADR 0011 — the consumer Field redesign

**Governing decision:** [`docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md`](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md) — status `proposed`, still a draft.

The ADR carries the reasoning **and every open decision**. This file carries the shape, the order of work, and the issues. [`api.md`](api.md) lists the call sites.

**Nothing undecided lives here.** Every open item is in [ADR 0011 § Blocking decisions](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md#blocking-decisions). Where an older line in this folder disagreed with that list, the ADR won — see [`conflict-log.md`](conflict-log.md).

The namespace is `props` — decision **17**, closed 2026-09-09. Closed decisions and their rulings live in [`closed-decisions.md`](closed-decisions.md); nothing open lives there.

## The shape

```ts
interface ConsumerEntryProps {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<ConsumerEntryProps>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },   // no dates, draws no bar
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      props: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', compute: (entry) => rowNumber(entry.id) },
  ],
});

dataset.entries.get('t1')?.props.owner
dataset.entries.fieldValue('t1', 'owner')
dataset.entries.update('t1', { start: '2026-01-06', props: { owner: 'Sam' } })  // merges
```

**Dates are optional on every kind.** Write both dates or neither. An Entry with no span draws no bar and still shows its grid row.

Declare a Field when the library has a job — a type, a rollup, a column, an editor. Whether *editing* is one of those jobs is decision **1**. A stored Field may roll up and may be edited; a computed Field may do neither.

| | today | after |
|---|---|---|
| Stored Entry | `meta?: TMeta` | `props: Readonly<Partial<TProps>>`, always present (`{}` when absent) |
| `EntryEdit` | `meta?: TMeta`, **replaces** | `props?: PropsEdit<TProps>`, **merges** |
| Field address | `source: FieldSource` | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` | `Dataset<TProps>` |
| Rolling-up parent value | stored **and** written to the Document | stored, **never** written to the Document |
| `start` / `end` | required except on a rolling-up kind | optional on every kind |
| Schema | 4 | 5 |

**`Partial` at every door.** `TProps` never claims a key exists. `Readonly<TProps>` beside an ingest fill of `{}` is a required-key lie.

**One key space, two homes.** Field keys stay in one namespace. Storage is namespaced underneath: core keys on the Entry, everything else in `props`.

The `harness/main.ts:89` double cast is **not** this ADR: `hierarchy.ts:28` pins the shared global to a concrete `Dataset`. Declare that global as the bare `Dataset` today, independently.

## Fix before the redesign — done 2026-09-09

`mergeColumn` now spreads `sizingPairOf(…)` — the `width`/`flex` pair alone — instead of the whole type-bundle column. Four test rows in `field-registry.test.ts`. `verify:full PASS — all 16 checks green, test:e2e included`. Independent of the ADR; cherry-picks to `main`.

## The work

Five groups of work and one of prose. Order is **A → B → C → D**, with F throughout. **Group E is dissolved**: each Document change lands in the group that causes it. Schema 5 is a version bump at the end of D.

**There is no green commit between A and D on this branch**, because the Document version bumps once. `pnpm verify:full` runs green before the PR merges.

**Reconsider that, and it is cheap to reconsider.** The stated reason is one version bump. But this section's own line says readers 1–4 are deleted and nothing outside this repo's fixtures was written by them, so a version number costs nothing to spend. Bump the schema **per group** and keep every group green. What that buys is a reviewable branch: A renames about 101 references and 184 occurrences, D makes dates optional across bar geometry, the Segment invariant, sort comparators and `fitDataset`, and a reader cannot check either against a running build. The risk here is review, not compatibility.

**What gates what.** Decisions **9**, **12**, **18** and **19** gate **A**. Decision **1** gates **B**. Decisions **5** and **8** gate **C**.

**Decision 12 gates A, not the schema bump, and an earlier line put it in the wrong place.** It said 12 and 17 are "decided before schema 5 is written", and schema 5 bumps at the end of D. But group **A** renames `Entry.meta` and writes the Document key. A marker decided after A is a second rename of the same files. 17 is closed. 12 is answered **before A starts**.

**9 and 12 are one decision.** 9's case for sharing `props` rests on `entry.props.progress` reading as a typed dot access; 12's plugin prefix takes the dot away. Answering them apart cancels both answers.

### A. The address rule, and the storage rename

The key decides the home, so no declaration carries one.

- `Entry.meta` → `Entry.props`, non-optional, filled `{}` at ingest. `Entry.props: Readonly<Partial<TProps>>`. Input and Document keep `props?`.
- Edit types are in the ADR. Do **not** write `Partial` on either half. **Do not factor the two halves into one shared mapped type either.** That was tried, shipped into these documents as `EditOf`, and found wrong in *both* directions on the next pass: it protected a required key inside `props` that the storage door already allows absent, and it let `update(id, { kind: undefined })` compile. The two halves take **opposite** rules, so there is no shared type to extract. They look factorable, which is why this line exists. `PropsEdit<TProps>` maps every key removable. `EntryEdit` may remove only what a stored Entry may lack — derived from `Entry`. **The derivation is inert until group D.** `model/entry.ts:31,33` ship `start` and `end` as **required**, so at HEAD `RemovableEntryKey` resolves to `'parentId' | 'meta'`, not to `'parentId' | 'start' | 'end'`. The ADR called that a HEAD probe and it was a group-D probe. So `update(id, { start: undefined })` does not compile between A and D. Either pull the optional dates forward into A, or say the un-date verb arrives with D. Seven type tests. `PropsEdit` is exported; `EntryEnvelope` and `RemovableEntryKey` are not.
- **`segments: undefined` is refused.** `Entry.segments` is required (*never empty*, #212). Un-dating is `{ start: undefined, end: undefined }`.
- Public plugin generics lose the second type parameter: `DatasetPlugin`, `DatasetPluginContext`, `DatasetOptions`, `Dataset.fromJSON`.
- The harness cast is not group A’s. Declare `window.__dataset` as the bare `Dataset` first.
- **`StoredEdit` → `ProposedEdit`, with serena.** About 184 occurrences. Lands in A because A already renames the type’s own field.
- `change-set.ts`’s `fieldsWrittenBy` still skips `'meta'`. `isOptionalEntryKey` still names it. Both follow the rename.
- Delete `#mergeCoreFieldOverride`, `#consumerOverriddenCoreKeys`, `CORE_FIELD_OVERRIDABLE_KEYS`, `illegalCoreOverrideKey`. A consumer declaration on a core key falls through to `DuplicateFieldKeyError`. **Answer decision 19 first** — the deletion now removes a data-level capability that `interactions.edit` cannot replace.
- **One write resolver in `data/`, and every door calls it.** Three rules meet at one question — is this Field derived here, is it editable, does it exist. `entries.update()` refuses a derived write (`DerivedFieldNotWritableError`) and an uneditable one (`FieldNotEditableError`), and `view/capability.ts` calls the resolver instead of restating the rule. **Do not write the test twice.** Seven doors, one function.
- **`Field.editable: false` refuses `entries.update()`** — ruled 2026-09-09, and it answers the old ordering constraint 7. Verified: `editable` is read at `view/capability.ts:120` and nowhere else in `src/`. What an *absent* `editable` does is decision **18**.
- **`CoreFieldValues` omits `'props'` alongside `CoreFieldKey`.** `model/field.ts:19` is `Omit<Entry, 'id'>` and `FieldValue` resolves its first arm against it. Change one and not the other, and `fieldValue(id, 'props')` types as the whole bag while the runtime throws. It is public at `api/index.ts:57`.
- **`mergeEntryEdits` merges `props` per key.** `data/edit-extension.ts:38` shallow-spreads two `EntryEdit`s. With consumer keys inside `props`, two extenders writing different `props` keys lose one — #197 one level down, against that function's own stated promise (#238).
- **Write `ProposedEdit`'s type; do not only rename it.** `props` is **required** on a `ProposedEdit`, because `toProposedEdit` builds a complete record. `model/entry.ts:108` is a bare `Partial` today, so the guarantee is prose. Note in the same place that a complete record and a patch are now the same shape, so `model/entry.ts:98`'s stated asymmetry no longer holds at `props`.
- Two ingest warnings, one `Object.keys(input)` walk per Entry against `CORE_FIELDS` plus `'props'`: unknown top-level key; a key inside `props` that names a core key. Decision **12** may promote the second from warning to error.
- Delete `FieldSource` and all three arms, `Field.source`, `SerializedField.source`, `source-strategy.ts`, `normalize-source.ts`, `metaRecord` / `metaKey` / `metaSlot`, `DuplicateFieldSourceError`, `InvalidFieldSourceError`.
- Delete the `meta` core Field with **no successor**.
- `CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>`. The registry refuses `{ key: 'props' }` — the **one** reserved key.
- `'compute' in field` replaces `computeStrategy.serialize()` in `encodeFieldDocument`.
- `view/capability.ts`’s `hasSomewhereToWrite` becomes `!('compute' in field)`.
- One generic. `harness/planner.ts:31` currently writes two that disagree about `critical`.
- Rename fixture types: `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`.
- The registry’s `authored` comment states plugin values sit in `Entry.meta`. One word changes unless decision **9** lands on the plugin store, which deletes the sentence.

### B. The merging patch

Written in the new names: `toProposedEdit`, `ProposedEdit`.

- `toProposedEdit` merges the `props` patch onto the Entry’s own record, so a `ProposedEdit` always carries a **complete** `props`. The merge belongs on the read side, not the apply side.
- `entryAfterEdit` merges `props` rather than replacing it.
- An explicit `undefined` inside a patch clears that one key.
- `diffEdit` emits one row per Field key, never a path into `props`.

**Decision 1 gates the rest of this group.** If an undeclared key may travel in a patch, three edits ship together or the write is silent (no ChangeSet row, no undo, no subscriber):

- **a.** Seed `proposedKeys` from inside `props`, not only from top-level keys.
- **b.** `diffEdit` keeps the registry walk for row order, then drains undeclared keys in the proposed set.
- **c.** `entries.fieldValue` and `ctx.read` answer `entry.props[key]` for an undeclared key — `undefined` if nothing holds it.

If decision **1** lands as the ADR recommends — `update()` throws, ingest still carries — skip a–c. `UnknownFieldError` stays on the top level of an edit either way.

### C. A derived value never persists

One structural question at every door: *is this a rolling-up kind, and is this a rolling-up Field?* I14 is the **write** half. `toJSON` is not a write.

| Door | Answer | State |
|---|---|---|
| cell editor, bar drag | refused | already true (`view/capability.ts:119`) |
| `entries.update()` | refused | **the change** — move `rollsUp` into `data/` |
| `entries.add()`, `new Dataset({ entries })`, `fromJSON` | value **dropped**, report raised | **the change** |
| the extension hook | **decision 5** | not refused, by where the guard sits |
| autoGroup promotion | dates change owner mid-commit | **unowned until now** |
| `toJSON` | key **omitted** | **the change** |

- Promotion is the third door into a rolling-up kind. Conversion **promotes and demotes**, and stays automatic. What demotion returns to is decision **8** — answer before this group, because omission turns a stale `'group'` into a row with no dates and no bar.
- **Demotion is what a childless rolling-up parent gets, not a dateless row.** An earlier draft of this line said such a parent keeps no dates and draws no bar. That was the promote-only consequence, and the conversion demotes now. It also mis-tied the case to #270: that issue is a **declining Aggregator that saw children** (ADR *One finding this exposes*), and a childless parent never reaches an Aggregator at all. #270 stands on its own and demotion does not touch it.
- The report goes through `raiseError` at `severity: 'warning'`, **always**. Not `isDevMode()`-gated (D-S5-41).
- Delete `reportCorrectedRollUps`.
- On a rolling-up parent, an Aggregator’s `undefined` means **no value**.
- One report per operation, not per value.

### D. Optional dates, on every kind

**An Entry has dates if and only if it holds at least one Segment**, and `start`/`end` are always the envelope.

- `add({ start, end })` mints one Segment.
- `add({ segments })` with no dates derives the envelope.
- `add({})` stores no dates and no Segments.
- `update(id, { start: undefined, end: undefined })` is the un-date verb; it clears the Segments.
- Two refusals stay: one date without the other, and `segments: []` (`EmptySegmentsError`).
- `start` and `end` join `isOptionalEntryKey`. Serialization and `entry-reader.ts` each gain a `length === 0` arm.
- `FieldContext.durationOf` returns `Duration | undefined`. It is **plugin-author surface**, so it is a published change, and it reaches further than the signature. An audit found this list after a review named two call sites and got one of them wrong — do not re-derive it:
  - `core-fields.ts:118` — the shipped **`duration` core Field** reads `ctx.durationOf(entry)` in its `compute` arm, so the `duration` **column answers `undefined` on a dateless row**. That is the consumer-visible half, and **the cell is blank with no code written for it**: `formatValue` is `formatDuration`, which already answers `''` for `undefined` (`core-fields.ts:44-45`). Assert the blank cell. Do not invent an em dash or a placeholder.
  - `field-access.ts:92` — the canonical implementation.
  - `aggregators.ts:14` (`durationMs`, behind `weightedMeanByDuration` at `:51`) — skips a dateless child rather than weighting it at zero.
  - `inline-editing.ts:113` is a **provider, not a caller**: `fieldContextFor` builds a `FieldContext` and supplies its own `durationOf`. It changes as an implementation. **This is the one the review got wrong.**
  - `etc/freegantt.api.md` — the API report gates on I11, so the signature lands there or CI fails.
  - Four test stubs build a `FieldContext` by hand: `layout/rows/filter.test.ts`, `layout/rows/sort.test.ts`, `data/fields/field-types.test.ts`, `data/fields/field-access.test.ts`.
- Delete the `referenceDate` fill (`entry-reader.ts:168-172`). Written down under D-S2-10 **and** D-S2-22. Not under D-S5-46, which survives.
- Reaches bar geometry, the Segment invariant (#212), sort comparators, and `range: 'fitDataset'`.
- A dateless Entry sorts **last**. A dateless row is inert to a gesture. `fitDataset` over nothing dated shows the empty-dataset range. An S7 link to a dateless endpoint raises a diagnostic and draws nothing.

### E. Document, schema 5 — lands inside A, C and D

Not a work group. Four file changes: `meta` → `props`, `source` leaves `SerializedField`, `start`/`end` optional, rolling-up keys omitted. Schema 5 bumps at the end of D.

- Readers 1–4 are deleted. Nothing outside this repo’s fixtures was written by them.
- Unknown key inside `props` is passenger data and is kept. Unknown top-level key stays unknown.
- **`props` is carried by reference, except on a rolling-up parent.** Bend D-S2-12 in that one place, and say so where D-S2-12 is written.
- Key order: core keys in their fixed order, `props` last; inside `props`, the consumer’s own order.
- `toJSON → fromJSON → toJSON` is stable. Byte-identical round-trip of the *input* is not, for a rolling-up parent.

### F. Prose that states the old rule

Group F may edit locked specs (`plans/00`–`02`, `CLAUDE.md`, `CONTEXT.md`). `protect-spec.sh` asks for permission. Confirm before this group runs.

| File | What it says |
|---|---|
| `CLAUDE.md:33` | "`meta` is the consumer's namespace in the document" |
| `CLAUDE.md:60` | "an `entry`- or `meta`-sourced field has a stored home, so its aggregate is stored, undoable and serialized" |
| `CONTEXT.md:16` | "anything of the consumer's goes in `meta`" |
| `CONTEXT.md:64` | Field entry — `meta` listed as a Field, "no reach into `entry.meta`" |
| `CONTEXT.md:72` | the whole **Field source** glossary entry — deleted; one entry for `entry.props` is owed. `props` collides with no layer name, so no disambiguation rule is owed — that rule existed only for the rejected `data` (decision 17) |
| `plans/01:273-281` | the `FieldSource` type and its default |
| `plans/01:330` | "Source decides stored or computed" |
| `plans/02` §2.6 | the same rule; `:454` reads *"Source decides what happens to a parent's aggregate"* |
| `plans/02:738` | "anything of yours goes in `meta` and survives byte for byte" — the rule survives, the word does not |
| `CONTEXT.md:127` | names `DataEdit` and its `data` key from this ADR — both renamed (`PropsEdit`, `props`) |
| `plans/02:749` | `DuplicateFieldSourceError` / `InvalidFieldSourceError` leave; `DerivedFieldNotWritableError` / `ComputedFieldCannotBeWrittenError` / `FieldNotEditableError` arrive. `RollUpKindsWouldDropValuesError` if decision **6** refuses. `PluginFieldNotInDataError` if decision **9** lands on the store. `EmptySegmentsError` already ships |
| `plans/02` §"common case is a shorthand" | `update('t1', { start, cost })` stops compiling unless decision **11** keeps a declared-key flat spelling |
| `plans/02` Document section | a Document is our **save format**, not an interchange format |
| `plans/02` type rows | `PropsEdit<TProps>` and `EntryEdit<TProps>` are public |
| `plans/s2-data-core/s2.6-serialization.md:76` | consumer rule in the old word |
| `plans/s2-data-core/README.md` | D-S2-22’s precedence clause; D-S2-10 / D-S2-22 `referenceDate` fill; D-S2-7’s `meta` carve-out |
| `plans/s4-hierarchy-and-rows/README.md` | D-S4-35 / Q17, and the whole-`meta` write row |
| `plans/s4-hierarchy-and-rows/s4.1-field-registry.md` | D-S4-2’s adapter |
| `plans/02-01-API-Redo.md` | already opens with *"This review is a stale."* Say **superseded by ADR 0011** in the same line |
| ADR 0005 | its `meta` rulings, superseded if this is accepted |

## Issues

### Closed by this work

| Issue | How |
|---|---|
| [#208](../../issues/208) | *`EntryInput` cannot carry a declared Field value.* Deleting `FieldSource` removes the aliasing, so the key **is** the address. Its proposed flat `cost: 1500` on `EntryInput` is rejected: ingest supplies a record. `add({ props })` emits **one `EntityAdded` row** (decision **2**). Whether an undeclared key is writable on `update()` is decision **1**, still open. |

### Related, and **not** closed

| Issue | Why it stays open |
|---|---|
| [#267](../../issues/267) | Typing `props` as a record removes the three `entry.meta as PlannerMeta` casts in `harness/planner.ts`. A `compute` Field owns no `props` key, so it stays unreachable at paint. A Field-aware renderer read is still owed. |
| [#266](../../issues/266) | Three of `meta`’s four meanings go; the survivor is renamed. The `Document` / DOM collision is untouched. |
| [#213](../../issues/213) | A `compute` write is dropped in silence. The registry refusal for `compute` beside `rollUp`/`editable` is **not** the fix — see ordering constraint 2. |
| [#270](../../issues/270) | A declining Aggregator leaves a stale rolled-up value. After group C a re-read answers "no value" while the live store still answers `10`. The re-read is correct. |
| [#264](../../issues/264) | The Field union settles the shape a bundle attaches to; it ships no types. |
| [#214](../../issues/214) | `FieldContext` cannot reach a second Entry. The `compute` arm inherits the limit. |
| [#256](../../issues/256) | The ADR extends "may this value change" to `entries.update()`. |
| [#242](../../issues/242) | Group D changes what `InvalidInstantError` guards. Do D first. |
| [#192](../../issues/192) | Closed, and its hazard returns one level down. Decision **7** / **12**. |

### Ordering constraints

1. **`mergeColumn` first.** Done.
2. **The `compute` + `rollUp` registry refusal must land before [#213](../../issues/213)’s own fix.**
3. **Group B before group C.** The refusal at `entries.update()` is written against the merged patch.
4. **Group D before [#242](../../issues/242).**
5. **Decision 9 before group A. Decision 5 before group C.** Neither is a question the implementer may answer in passing.
6. **[#270](../../issues/270) before or with group C.**
7. **Answered 2026-09-09: it does not, and the ruling is that it must.** `editable` is read at `view/capability.ts:120` only. The gate moves into `data/` in group A.
8. **Decisions 18 and 19 before group A.** 18 sets the default posture of `entries.update()`. 19 replaces the deleted core-key gate.
9. **Decisions 9 and 12 are answered together, before group A.**

## Parked — do not design against this here

**Let the consumer decide how a value rolls up, in the Rollup callback, groups included.** Group C ships the blanket rule. A per-call Aggregator answer is a later ADR. Decision **6**’s second half asks whether a per-entry flag should replace `rollUpKinds`; that question lives in the ADR, not here.

## Gate

The prose sweep is mechanical. Keep the F table — it tells a reader what changed. The grep only proves nothing was missed.

Scope it to the live surface. ADR 0006 rules that an ADR is superseded, never edited, so history keeps the old word.

```
grep -rn '\bmeta\b\|FieldSource\|source: {' src/ harness/ CONTEXT.md CLAUDE.md \
  plans/00-overview.md plans/01-domain-architecture.md plans/02-public-api.md \
  | grep -v 'import\.meta'
```

Live spec is `plans/00`–`04` only. This grep returns **453** at HEAD and must return **0** after group A.

`pnpm verify:full`, and its **last line** is the answer. Capture it with a redirect, never a pipe: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`.

Review `harness/main.ts` and `harness/planner.ts` on every commit here, changed or not.

## Naming already landed

`9c3f704` renamed the conversion family. Write against: `toStoredEdit` / `toStoredEdits`, `toEditReading` / `toEditsReading`, `toEntry` / `toEntries`, `fromDocument`, `toDocument`, `entryAfterEdit`, `extraEditsReadingFor`.

**Still owed in group A:** `StoredEdit` → `ProposedEdit`, `toStoredEdit` → `toProposedEdit`. Until A lands, today’s code still reads `toStoredEdit`.

**Two Document doors, two levels.** Public: `dataset.toJSON()` / `Dataset.fromJSON()`. Internal: `toDocument` / `fromDocument`. This plan names the function it changes; the ADR names the door a consumer calls.
