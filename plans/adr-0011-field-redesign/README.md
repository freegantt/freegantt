# ADR 0011 — the consumer Field redesign

**Governing decision:** [`docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md`](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md) — status `proposed`, still a draft.

The ADR carries the reasoning. This file carries the shape, the order of work, the issues, and what is still undecided.

## The shape

### Today

```ts
const dataset = new Dataset<PlannerMeta, { owner?: string; progress?: number; phase?: number }>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },       // no dates: a zero-length span at the clock
 // { id: 't2', parentId: 'phase-1', name: 'Fit-out' },       // no dates on a 'span': InvalidInstantError
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      meta: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },      // source defaults to meta.owner
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', source: { from: 'compute', read: (entry) => rowNumber(entry.id) } },
  ],
});

(dataset.entries.get('t1')?.meta as PlannerMeta)?.phase   // a cast — three of them in harness/planner.ts
dataset.entries.update('t1', { meta: { owner: 'Sam' } })  // replaces: progress and phase are gone
```

### After

```ts
interface ConsumerEntryData {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<ConsumerEntryData>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },       // no dates, draws no bar
    { id: 't2', parentId: 'phase-1', name: 'Fit-out' },        // a 'span' may omit them too
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      data: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', compute: (entry) => rowNumber(entry.id) },
  ],
});

dataset.entries.get('t1')?.data.owner                     // 'Jo', typed by ConsumerEntryData
dataset.entries.fieldValue('t1', 'owner')                 // 'Jo', the same value read by key
dataset.entries.update('t1', { start: '2026-01-06', data: { owner: 'Sam' } })  // merges
```

**Dates are optional on every kind.** Nothing fills an absent date — no reference date, no clock
reading, no zero-length span. Write both dates or neither: one date without the other stays
`InvalidInstantError`. An Entry with no span draws no bar and still shows its grid row.

`phase` carries no declaration and needs none. Declare a Field when the library has a job to do with the value — a type, a rollup, a column, an editor. Editing is not one of those jobs: an undeclared key in `data` is writable through `update()` like any other.

The Field union is exclusive: a stored Field may roll up and may be edited, a computed Field may do neither.

```ts
type Field<TValue = unknown> =
  | { key: FieldKey; type?: FieldTypeName; rollUp?: AggregatorName; editable?: boolean;
      compute?: never; /* equals, compare, formatValue, parseValue, inputType, column */ }
  | { key: FieldKey; compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      rollUp?: never; editable?: never; /* compare, formatValue, column */ };
```

### Every change, in one table

| | today | after |
|---|---|---|
| Stored Entry | `meta?: TMeta` | `data: TData`, always present (`{}` when absent), like `segments` |
| `EntryInput` | `meta?: TMeta` | `data?: TData` — a record |
| `EntryEdit` | `meta?: TMeta`, **replaces** | `data?: DataEdit<TData>`, **merges** |
| `EntryDocument` | `meta?: TMeta` | `data?: TData` |
| Field address | `source: FieldSource`, three arms | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` — two, can disagree | `Dataset<TData>` — one |
| Internal `Entry` | `meta?: unknown`, needs a cast | `data: Readonly<Record<string, unknown>>`, reads as `unknown` |
| Rolling-up parent value | stored **and** written | stored, **never** written |
| `start` / `end` | required except on a rolling-up kind | optional on every kind |
| Schema | 4 | 5 |

**One key space, two homes.** Field keys stay in a single namespace — that is what lets one name serve `field` on a changeset row, `canWrite(entry, field)`, and `gridColumns: ['name', 'cost']`. Storage is namespaced underneath: core keys on the Entry, everything else in `data`.

## Fix before the redesign

One live defect in `main`, in code the redesign keeps. It is independent of the ADR, so it does not wait for the ADR to be accepted.

### A Field's own `column` keys lose to its `type` bundle's

`src/data/fields/field-registry.ts:60` (`mergeColumn`):

```ts
const sizing = own.width !== undefined || own.flex !== undefined ? own : from;
return { ...fromRest, ...ownRest, ...sizing };
```

When the Field states no `width` and no `flex`, `sizing` is the bundle's **whole** `column` object, not its sizing pair. Spread last, it overwrites every key the Field declared.

Probed at HEAD:

| bundle `column` | field `column` | resolves to |
|---|---|---|
| `{ header: 'Bundle', align: 'end', width: 100 }` | `{ header: 'Own' }` | `{ header: 'Bundle', align: 'end', width: 100 }` |
| `{ header: 'Bundle', align: 'end' }` | `{ header: 'Own' }` | `{ header: 'Bundle', align: 'end' }` |

The Field's own header is gone in both. The trigger is **the bundle declaring any non-sizing key the Field also declares** — not the bundle declaring a `width`. The second row proves that.

The function's own comment at `:47-49` states the opposite as its reason for existing:

> A Field naming only `column: { header }` [must not] drop the type's whole `column` bundle.

Latent today only because the one shipped `FieldType` carries no header of its own — `percent.column` is `{ align: 'end' }` (`field-types.ts:38`). Any consumer `fieldTypes` bundle that names a header reaches it.

**Fix:** spread the sizing **pair** only, never the whole object. `#249`'s rule stands as written — a Field that sizes itself at all replaces the type's sizing whole — and only the extraction of that pair is wrong.

**Test:** `field-registry.test.ts` needs three rows, not two — a bundle carrying both a header and a width, a bundle carrying no sizing at all (the second probe row above), and a Field that sizes itself over an already-sized bundle. The third pins #249's rule; the first two pin the fix.

## The work

Five groups of work and one of prose. The order is **A → B → C → D**, with F throughout and `mergeColumn` first. **Group E is dissolved**: each Document change lands in the group that causes it — the `data` rename and the `source` removal in A, the omission rule in C, the optional dates in D — because a separate serialization group invites writing the Document against rules that have not landed. Schema 5 is then a version bump at the end of D, not a work group. The real constraint follows: **there is no green commit between A and D**, because the Document version bumps once.

### A. The address rule, and the storage rename

The key decides the home, so no declaration carries one.

- `Entry.meta` → `Entry.data`, non-optional, filled `{}` at ingest. `EntryInput.data?: TData`. `EntryDocument.data?: TData`.
- `EntryEdit` restates `data?: DataEdit<TData>` rather than inheriting it — `Partial` reaches one level only, and cannot express a removal under `exactOptionalPropertyTypes`.
- Delete `FieldSource` and all three arms (`model/field.ts:44-47`), `Field.source`, `SerializedField.source` (`model/document.ts:40`), `data/fields/source-strategy.ts`'s strategy table, `normalize-source.ts`, `metaRecord` / `metaKey` / `metaSlot`, `DuplicateFieldSourceError`, `InvalidFieldSourceError`.
- Delete the `meta` core Field (`data/fields/core-fields.ts:109-112`) with **no successor**. A whole namespace is not a value a grid shows or a Rollup aggregates.
- `CoreFieldKey = keyof Omit<Entry, 'id' | 'data'>`, and the same exclusion in `CoreFieldValues`.
- The registry refuses `{ key: 'data' }`. That is the **one** reserved key — no reserved *set*, because a consumer key never sits at the top level of an edit or a `StoredEdit`, so `proposedKeys` needs no guard of its own.
- `'compute' in field` replaces `computeStrategy.serialize()` in `encodeFieldDocument`. Easy to miss: the strategy table is what keeps a `compute` Field out of the Document today, and its test goes with it.
- `view/capability.ts:132`'s `hasSomewhereToWrite` becomes `!('compute' in field)`.
- One generic. `harness/planner.ts:31` currently writes `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, whose two halves disagree about `critical` with nothing noticing.
- The two fixture record types are named after the slot rather than after the values: `PlannerMeta` (`fixtures/planner-dataset.ts:17`) and `DemoMeta` (`fixtures/demo-dataset.ts:162`) become `PlannerEntryData` and `DemoEntryData`. The page keeps its own domain word — a harness page names what it demonstrates. The rule this breaks is that the slot is not the concept, and the slot is what changes here.
- The registry's `authored` comment (`field-registry.ts:126-135`) states plugin values "sit in `Entry.meta`". One word changes; the guarantee does not.

### B. The merging patch

- `toStoredEdit` (`data/entry-reader.ts`) merges the `data` patch onto the Entry's own record, so a `StoredEdit` always carries a **complete** `data`.
- **The merge belongs on the read side, not the apply side.** `EditRequest.proposed` is documented as *"storage-shaped and complete, the same as `entries`"* — a plugin cascade compares proposed against current with no normalizing step. A partial `StoredEdit.data` would make every extender merge for itself, which is the harness-patches-the-library shape one layer down.
- `entryAfterEdit` (`data/fields/field-access.ts`) merges `data` rather than replacing it.
- An explicit `undefined` inside a patch clears that one key. It is the only way to say *remove*, and today's write path already reads it that way.
- An undeclared key inside a patch stays `UnknownFieldError`. That is the typo guard, and it is the only thing the rule buys — see Open 1.
- `diffEdit` emits one row per Field key, never a path into `data`. The whole-bag write that emits two rows for one value has nothing left to come from.

### C. A derived value never persists

One structural question — *is this a rolling-up kind, and is this a rolling-up Field?* — asked at four doors.

| Door | Answer | State |
|---|---|---|
| cell editor, bar drag | refused | already true (`view/capability.ts:119`) |
| `entries.update()` | refused | **the change** — move the `rollsUp` test into `data/`, where `rollsUp` already lives |
| `entries.add()`, `fromDocument` | value **dropped**, report raised | **the change** |
| `toDocument` | key **omitted** | **the change** |

- The report goes through `raiseError` at `severity: 'warning'` (ADR 0009), **always**. Not `isDevMode()`-gated: that flag resolves when *this repo* builds `dist/`, so a gated pass is eliminated from every consumer build (D-S5-41).
- Delete `reportCorrectedRollUps`. With no reproducible derived value in the Document there is nothing to correct.
- On a rolling-up parent, an Aggregator's `undefined` means **no value**, not "keep the stored value" — there is no authored value left to keep, and "keep" would mean keeping a stale derived answer.
- Nothing tracks what a pass produced, nothing compares values, and nothing depends on how many children a parent has right now. Three earlier designs died on that; the structural test is why this one does not.

### D. Optional dates, on every kind

- `Entry.start` / `Entry.end` and `EntryDocument.start` / `.end` all become optional — on every kind, a `'span'` included, not only on a rolling-up parent.
- Delete the `referenceDate` fill (`data/entry-reader.ts:168-172`) — a clock reading taken at construction and never saved, so an empty group reloads somewhere else. Nothing takes its place: an absent date stays absent, all the way to the Document.
- An Entry with no span draws **no bar** and still shows its grid row.
- Reaches further than one fill: bar geometry, the Segment invariant (*never empty*, #212), sort comparators, and `range: 'fitDataset'` each gain an absent case.
- `InvalidInstantError` keeps refusing an *unreadable* date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither.

### E. Document, schema 5

Four things change in the file: `meta` → `data`, `source` leaves `SerializedField`, `start`/`end` become optional, and a rolling-up parent's rolling-up keys are omitted.

- Readers 1–4 are deleted. Nothing has ever consumed this library, so no Document outside this repo's fixtures was written by them.
- **The reader's rules do not change**, and that is the point of keeping a namespace. An unknown key inside `data` is passenger data and is kept, exactly as an undeclared `meta` key is today. An unknown top-level key stays unknown. `plans/02-public-api.md:738` states this rule and survives in substance — *"anything of yours goes in `meta` and survives byte for byte; anything at top level belongs to the schema"* — with one word renamed. Its `progress` example (ADR 0008) is unchanged.
- **`data` is carried by reference, except on a rolling-up parent.** D-S2-12 says the namespace is never walked field by field. This bends it in exactly one place, for a stated reason. Say so where D-S2-12 is written down.
- Key order: core keys in their fixed order, `data` last; inside `data`, the consumer's own order. `serialization/index.ts`'s rule that `Object.keys` never walks a store entity stands, with that single exception.
- `toDocument → fromDocument → toDocument` is stable, because the structural test is a pure function of kind, hierarchy and declarations. Byte-identical round-trip of the *input* is not, for a rolling-up parent.

### F. Prose that states the old rule

Each of these says something the ADR makes false.

| File | What it says |
|---|---|
| `CLAUDE.md:33` | "`meta` is the consumer's namespace in the document" |
| `CLAUDE.md:60` | "an `entry`- or `meta`-sourced field has a stored home, so its aggregate is stored, undoable and serialized" |
| `CONTEXT.md:16` | "anything of the consumer's goes in `meta`" |
| `CONTEXT.md:64` | Field entry — `meta` listed as a Field, "no reach into `entry.meta`" |
| `CONTEXT.md:72` | the whole **Field source** glossary entry — deleted, and one entry for the `data` namespace is owed in its place. No glossary term names the consumer's own per-Entry values today, so every name built on the concept (the harness's `PlannerMeta`, the `TData` generic) is named after the storage key instead of after the thing |
| `plans/01:273-281` | the `FieldSource` type and its default |
| `plans/01:330` | "Source decides stored or computed" |
| `plans/02:454` | the same sentence again |
| `plans/02:738` | "anything of yours goes in `meta` and survives byte for byte" — the rule survives, the word does not |
| `plans/02:749` | `DuplicateFieldSourceError` and `InvalidFieldSourceError` rows |
| ADR 0005 | its `meta` rulings, superseded if this is accepted |

## Issues

### Closed by this work

| Issue | How |
|---|---|
| [#208](../../issues/208) | *`EntryInput` cannot carry a declared Field value.* The defect it names is that a page must know **where** a value lives to author it, and gets no warning when that knowledge goes stale: declare `source: { from: 'meta', key: 'budget' }` and `meta: { cost }` silently stops filling the Field. Deleting `FieldSource` removes the aliasing, so the key **is** the address and the failure cannot be expressed. **Its proposed shape is rejected**: the ADR rules `data: { cost: 1500 }`, not a flat `cost: 1500` on `EntryInput`, because ingest supplies a record while an edit patches one. Its first open question dissolves — an undeclared key inside `data` stays opaque. **Its second is unanswered — see Open 2.** |

### Related, and **not** closed

| Issue | Why it stays open |
|---|---|
| [#267](../../issues/267) | Typing `data` as a record removes the three `entry.meta as PlannerMeta` casts in `harness/planner.ts` — all three want a plain stored value and already narrow from `unknown`. It does **not** answer the issue: a `compute` Field owns no `data` key, so it stays unreachable at paint, and no declared `type` is applied. A Field-aware renderer read is still owed. |
| [#266](../../issues/266) | `meta` named four things — a storage location, a Field key, a `FieldSource.from` value, a Document key. Three go and the fourth is renamed. The issue's own subject, `Document` naming both the serialized Dataset and the DOM document, is untouched. |
| [#213](../../issues/213) | A `compute` write is dropped in silence. The ADR adds a registry refusal for `compute` beside `rollUp`/`editable`, which is **not** the fix — see the ordering constraint below. |
| [#270](../../issues/270) | A declining Aggregator leaves a stale rolled-up value. Independent, but the Document's re-read and the live store disagree until it is fixed, and this ADR makes that visible: a re-read runs the Aggregator again and answers "no value" while the store still answers `10`. The re-read is correct. |
| [#264](../../issues/264) | Core ships one Field type and its own Fields bypass the layer. The Field union here settles the shape a bundle attaches to; it ships no types. |
| [#214](../../issues/214) | `FieldContext` cannot reach a second Entry, so a `compute` Field cannot depend on the tree. The `compute` arm published here inherits the limit unchanged. |
| [#256](../../issues/256) | *One answer to "may this value change."* The ADR extends that ruling to a fourth door, `entries.update()`, which answers the opposite of `canWrite` today. Whether that lands under #256 or a new issue is a call for whoever picks it up. |
| [#242](../../issues/242) | `InvalidInstantError` is message-shaped because two fault families share one class. Group D changes what it guards, so the two overlap — do D first or the issue's fault families shift underneath it. |
| [#192](../../issues/192) | Closed, and its hazard returns one level down: install the S7 plugin on a Dataset whose `data` carries a legacy `progress`, and the plugin registers over values it did not write, with nothing recording who wrote them. `read.ts` rules the *declaration* case unrepairable; the *value* case has no rule. |

### Ordering constraints

1. **`mergeColumn` first.** It is live on `main` and independent of everything else here.
2. **The `compute` + `rollUp` registry refusal must land before [#213](../../issues/213)'s own fix.** Today a `compute` Field that also declares `rollUp` writes a phantom changeset row (`data/rollup.ts:213-214` pushes to `updated` before `writeOntoEntry`). Fix #213 first and the Rollup starts throwing instead.
3. **Group B before group C.** The refusal at `entries.update()` is written against the merged patch.
4. **Group D before [#242](../../issues/242).**

## Still open

Each of these changes something a reader can observe, so none can be settled silently during implementation.

1. ~~**May an undeclared key travel in a `data` patch?**~~ **Settled: yes.** The guard bought only a typo check, and it never covered `add()`. Group B must put undeclared `data` keys into `proposedKeys`, or an undeclared write produces no ChangeSet row and no undo step.
2. ~~**Does `entries.add({ data })` emit one `EntityAdded` row, or an added row plus a Field row for each key?**~~ **Settled: one `EntityAdded` row, carrying the whole Entry.** Per-Field rows would undo one user action in several steps, and they say nothing the added row does not already carry. This closes [#208](../../issues/208)'s second question.
3. **What an S7 plugin does when it meets a `progress` value it did not write.** #192 rules the declaration case unrepairable; the value case has no rule. Observable the first time the plugin is installed on saved data.
4. ~~**The schema number.**~~ **Settled: `5` now, `1` at release.** `5` keeps the count monotonic while the library is unreleased, so a stale local file fails loudly. The count restarts at `1` when the library first ships. Fixtures are regenerated by `toDocument`, never hand-edited.

## Blocking — settle before group A starts

Three questions, all deferred on 2026-09-08 and none dropped. Each changes something a reader can observe, so none may be settled silently during implementation.

### B1 — Where does a plugin's own Field value live?

**Deferred, not dropped.** Deferred on 2026-09-08, **not dropped**. Group A cannot start until this is answered, because it decides what `Entry.data` means and what its generic promises.

Today a plugin's Field values sit in the same bag as the consumer's, so `Entry.data` typed as the consumer's own interface is false the moment a plugin installs — a lie generic, which this repo forbids. Three answers, and the third is not in the ADR:

| | |
|---|---|
| **A — share `data`** | today's behaviour. `entry.data` is a lie generic; a plugin reads `unknown` through `fieldValue`; #192's value case stays unruled |
| **B — an `Entry.pluginData` sibling** | honest, but a third Entry key and a fourth Document key, duplicating a store that already exists |
| **C — the plugin's own store** | `src/data/plugin-store.ts` already ships `PluginStores`, `PluginStore<T>` and `PluginStoreView<T>`, wired into `DatasetState` and `build-commit-change-set.ts`. `PluginStoreName` is already a `StoreName`, a ChangeSet row already carries it, and `PluginDocument` already serializes it |

**How to settle it:** a grilling session, not a decision in passing. The reviewer must show **sample code for both callers under each option** — what an app author writes and reads, and what a plugin author writes and reads — before any option is chosen. Read the call sites, not the type diagram.

The same rule applies to every question below: **show the call site before you choose.**

### B2 — What does a `compute` Field show on a rolling-up parent?

A computed Field cannot roll up; the union forbids it. So on a group row, does `compute(entry, ctx)` run against the group Entry and show its answer, or does the cell stay empty?

If it runs, a `compute` Field reading `entry.data.cost` returns the group's **rolled-up** `cost` — a derived value reaching a computed Field through a door the union looks like it closed. If it does not run, a `ref: (entry) => rowNumber(entry.id)` Field goes blank on every group, which a consumer reads as a bug.

Held open on 2026-09-08 at the author's request, pending a clarification of what the Field is for. Settle it with sample code: one `compute` Field of each kind, and the group row beside the leaf row.

### B3 — What does an S7 plugin do with a `progress` value it did not write?

ADR 0011's Open 2, and [#192](../../issues/192)'s hazard one level down. Install the scheduling plugin on a Dataset whose `data` already carries a legacy `progress`, and the plugin registers over values it did not write, with nothing recording who wrote them. `read.ts` rules the *declaration* case unrepairable and throws `PluginSetupError`; the *value* case has no rule.

**Downstream of B1.** Option C there — a plugin's values in its own store — closes this at no extra cost, because a consumer's `progress` in `data` and the plugin's in `plugin:s7` cannot be confused. Answer B1 first, then see whether this is still a question.

The cost to weigh is asymmetry: the consumer gets typed reads from one generic, and under **A** the plugin author gets `unknown` and a registry lookup per read. **C** would also close ADR 0011's Open 2 (an S7 plugin meeting a `progress` value it did not write) at no extra cost, and would delete the ADR's *"Plugins and consumers share the `data` namespace"* consequence, which was recorded as today's behaviour rather than decided.

## Parked — do not design against this here

**Let the consumer decide how a value rolls up, in the Rollup callback, groups included.** An Aggregator is already a consumer-written function, but it only answers *what value* — never *whether this parent derives at all*, or *what a group does differently from any other rolling-up kind*. The escape hatches this ADR reaches for are all Field-wide or kind-wide: `rollUp: 'none'`, `rollUpKinds`, the deferred per-entry pin flag. A per-call answer from the Aggregator itself would cover all three and would give the refusal at `entries.update()` a documented way out.

Raised 2026-09-08, during this ADR's review. **It changes nothing in this plan.** Group C ships the blanket rule, and this is the shape of the escape hatch that comes after — a separate design with its own ADR. Written down so it is not rediscovered as a defect.

## Gate

**The prose sweep is mechanical, not a reading.** Section F lists what a person found. A person missed `plans/s2-data-core/s2.6-serialization.md:76`, which states the consumer rule in the old word. After group A, this must return nothing outside the ADR's own history:

```
grep -rn '\bmeta\b\|FieldSource\|source: {' plans/ docs/ src/
```

Keep the F table as well — it tells a reader what changed and why. The grep only proves nothing was missed.

`pnpm verify:full`, and its **last line** is the answer — `verify:full PASS — …` or `verify:full FAILED at check N of M: …`. Capture it with a redirect, never a pipe: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. A pipe makes `$?` read `tail`.

Review `harness/main.ts` and `harness/planner.ts` on every commit here, changed or not. The harness is the library's first consumer, and this redesign exists because its casts and its two disagreeing generics were the evidence.

## Naming already landed

`9c3f704` renamed the conversion family before this work started, so write against the current names: `toStoredEdit` / `toStoredEdits` (was `readEdit`), `toEditReading` / `toEditsReading`, `toEntry` / `toEntries`, `fromDocument` (was `readDocument`), `toDocument` (was `toJSON` inside `data/serialization`), `entryAfterEdit` (was `overlayStoredEdit`), `extraEditsReadingFor` (was `DatasetState.readExtenderEdits`). Result nouns kept their word: `EditReading`, `EntryReadContext`, `readers`, `entry-reader.ts`.
