---
status: proposed — draft, not a decision. Revised twice: once after adversarial review, once after the ruling changed from flat properties to a kept namespace. Supersedes ADR 0005's `meta` rulings if accepted.
decided: a Field key is the whole address, so `FieldSource` retires; consumer values keep a namespace and it is renamed `data`; a derived value never persists; a rolling-up parent's rolling-up Field is not editable; the Document is a save format rather than an interchange format.
---

# Consumer values live in `data`, and a derived value never persists

ADR 0005 gave a consumer Field a declaration and left it without a home. `FieldSource`'s stored arm is `{ from: 'entry'; field: CoreFieldKey }`, and `CoreFieldKey` is `keyof Omit<Entry, 'id'>`. A consumer who writes `source: { from: 'entry', field: 'cost' }` gets a type error. So every consumer value lands in `meta`, and ADR 0005's own promise — *`'start'` and `'cost'` go through one code path* — is true of the declaration and false of the storage. The half a consumer cannot reach is the half that works.

The bag then pays for itself twice over. `update('t1', { cost: 7 })` merges and keeps `owner`; `update('t1', { meta: { cost: 7 } })` replaces and drops it. Both compile, and the destructive one reads better in English. A `meta` holding an array is replaced by an object, because `metaRecord` answers `{}` for an array. Two generics name the same set of values and nothing links them — `harness/planner.ts:31` writes `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, where the two disagree about `critical`, and neither the compiler nor the runtime notices. Every read of a `meta` Field allocates, because `metaStrategy.read` spreads the bag before one property lookup. And `meta` names four things at once (#266): a storage location, a Field key, a `FieldSource.from` value, and a Document key.

**A Field key is the whole address.** `{ key: 'cost' }` reads and writes `entry.data.cost`. `{ key: 'start' }` reads and writes `entry.start`, because `start` is a core key. Nothing declares a `source`: the key decides the home, and which home that is stays the library's business. `FieldSource` retires with all three arms — a Field either stores at its own key or declares `compute` and stores nowhere. **Declaring a key does not create it; declaring says what the library may do with it.**

**Consumer values keep a namespace, and it is named `data`.** One key space, two homes. Field keys stay in a single namespace, which is what lets one name serve `field` on a changeset row, `canWrite(entry, field)`, and `gridColumns: ['name', 'cost']`. Storage is namespaced underneath: the core keys sit on the Entry, and every other Field's value sits in `data`. So a consumer key cannot shadow a core key, a core key added in a later release cannot land on a consumer's value, and the Document reader keeps the rule it has today rather than inverting it. `meta` is renamed on `Entry`, `EntryInput` and `EntryDocument`; the `meta` core Field is deleted with no successor, because a whole bag is not a value a grid shows or a Rollup aggregates.

**An edit carries the Entry's own shape, and `data` merges.** `entries.update(id, { start: '2026-01-06', data: { owner: 'Sam' } })` writes one date and one consumer value, and keeps every other key in `data`. Nesting is not what makes today's write destructive; **replacing** is. Merging is the whole fix, and it is one rule at one door: `toStoredEdit` reads a patch into a complete `data` record, the same way it already reads a loose date into an `Instant`. Nothing is applied there — `StoredEdit` is documented as storage-shaped and complete, and this keeps it so. `metaStrategy.write` already reads the Entry's own bag as the base, so the merge exists and only moves. Ingest supplies a record and an edit patches one, so `data` is `TData` on `EntryInput` and `Partial<TData>` on `EntryEdit`, and the types say which door is which. An explicit `undefined` inside a patch clears that one key — the only way to say *remove*, and the way today's write path already reads it.

**A rolling-up Field on a rolling-up parent refuses the write.** `view/capability.ts` already answers this for gestures: `isRollUpKind(entry.kind) && rollsUp(field)` returns `DERIVED`, so the cell editor and the bar drag both refuse. `entries.update()` answers the opposite, and the result is a value that commits, emits a changeset row, enters undo — and then reverts in silence the next time anything touches the subtree. Probed: `update('p', { cost: 999 })` stores `999`, and an unrelated rename of a child puts it back to `10`. **One question, one answer, at both doors** (I14). The rule moves into `data/`, where `rollsUp` already lives, and `view/capability.ts` asks the same source it asks today.

**A rolling-up parent with no children has no dates, and draws nothing.** `entry-reader.ts:170` gives it a zero-length span at `referenceDate` today — a clock reading taken when the Dataset was built, never saved, so an empty group reloads somewhere else. There is no honest value to invent. **`Entry.start` and `Entry.end` become optional on every kind**, not only on a rolling-up parent: an author adds a row now and dates it later, which is ordinary use, and the current `InvalidInstantError` for a dateless `'span'` refuses it. An Entry with no span draws no bar and still shows its grid row. This reaches further than one fill: bar geometry, the Segment invariant (*never empty*, #212), sort comparators and `range: 'fitDataset'` each gain an absent case.

**A derived value lives in the store and never reaches the Document.** The Rollup writes a parent's `start`, `end` and `cost` today, and `toJSON` writes all three out as though a person authored them. `fromJSON` reads them back and the Rollup overwrites them. When the stored answer and the written one disagree, the written one loses in silence: a parent `cost: 999` over a child `cost: 10` imports as `10`, with no warning and no `rollup-corrected` report — that pass compares `start` and `end` only. **A value the Rollup would reproduce exactly is not written.** A stale derived value stops being possible rather than being detected.

The two rulings hold each other up. The refusal means nothing but the Rollup can put a value in a rolling-up parent's cell, so omitting it loses nothing a person authored. Without the refusal, omission drops user edits.

## Example

```ts
interface PlannerData {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<PlannerData>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },
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

dataset.entries.get('t1')?.data.owner          // 'Jo' — typed by PlannerData
dataset.entries.fieldValue('t1', 'owner')      // 'Jo' — the same value, read by key
dataset.entries.update('t1', { start: '2026-01-06', data: { owner: 'Sam' } })
```

`phase` carries no declaration. It is a value the consumer wrote at ingest and a bar renderer reads. It needs no type bundle, no rollup, no editor and no column, so it needs no Field. **Declare a Field when the library has a job to do with the value, not to make the value exist.** Being editable is one of those jobs — see the ingest/update rule below, which is the price of this simplification and has to be taught with it.

The Field union is exclusive. A stored Field may roll up and may be edited; a computed Field may do neither.

```ts
type Field<TValue = unknown> =
  | { key: FieldKey; type?: FieldTypeName; rollUp?: AggregatorName; editable?: boolean;
      compute?: never; /* equals, compare, formatValue, parseValue, inputType, column */ }
  | { key: FieldKey; compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      rollUp?: never; editable?: never; /* compare, formatValue, column */ };
```

The union is a declaration-site aid, not the enforcement. `FieldRegistry`, `DatasetOptions.fields` and `FieldLookup` all hold bare `Field`, so excess-property checking fires only where a literal is written. `FieldRegistry` throws `ComputedFieldCannotStoreError` for `compute` beside `rollUp` or `editable`, the same way it already throws `UnknownAggregatorError`. It is a named `FreeGanttError` with a `code:` and a `plans/02` §7 row, like every other.

The name is `compute`, not `get`. Read the call site aloud: *"field `ref`, compute a row number from the entry."* `get` already names three unrelated jobs here — `entries.get(id)`, `FieldLookup.get(key)`, `registry.get` — and `compute` keeps the vocabulary `source: { from: 'compute' }` already teaches.

## The flow, once

`dataset.entries.update('t1', { data: { progress: 60 } })`, on a child of a rolling-up phase:

1. **Read.** `toStoredEdit` normalizes dates through `time/` and merges the patch onto the Entry's own record, so a `StoredEdit` always carries a complete `data`. An undeclared key in the patch is `UnknownFieldError`, unchanged.
2. **Extend.** The extension hook runs once. A plugin's cascade returns more `EntryEdit`s, read through the same door.
3. **Diff.** `diffEdit` emits one row: `{ store: 'entries', id: 't1', field: 'progress', from: 40, to: 60 }`. The row names a Field key, never a path into `data`, so unwrapping the patch is the whole difference the namespace makes here. Today a whole-`meta` write emits two rows for one value — one for `meta` itself, one for the key inside it. The `meta` Field is deleted, so the second row has nothing left to come from.
4. **Roll up.** The pass walks ancestors, runs `weightedMeanByDuration`, and writes `phase-1`'s `progress` into the store.
5. **Commit.** One changeset holds the child row and the parent row. One undo step reverses both.
6. **Write.** `toJSON` omits a rolling-up kind's rolling-up keys. `phase-1` is written without `progress`, `start` and `end`.
7. **Read back.** `fromJSON` reads the core keys by name and carries `data` across, undeclared keys included. The construction Rollup fills `phase-1`. There is nothing to correct and nothing to warn about.

**Step 6 asks one structural question.** Is this Entry a rolling-up kind, and is this a rolling-up Field? Then the value is derived, and it is not written. Nothing compares values, nothing tracks what a pass produced, and nothing depends on how many children a parent has right now.

That test is the same one `view/capability.ts:119` already asks to refuse the cell editor and the bar drag. **One question, asked at four doors**: the editor, the drag, `entries.update()`, and `toJSON`.

| Door | Answer |
|---|---|
| cell editor, bar drag | refused today (`view/capability.ts:119`) |
| `entries.update()` | refused — the change this ADR makes |
| `entries.add()`, `fromJSON` | value **dropped**, with a report raised |
| `toJSON` | key **omitted** |

**An authored value on a derived cell is dropped, and the library says so.** A consumer who writes `{ id: 'p', kind: 'group', data: { cost: 500 } }` gets no `cost` on `p`. Keeping it needs a second storage slot beside the derived value — a shadow copy of one Field, which is the old bag again under a worse name. Echoing it back on `toJSON` is worse still: the moment a child changes, the echoed number is a wrong answer wearing an authored value's clothes. Dropping it is the only option that cannot lie.

**The report is not dev-gated.** `reportCorrectedRollUps` was gated on `isDevMode()` until S5.12, and that flag resolves when *this repo* builds `dist/` — so the whole pass was eliminated from every consumer build and no consumer ever saw a line of it (D-S5-41). This report goes through `raiseError` at `severity: 'warning'` (ADR 0009), always, with `console.warn` behind it only when nothing is subscribed to `error`.

**One finding this exposes, tracked as #270.** `rollup.ts:208` skips a declining Aggregator **that saw children** — a childless parent never reaches an Aggregator at all (`rollup.ts:184,191` skip it first). So a parent whose children stopped supplying values keeps the last answer the Aggregator produced. Once the Document omits derived values, a re-read runs the Aggregator again and answers "no value" while the live store still answers `10`. The re-read is correct.

## Considered options

- **Flat consumer properties on the Entry, in one key space with `start`.** This was the previous draft's ruling, and it is rejected. Its one gain is a single storage home. It charges for that at four other places: the Document reader's unknown-key rule inverts, so an unknown top-level key becomes consumer data; three reserved name sets appear at three doors, `StoredEdit`'s own `proposedKeys` among them; an older file whose consumer key a later release promotes to a core key needs a migration door of its own; and the internal `Entry` lists the core keys while the runtime object also carries `owner` and `phase`, which only an index signature closes — and that signature makes `entry.strat` compile. A namespace costs one indirection and pays all four back.
- **Flat consumer keys on the edit alone, with `data` everywhere else.** Rejected, and it was this draft's own first answer. It saves one unwrap at the differ and costs a shape: `data` would name the namespace at ingest, on the stored Entry and in the Document, and not on the object a consumer writes most often. The safety it looked like it bought is bought by merging instead.
- **Keep the namespace under its current name, `meta`.** Rejected. `meta` names four things (#266), and three of them go here; keeping the word for the survivor keeps the ambiguity in the glossary for no gain. It is also the wrong word: "meta" says *about the data*, and the contents are the data.
- **Keep the namespace in the Document only, with flat runtime entries.** Rejected. The runtime shape and the Document shape would then disagree about where a value lives, so the reader and the writer would each move every consumer key across a boundary, and every seam between them would have to know which side it stood on.
- **Keep `meta` and open `FieldSource`'s entry arm to any key (the small fix).** Rejected: it leaves the declaration carrying an address the library should own, so the three-arm strategy table, the second generic and the whole-bag write all survive. The bag stops being mandatory and stays available, which is the worst of both.
- **Read consumer values through an accessor and never store them.** Rejected. Reads alone would carry four of the planner's five fields, and a Gantt whose grid edits, undoes and aggregates a consumer value has to hold it.
- **A nested accessor path (`accessor: ['finance', 'approved']`).** Deferred. It costs a compiled reader, an immutable path writer, path equality, undo through a path and a Document rule, and a Gantt has no case for it yet. The Field key names the value; `column.header` names what a reader sees. It is an additive optional key whenever a real consumer needs one.
- **Record what the Rollup wrote, and omit that set.** Rejected — see the table above. It needs a cumulative set that no `ChangeSet` can carry and that five reachable seams invalidate.
- **Persist derived values and report a correction on import.** Rejected: it keeps a value whose meaning depends on declarations that may not travel with it. Generalizing `reportCorrectedRollUps` past `start`/`end` would find the disagreement; not writing the value stops the disagreement existing.
- **Let a rolling-up parent cell be edited, and distribute the value down to the children.** Rejected as a default. It is a real model — a comparable data grid ships `groupRowEditable` with a value setter and distribution strategies — but a distribution rule is a per-Field policy with no defensible default (split evenly? by duration? by current share?). Refusal is the honest answer until a consumer names the policy.
- **Let a per-entry flag turn derivation off, so the write sticks.** Deferred, and it is the escape hatch a comparable Gantt uses: its summary fields are UI-disabled *except on a manually scheduled parent*. FreeGantt's analogue is the per-entry pin flag, which is scheduling-plugin data (ADR 0002) and lands in S7. Until then a Field-wide `rollUp: 'none'` is the only opt-out.
- **Publish an ownership ladder now (managed, custom setter, controlled writes).** Rejected for this ADR. It is an escape hatch from a storage model being replaced. Revisit when a consumer asks.
- **`internal: true` for `parentId` and `segments`.** Rejected. An absent `column` already means "not a column", and `gridColumns` naming such a Field already throws `FieldNotColumnableError`. A second key for one job breaks *one config tree per job*, and the ADR could not name a question `internal` answers that nothing else does.

## Consequences

- **The write path is the one that already exists.** `metaStrategy.write` already builds a complete record from the Entry's own values plus the one key it is given, and `diffEdit` already emits one changeset row per declared key through `proposedKeys`. Deleting the strategy table removes a dispatch, not a mechanism. This is the smallest half of the change; the Document, the derived-value rule and the optional dates are the large ones.
- **`data` is the one reserved key, and there is no reserved *set*.** Declaring `{ key: 'data' }` throws, because a whole namespace is not a Field. A consumer key never sits at the top level of an edit or of a `StoredEdit`, so `proposedKeys` cannot be shadowed by one and needs no guard of its own. `EntryEdit` restates that one key rather than inheriting it — `data?: Partial<TData>` against `EntryInput`'s `data?: TData` — because `Partial` reaches one level only.
- **One generic, written by hand.** `Dataset<PlannerData>` types `entry.data`, `update()`'s flat keys and `fieldValue`'s answer from one declaration, so the `harness/planner.ts:31` disagreement — `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, whose two halves differ on `critical` — becomes unrepresentable. Inferring the shape from the `entries` array stays possible later and is no longer load-bearing.
- **The internal `Entry` describes its own object.** `data` defaults to `Readonly<Record<string, unknown>>`, so `entry.data.phase` compiles inside `layout/` and `view/` and answers `unknown` under `noUncheckedIndexedAccess`. No cast, no index signature on `Entry`, and `entry.strat` still fails to compile. `Entry` stays non-generic in those layers, which is what ADR 0005 ruled and this keeps.
- **`Entry.data` is always present; `EntryInput.data` is optional.** Ingest fills `{}`, the same rule `segments` already follows, so no reader carries a "no data" branch. `metaRecord` — which answers `{}` for an array and copies the bag on every read — is deleted, and a stored read becomes one property lookup.
- **Ingest has no open half.** `data` holds everything the library does not name, so an unknown top-level key at ingest is a mistake rather than a value with nowhere else to go. `EntryInput` is a closed interface, so the compiler already refuses one in a written literal; whether the reader also throws on data arriving from a server is a small, separable choice.
- **Undeclared data round-trips and is not editable.** `update(id, { data: { phase: 3 } })` on an undeclared `phase` stays `UnknownFieldError`. This is a rule about declarations, not about the edit's shape, and the only thing it buys is the typo guard. Declaring the key is one line. It is also the one capability today's destructive `update({ meta })` had that nothing here replaces — see Open 1.
- **`parentId` and `segments` keep their declarations.** Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list; `widenSegmentsToEnvelope` gates on `registry.get('segments')`; and `segmentsEqual` supplies the equality rule that puts an id-only Segment write into the changeset (#212, ADR 0010). Undeclaring them is not an available option.
- **This is `schema: 5`.** Four things change in the file: `meta` becomes `data`, `SerializedField.source` leaves, `start` and `end` become optional, and a rolling-up parent's rolling-up keys are omitted. A `schema: 4` reader cannot read what this writer produces, and the version gate means an older consumer build refuses a newer file rather than misreading it.
- **The Document reader's rules do not change, and that is the point of the namespace.** An unknown key inside `data` is passenger data and is kept, exactly as an undeclared `meta` key is today. An unknown top-level key stays unknown, so `plans/02-public-api.md:738` still holds. ADR 0008's ruling stands unchanged: a legacy `progress` is consumer data inside `data`, with no core key for it to collide with.
- **`data` is carried by reference, except on a rolling-up parent.** D-S2-12 says the namespace is never walked field by field. The derived-value rule bends that in exactly one place — a rolling-up kind, whose rolling-up keys the writer omits — and nowhere else. Say so where D-S2-12 is written down, rather than leaving the two rules to disagree in silence.
- **#192's hazard survives one level down, and it is about declarations rather than storage.** Install the S7 scheduling plugin on a Dataset whose `data` carries a legacy `progress`, and the plugin registers `progress` over values it did not write, with nothing recording who wrote them. `read.ts` already rules that an undeclared-provenance row is unrepairable and throws `PluginSetupError`. Values have no equivalent, and this ADR does not give them one.
- **A plugin's Field values sit in `data`, beside the consumer's — where they sit today.** `field-registry.ts`'s `authored` excludes plugin-declared Fields from the Document on a stated premise: *"The plugin's values are not affected — those sit in `Entry.meta`, which round-trips whether the Field is declared or not."* One word changes and the guarantee does not. `PluginDocument` (D-S5-24) keeps its current job, the plugin's own non-Field rows, and gains nothing here. A per-entry `pluginData` key was considered and rejected: it splits one namespace by an owner the Document does not record anyway.
- **Plugins and consumers share the `data` namespace.** ADR 0005 deferred a separate consumer store on the grounds that "a consumer declaring their own key in their own `meta` has nobody to collide with" — with plugins installed, they do. This is today's behaviour, not a regression, and the registry already refuses a duplicate key at declaration. What it must gain is an error message that names the plugin.
- **What a plugin does lose is a *derived* value, because its declaration does not travel.** An S7 group's rolled-up `progress` is omitted by the rule above, and a Document read without the plugin cannot re-derive it — plugin declarations are deliberately not written (D-S5-33). The leaf values still round-trip. This is judged acceptable: without the plugin there is no `progress` semantics to preserve, and installing it re-derives every parent.
- **An Aggregator's `undefined` changes meaning on a rolling-up parent.** It is documented as *no opinion — keep the stored value*. Once nothing but the Rollup can write that cell, there is no authored value to keep, and "keep" means "keep the previous derived answer", which is stale by construction. On a rolling-up parent, `undefined` means **no value**. Elsewhere the current reading stands.
- **`toJSON` output is no longer byte-identical to the input for a rolling-up parent.** `toJSON → fromJSON → toJSON` is still stable, because the structural test is a pure function of kind, hierarchy and declarations.
- **The key-order contract holds and covers the core keys.** `toJSON` writes them in their fixed order and `data` last; inside `data`, order follows the consumer's own object. `serialization/index.ts`'s rule that `Object.keys` never walks a store entity stands, with the single exception a rolling-up parent's `data` needs.
- **A Document is our save format. It is not an interchange format, and that is now a decision rather than an observation.** A third-party reader sees a group with no span and no rolled-up values, and would need the same Aggregator *implementations*, referenced by name only. Today the file carries the numbers; after, it carries the recipe. Nothing in `plans/02` claimed interchange, and nothing will.
- **`reportCorrectedRollUps` is deleted, not generalized.** With no reproducible derived value in the Document there is nothing to correct.
- **The deleted surface.** `FieldSource` and all three arms, `SerializedField.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`, `source-strategy.ts`'s strategy table, `normalize-source.ts`, `metaRecord`/`metaKey`/`metaSlot`, and `Field.source` itself. `TMeta` becomes `TData` and loses its second generic across 101 references. One successor is needed and easy to miss: `encodeFieldDocument` keeps a `compute` Field out of the Document *through* the strategy table — `writeStoredSource` calls `computeStrategy.serialize()`, which answers `undefined`, and `encodeDeclaredField` drops the row. Delete the table and the test goes with it. `'compute' in field` replaces it.
- **Also superseded, beyond ADR 0005.** `plans/01-domain-architecture.md:273-281` (the `FieldSource` type and its default), `plans/01:330` and `plans/02-public-api.md:454` (*"Source decides stored or computed"*, in both docs), and `plans/02` §7's two `FieldSource` errors.
- **The library has never shipped, so this lands as one change.** Staging the storage rename behind the current interface and breaking the surface afterwards is discipline for a library with users.

## Issues this ADR depends on

Remove a row here once it is closed, and remove this section when it is empty.

| Issue | What this ADR needs from it |
|---|---|
| [#213](../../issues/213) | A `compute` write is dropped in silence. The registry refusal for `compute` + `rollUp` must land **before** #213's own fix, or the Rollup starts throwing instead of writing a phantom row. |
| [#270](../../issues/270) | A declining Aggregator leaves a stale rolled-up value. Independent of this ADR, but the Document's re-read and the live store disagree until it is fixed. |
| [#267](../../issues/267) | A renderer casts `entry.meta`. Typing `data` as a record removes the cast with no new API, so this closes rather than being answered by a new surface. |
| [#266](../../issues/266) | `meta` names a storage location, a Field key, a `FieldSource.from` value and a Document key. Three of the four go, and the survivor is renamed. The `Document`/DOM collision half of that issue stays open. |
| [#264](../../issues/264) | Core ships one Field type and its own Fields bypass the layer. The Field union here settles the shape a type bundle attaches to. |
| [#214](../../issues/214) | `FieldContext` cannot reach a second Entry, so a `compute` Field cannot depend on the tree. The `compute` arm published here inherits that limit. |

## Open, and the reason each is open

1. **May an undeclared key travel in a `data` patch?** The ruling above says no, and the only thing that rule buys is the typo guard: `update(id, { data: { csot: 7 } })` throws rather than quietly creating a key. A consumer syncing a whole row from a server pays for it, because every key they sync needs a declaration. Dropping the rule would cost the guard and nothing else, now that the patch merges. Recommendation: keep the guard, and revisit the first time a consumer states the sync case.
2. **What an S7 plugin does when it meets a `progress` value it did not write.** #192 rules the declaration case unrepairable; the value case has no rule. It is observable the first time the plugin is installed on saved data.
3. **The schema number for the new reader.** Readers for schemas 1–4 are deleted: nothing has ever consumed this library, so no Document outside this repo's fixtures was written by them. `5` keeps the count monotonic, so a stale local file fails loudly instead of being read as the new shape. `1` restarts the count and reads cleaner in the docs. `5` is the recommendation.
4. **What `InvalidInstantError` still guards, once a dateless Entry of any kind is legal.** It currently refuses a `'span'` that authors neither date. That refusal goes. It keeps refusing an *unreadable* date, and an Entry that authors one date without the other.
