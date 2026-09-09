# ADR 0011 — the consumer Field redesign

**Governing decision:** [`docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md`](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md) — status `proposed`, still a draft.

The ADR carries the reasoning. This file carries the shape, the order of work, the issues, and what is still undecided.

The working review is [`reviews/2026-09-09.md`](reviews/2026-09-09.md). It merges the 8 September API-surface review, the 8 September draft fixes, the 8 September consistency review, the 9 September consumer-call review, and a second 9 September review of the merged result. Delete it once each finding is settled here or in an issue — **seven decisions (D1–D7) are still unread**, and they live nowhere else in summary form.

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
| Stored Entry | `meta?: TMeta` | `data: Readonly<Partial<TData>>`, always present (`{}` when absent), like `segments` |
| `EntryInput` | `meta?: TMeta` | `data?: Partial<TData>` — a record |
| `EntryEdit` | `meta?: TMeta`, **replaces** | `data?: DataEdit<TData>`, **merges** |
| `EntryDocument` | `meta?: TMeta` | `data?: Partial<TData>` |
| Field address | `source: FieldSource`, three arms | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` — two, can disagree | `Dataset<TData>` — one |
| Internal `Entry` | `meta?: unknown`, needs a cast | `data: Readonly<Record<string, unknown>>`, reads as `unknown` |
| Rolling-up parent value | stored **and** written to the Document | stored, **never** written to the Document |
| `start` / `end` | required except on a rolling-up kind | optional on every kind |
| Schema | 4 | 5 |

**`Partial` at every door, and `TData` never claims a key exists.** `Readonly<TData>` beside an ingest fill of `{}` is a required-key lie the compiler cannot catch. It also costs the widening: probed at HEAD, `Dataset<A>` is assignable to the bare `Dataset` when every `data` door is `Partial`, and is **not** when `EntryInput.data` is `TData` and `TData` carries one required key — `entries.add` fails the bivariant method check. The widening is what deletes `harness/main.ts:89`'s double cast through `unknown`, which that file's own comment calls *evidence, not a shortcut*.

**One key space, two homes.** Field keys stay in a single namespace — that is what lets one name serve `field` on a changeset row, `canWrite(entry, field)`, and `gridColumns: ['name', 'cost']`. Storage is namespaced underneath: core keys on the Entry, everything else in `data`.

## Fix before the redesign — **done 2026-09-09**

One live defect in `main`, in code the redesign keeps. It is independent of the ADR, so it did not wait for the ADR to be accepted.

**Fixed.** `mergeColumn` now spreads `sizingPairOf(…)` — the `width`/`flex` pair alone — instead of the whole declaration that owns the sizing. Four test rows landed in `field-registry.test.ts` under *a Field column and its type bundle merge key by key, sizing apart*. Rows 1 and 2 fail without the fix and pass with it; rows 3 and 4 pass either way and guard the fix's shape. `verify:full PASS — all 16 checks green, test:e2e included`. The description below is kept as the record of what was wrong.

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

**Test:** `field-registry.test.ts` needs four rows, not two:

1. a bundle carrying both a header and a width, against a Field carrying only a header — pins the fix;
2. a bundle carrying no sizing at all (the second probe row above) — pins that the trigger is a shared non-sizing key, not a `width`;
3. a Field that sizes itself over an already-sized bundle — pins #249's rule;
4. a bundle that sets `width` and a Field that sets `flex`. **This row passes today** — probed. It takes the `sizing = own` branch, and that branch is never the broken one, because `own ⊇ ownRest` makes the last spread a no-op. It is not a defect case, and it is worth a row anyway: it guards against a *wrong fix*. A per-key fallback (`width: own.width ?? from.width`) makes rows 1 and 2 pass and leaks the bundle's `width: 100` into a Field that declared `flex`, which is exactly what #249's rule forbids. Row 3 pins #249 for a Field that re-declares the same key; row 4 pins it for a Field that declares the *other* key.

## The work

Five groups of work and one of prose. The order is **A → B → C → D**, with F throughout and `mergeColumn` first. **Group E is dissolved**: each Document change lands in the group that causes it — the `data` rename and the `source` removal in A, the omission rule in C, the optional dates in D — because a separate serialization group invites writing the Document against rules that have not landed. Schema 5 is then a version bump at the end of D, not a work group. The real constraint follows: **there is no green commit between A and D on this branch**, because the Document version bumps once. That is a statement about the branch, not about `main`: `pnpm verify:full` runs green before the PR merges, and the pre-push hook is the backstop.

### A. The address rule, and the storage rename

The key decides the home, so no declaration carries one.

- `Entry.meta` → `Entry.data`, non-optional, filled `{}` at ingest. `Entry.data: Readonly<Partial<TData>>`, `EntryInput.data?: Partial<TData>`, `EntryDocument.data?: Partial<TData>`.
- **The two edit shapes take opposite rules, and neither is `Partial`.** Do **not** write `Partial` on either half: `Partial<Omit<EntryInput<TData>, 'id' | 'data'>>` refuses group D's un-date verb `update(id, { start: undefined, end: undefined })` under `exactOptionalPropertyTypes` (`TS2379`, probed), for the identical reason `Partial<TData>` refuses a removal inside `data`. But the two halves do not then get **one** mapped type, and an earlier draft of this plan said they did. Inside `data`, every key is removable, because `data` is `Partial<TData>` at every storage door — a key `TData` marks required is still a key the stored record may not hold, so protecting it refuses a write into a state `add({ id, name })` reaches on its own. On the envelope, only three keys are removable, because **optional at ingest is not removable by an edit**: `kind` is optional on `EntryInput` only because ingest defaults it to `'span'`, and a stored `Entry.kind` is always there.
  ```ts
  export type DataEdit<TData> = { [K in keyof TData]?: TData[K] | undefined };

  type EntryEnvelope<TData> = Omit<EntryInput<TData>, 'id' | 'data'>;

  /** The envelope keys an explicit `undefined` removes. `kind` and `name` are absent because a
   *  stored Entry always holds both. `segments` is absent because un-dating already clears them. */
  type RemovableEntryKey = 'parentId' | 'start' | 'end';

  export type EntryEdit<TData> = {
    [K in keyof EntryEnvelope<TData>]?: K extends RemovableEntryKey
      ? EntryEnvelope<TData>[K] | undefined
      : EntryEnvelope<TData>[K];
  } & { data?: DataEdit<TData> };
  ```
  `data` is omitted before it is restated, because an intersection cannot narrow a property the interface already declares. **Six type tests, all probed at HEAD.** Compiles: `{ start: undefined }`, `{ parentId: undefined }`, and `{ data: { owner: undefined } }` with `owner` **required** on `TData`. Does not: `{ kind: undefined }`, `{ name: undefined }`, `{ segments: undefined }`. Write all six; the third and fourth are the two this plan got wrong before.
- **`segments: undefined` is refused, and that is a call, not a copy of the review.** The 2026-09-09 consumer review listed `segments` as removable. Group D's biconditional already gives un-dating one spelling — `{ start: undefined, end: undefined }` clears the Segments in the same write — and `segments: []` throws `EmptySegmentsError`. A third spelling for the same job is what this ADR keeps deleting. Flag it if you disagree; it is one entry in `RemovableEntryKey`.
- `DataEdit<TData>` is exported from `api/` and gets a `plans/02` type row. An app author writes the name only when they factor a helper, and the type they would otherwise reach for — `Partial<TData>` — is the one that cannot say *remove*.
- **The public plugin surface carries the generic too**, and it is easy to miss: `DatasetPlugin<TMeta, TFields>`, `DatasetPluginContext<TMeta, TFields>` (`src/api/dataset.ts:45-52`), `DatasetOptions<TMeta, TFields>` (`:54-57`) and `Dataset.fromJSON<TMeta, TFields>` (`:326`). All four are published; all four lose a generic.
- Delete `harness/main.ts:89`'s `as unknown as` and the comment at `:81-88` explaining it. That comment already names the cause — *"the mismatch is between two harness pages' declared field shapes"* — and the single `Partial` generic gives those two shapes a common type. If the cast does **not** delete, the generic is wrong; do not keep both.
- **`StoredEdit` → `ProposedEdit`, with serena** (CLAUDE.md — serena follows the symbol). `ProposedEdit`/`ProposedEdits`, `toProposedEdit`/`toProposedEdits`, `EditReading.proposed`, about 184 occurrences. It lands in A because A already renames the type's own field, and a half-renamed edit type across two groups is worse than a large rename inside one.
- `change-set.ts:72-85`'s `fieldsWrittenBy` still skips `'meta'`, and `isOptionalEntryKey` (`fields/field-access.ts:26`) still names it. Both follow the rename.
- Delete `#mergeCoreFieldOverride`, `#consumerOverriddenCoreKeys`, `CORE_FIELD_OVERRIDABLE_KEYS` and `illegalCoreOverrideKey`. A consumer declaration on a core key falls through to the `DuplicateFieldKeyError` already sitting there. **Check before this lands:** whether `Field.editable: false` also refuses `entries.update()` — see the ordering constraints.
- Two ingest warnings, one `Object.keys(input)` walk per Entry against `CORE_FIELDS` plus `'data'`: an unknown key at the top level, and a key inside `data` that names a core key. The second is the unreachable-value case — `entry.data.start` stores and `fieldValue(id, 'start')` never answers it.
- Delete `FieldSource` and all three arms (`model/field.ts:44-47`), `Field.source`, `SerializedField.source` (`model/document.ts:40`), `data/fields/source-strategy.ts`'s strategy table, `normalize-source.ts`, `metaRecord` / `metaKey` / `metaSlot`, `DuplicateFieldSourceError`, `InvalidFieldSourceError`.
- Delete the `meta` core Field (`data/fields/core-fields.ts:109-112`) with **no successor**. A whole namespace is not a value a grid shows or a Rollup aggregates.
- `CoreFieldKey = keyof Omit<Entry, 'id' | 'data'>`, and the same exclusion in `CoreFieldValues`.
- The registry refuses `{ key: 'data' }`. That is the **one** reserved key — no reserved *set*, because a consumer key never sits at the top level of an edit or a `ProposedEdit`, so `proposedKeys` needs no guard of its own.
- `'compute' in field` replaces `computeStrategy.serialize()` in `encodeFieldDocument`. Easy to miss: the strategy table is what keeps a `compute` Field out of the Document today, and its test goes with it.
- `view/capability.ts:132`'s `hasSomewhereToWrite` becomes `!('compute' in field)`.
- One generic. `harness/planner.ts:31` currently writes `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, whose two halves disagree about `critical` with nothing noticing.
- The two fixture record types are named after the slot rather than after the values: `PlannerMeta` (`fixtures/planner-dataset.ts:17`) and `DemoMeta` (`fixtures/demo-dataset.ts:162`) become `PlannerEntryData` and `DemoEntryData`. The page keeps its own domain word — a harness page names what it demonstrates. The rule this breaks is that the slot is not the concept, and the slot is what changes here.
- The registry's `authored` comment (`field-registry.ts:144-148`) states plugin values "sit in `Entry.meta`". One word changes; the guarantee does not — unless B1 lands on C, which deletes the sentence instead.

### B. The merging patch

Group A renames the type, so this group is written in the new names: `toProposedEdit`, `ProposedEdit`.

- `toProposedEdit` (`data/entry-reader.ts`) merges the `data` patch onto the Entry's own record, so a `ProposedEdit` always carries a **complete** `data`.
- **The merge belongs on the read side, not the apply side.** `EditRequest.proposed` is documented as *"storage-shaped and complete, the same as `entries`"* — a plugin cascade compares proposed against current with no normalizing step. A partial `ProposedEdit.data` would make every extender merge for itself, which is the harness-patches-the-library shape one layer down.
- `entryAfterEdit` (`data/fields/field-access.ts`) merges `data` rather than replacing it.
- An explicit `undefined` inside a patch clears that one key. It is the only way to say *remove*, and today's write path already reads it that way.
- `diffEdit` emits one row per Field key, never a path into `data`. The whole-bag write that emits two rows for one value has nothing left to come from.

**An undeclared key inside a patch is writable** (Open 1, settled). Putting the key in `proposedKeys` is necessary and **not sufficient** — three edits make the settled rule true, and they stand or fall together. Ship them together or the ruling ships as a silent write: no ChangeSet row, no undo step, no subscriber.

- **a. Seed the proposed set from inside the namespace.** `toEditReading` seeds it from the edit's *top-level* keys, and after this ADR the only top-level key that can hold a consumer value is `data`:
  ```ts
  const proposed = new Set<string>(Object.keys(edit).filter((key) => key !== 'data'));
  for (const key of Object.keys(edit.data ?? {})) proposed.add(key);
  ```
- **b. Give `diffEdit` a second pass.** It walks `registry.all` when `proposedKeys` is set, so a key in the set and *not* in the registry is never visited. Keep the registry walk for row order, then drain the rest:
  ```ts
  for (const key of authored) {
    if (registry.get(key)) continue;
    emit(key, current.data[key], next.data[key]);
  }
  ```
- **c. Read by key never throws.** After (b) a ChangeSet carries rows naming undeclared keys, so every read door has to be able to answer one: `entries.fieldValue` and `ctx.read` answer `entry.data[key]` for an undeclared key, and `undefined` for a key nothing holds.

**The rule, in one line: read by key never throws; declare by key still does.** `gridColumns`, `rollUp` and the editors keep their errors. `UnknownFieldError` keeps firing for an unknown key at the **top level** of an edit, where the schema owns the names.

**One loss, accepted and written down:** `fieldValue(id, 'ownr')` answers `undefined` where it throws today. If that reads as too loose once the code lands, the answer is a dev-time warning — never a second key space.

### C. A derived value never persists

One structural question — *is this a rolling-up kind, and is this a rolling-up Field?* — asked at every door. I14 is the **write** half: one resolution behind every gesture and every write. `toDocument` is not a write, so it is the same question asked by the writer, not a fifth `canWrite`. Do not claim I14 for the omission.

| Door | Answer | State |
|---|---|---|
| cell editor, bar drag | refused | already true (`view/capability.ts:119`) |
| `entries.update()` | refused | **the change** — move the `rollsUp` test into `data/`, where `rollsUp` already lives |
| `entries.add()`, `new Dataset({ entries })`, `fromDocument` | value **dropped**, report raised | **the change** |
| the extension hook (a plugin cascade) | **open — ADR Open 5** | not refused, by where the guard sits. Settle before this group starts |
| autoGroup promotion | dates change owner mid-commit | **unowned until now** — see below |
| `toDocument` | key **omitted** | **the change** |

- **Promotion is the third door into a rolling-up kind**, beside `kind` at ingest and a `rollUpKinds` flip, and nobody aimed at it. `fixtures/hierarchy-dataset.ts` authors a plain parent with dates; reparent a child onto it and autoGroup promotes it, so those authored dates become derived in that commit with no call naming a derived Field. The Rollup recomputes them from the new child. Acceptance check: promote a dated plain parent, and assert its dates come from the child and its Document omits them.
- **A parent that later loses its last child keeps no dates and draws no bar.** That is a behaviour change: today a childless rolling-up parent keeps the last value the Aggregator produced (`rollup.ts` skips it before it reaches an Aggregator). It is the same finding as #270, seen from the other side.

- The report goes through `raiseError` at `severity: 'warning'` (ADR 0009), **always**. Not `isDevMode()`-gated: that flag resolves when *this repo* builds `dist/`, so a gated pass is eliminated from every consumer build (D-S5-41).
- Delete `reportCorrectedRollUps`. With no reproducible derived value in the Document there is nothing to correct.
- On a rolling-up parent, an Aggregator's `undefined` means **no value**, not "keep the stored value" — there is no authored value left to keep, and "keep" would mean keeping a stale derived answer.
- Nothing tracks what a pass produced, nothing compares values, and nothing depends on how many children a parent has right now. Three earlier designs died on that; the structural test is why this one does not.

### D. Optional dates, on every kind

- **State it once, as a biconditional: an Entry has dates if and only if it holds at least one Segment**, and `start`/`end` are always the envelope. Everything else in this group follows from that one sentence rather than from a list of cases.
  - `add({ start, end })` mints one Segment, as today.
  - `add({ segments })` with no dates derives the envelope.
  - `add({})` stores no dates and no Segments.
  - `update(id, { start: undefined, end: undefined })` is the un-date verb, and it clears the Segments in the same write.
  - Two refusals stay: one date without the other, and `segments: []` on its own (`EmptySegmentsError`). The empty case is `add({})`, which names no segments rather than naming none.
  - `start` and `end` join `isOptionalEntryKey` (`fields/field-access.ts:26`). `serialization/index.ts` and `entry-reader.ts` each branch on `segments.length === 1` today; each gains a `length === 0` arm.
- `FieldContext.durationOf` returns `Duration | undefined` (`src/model/field.ts:189`). It is **plugin-author surface**, so it is a published change, not an internal one, and it reaches further than the signature:
  - `core-fields.ts:118` — the shipped **`duration` core Field** reads `ctx.durationOf(entry)` in its `compute` arm. So the `duration` **column answers `undefined` on a dateless row**. That is the consumer-visible half of this change, and **the cell is blank, with no code written for it**: the Field's `formatValue` is `formatDuration`, which already answers `''` for `undefined` (`core-fields.ts:44-45`). Assert the blank cell; do not invent an em dash or a placeholder. (This was Q2 on the 2026-09-09 review, and the code had already answered it.)
  - `field-access.ts:92` — the canonical implementation.
  - `aggregators.ts:14` (`durationMs`, behind `weightedMeanByDuration` at `:51`) — skips a dateless child rather than weighting it at zero.
  - `inline-editing.ts:113` is a **provider**, not a caller: `fieldContextFor` builds a `FieldContext` and supplies its own `durationOf`. It changes as an implementation.
  - `etc/freegantt.api.md` — the API report gates on I11, so the signature change lands there or CI fails.
  - Four test stubs build a `FieldContext` by hand: `layout/rows/filter.test.ts`, `layout/rows/sort.test.ts`, `data/fields/field-types.test.ts`, `data/fields/field-access.test.ts`.
- `Entry.start` / `Entry.end` and `EntryDocument.start` / `.end` all become optional — on every kind, a `'span'` included, not only on a rolling-up parent.
- Delete the `referenceDate` fill (`data/entry-reader.ts:168-172`) — a clock reading taken at construction and never saved, so an empty group reloads somewhere else. Nothing takes its place: an absent date stays absent, all the way to the Document. **It is written down under D-S2-10 *and* D-S2-22** (`plans/s2-data-core/README.md:278` and `:592`, change row `:842`; `s2.3-mutation-api.md:91` heads the section with both ids). It is **not** written down under D-S5-46 — that decision's reasons are the half-open interval and the resize clamp, and it survives this ADR unedited.
- An Entry with no span draws **no bar** and still shows its grid row.
- Reaches further than one fill: bar geometry, the Segment invariant (*never empty*, #212), sort comparators, and `range: 'fitDataset'` each gain an absent case.
- `InvalidInstantError` keeps refusing an *unreadable* date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither.

### E. Document, schema 5 — lands inside A, C and D

**E is not a work group.** It is kept as a section because it is the only place the file's four changes are described together. Each one lands in the group that causes it: the `data` rename and the `source` removal in **A**, the omission rule in **C**, the optional dates in **D**. Schema 5 is a version bump at the end of D.

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
| `plans/02` §2.6 | the same rule again, in the paragraph on what a Source decides for a parent's aggregate. Cite the paragraph, not a copied title — `:454` reads *"Source decides what happens to a parent's aggregate"*, which is not the `plans/01:330` sentence |
| `plans/02:738` | "anything of yours goes in `meta` and survives byte for byte" — the rule survives, the word does not |
| `plans/02:749` | `DuplicateFieldSourceError` and `InvalidFieldSourceError` rows leave; `DerivedFieldNotWritableError` and `ComputedFieldCannotBeWrittenError` arrive (plus `RollUpKindsWouldDropValuesError` if Open 6 lands that way, and `PluginFieldNotInDataError` if B1 lands on C). **`EmptySegmentsError` is not on that list** — it already ships (`src/model/errors.ts:275`) and already has its row (`plans/02:121`, `:749`). An earlier draft of this plan had it arriving |
| `plans/02` §"common case is a shorthand" | `update('t1', { start, cost })` is the shipped example and it stops compiling. Either the principle drops for Field writes, or the ADR re-opens the flat edit. It cannot stay as written — see *The write, and what the namespace costs* in the ADR |
| `plans/02` Document section | a Document is our **save format**, not an interchange format. The ADR decides it; `plans/02` is where a reader looks for it |
| `plans/02` type rows | `DataEdit<TData>` and `EntryEdit<TData>` are public and need rows |
| `plans/s2-data-core/s2.6-serialization.md:76` | states the consumer rule in the old word. A person missed this one; the grep is why |
| `plans/s2-data-core/README.md` | three separate rows in one file: D-S2-22's **precedence clause** (the yield-to-the-body paragraph, *not* the decision — D-S2-22 is "the Rollup is a core step"); D-S2-10's and D-S2-22's `referenceDate` fill (`:278`, `:592`, change row `:842`); D-S2-7's `meta` carve-out (the equality-table row at `:224`, not the decision) |
| `plans/s4-hierarchy-and-rows/README.md` | D-S4-35 / Q17 (*omitted `source` is `meta` under the Field key*), and the rule table's *"Whole-`meta` write after a declared Field exists"* row |
| `plans/s4-hierarchy-and-rows/s4.1-field-registry.md` | D-S4-2's adapter — *one adapter reads and writes a `FieldSource`* — and the whole-`meta` write rule inside it |
| `plans/02-01-API-Redo.md` | already opens with *"This review is a stale."* Say **superseded by ADR 0011** in the same line, because it still argues for flat runtime keys and will otherwise be read as a source |
| ADR 0005 | its `meta` rulings, superseded if this is accepted |
| `CONTEXT.md` | the new glossary entry (see below) |

**The glossary entry is owed, and it has to fix a collision.** `data/` is a core layer and `entry.data` is the consumer's bag. The call site `entry.data.owner` is fine and does not change. The *spec sentence* "`data/` merges `data`" is not. The rule: **in prose, write `data/` for the layer and `entry.data` for the bag — never the bare word.** `values` was considered as a rename and rejected: it collides with `RollUpContext.values`.

## Issues

### Closed by this work

| Issue | How |
|---|---|
| [#208](../../issues/208) | *`EntryInput` cannot carry a declared Field value.* The defect it names is that a page must know **where** a value lives to author it, and gets no warning when that knowledge goes stale: declare `source: { from: 'meta', key: 'budget' }` and `meta: { cost }` silently stops filling the Field. Deleting `FieldSource` removes the aliasing, so the key **is** the address and the failure cannot be expressed. **Its proposed shape is rejected**: the ADR rules `data: { cost: 1500 }`, not a flat `cost: 1500` on `EntryInput`, because ingest supplies a record while an edit patches one. Both of its open questions are answered: an undeclared key inside `data` is **writable and named on the ChangeSet** (Open 1), and `add({ data })` emits **one `EntityAdded` row** (Open 2). |

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
5. **Blocking B1 before group A**, and **Open 5 before group C**. Both are on this page; neither is a question the implementer may answer in passing.
6. **[#270](../../issues/270) before or with group C.** Group C makes a reload correct and leaves the live store stale, so the two disagree until #270 lands. The first save-and-load after a child disappears is where a consumer sees it.
7. **Answer *does `Field.editable: false` refuse `entries.update()`?* before group A deletes `CORE_FIELD_OVERRIDABLE_KEYS`.** `interactions.edit` gates the cell editor and the drags only. If `update()` still writes, the deletion needs a data-level replacement, and [#256](../../issues/256) is where it belongs. This is the same two-doors-one-answer shape as group C, at a different Field.

## Still open

Each of these changes something a reader can observe, so none can be settled silently during implementation. **These numbers are shared with the ADR's Open list** — Open *n* is the same question in both files. The **Blocking B1–B3** below are a separate list, because they gate group A.

1. ~~**May an undeclared key travel in a `data` patch?**~~ **Settled: yes.** The guard bought only a typo check, and it never covered `add()`. Group B's three edits are what make the ruling real — `proposedKeys` alone ships it as a silent write.
2. ~~**Does `entries.add({ data })` emit one `EntityAdded` row, or an added row plus a Field row for each key?**~~ **Settled: one `EntityAdded` row, carrying the whole Entry.** Per-Field rows would undo one user action in several steps, and they say nothing the added row does not already carry. This closes [#208](../../issues/208)'s second question.
3. ~~**The schema number.**~~ **Settled: `5` now, `1` at release.** `5` keeps the count monotonic while the library is unreleased, so a stale local file fails loudly. The count restarts at `1` when the library first ships. Fixtures are regenerated by `toDocument`, never hand-edited. *One half stays open:* after the restart, a pre-release `schema: 3` and a released `schema: 3` are the same number in two shapes. Nothing reads schema 3 today, so nothing breaks now — the question is whether the release gate owes a rule that a released reader refuses a file it did not write.
4. ~~**What `InvalidInstantError` still guards.**~~ **Settled:** an *unreadable* date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither.
5. **What a plugin cascade's write to a derived cell does.** **Open, and it gates group C.** The guard sits on `EntryStore.update()`, so the hook is exempt from the throw — but exempt from the throw is not *the write survives*. Verified at HEAD: `rollup.ts:196` reads the transaction **body** (`build-commit-change-set.ts:301` binds `body` to the body alone; the extender's edits reach only `merged`), so a cascade's parent write commits, lands in the ChangeSet, enters undo, and the same pass overwrites it — `foldChangeSet` does no per-field dedupe, so **both rows sit in one undo step**. Answer it before group C deletes the `body`/`merged` split.
6. **Whether a `rollUpKinds` flip refuses or destroys.** **Open, and it has no work group either way.** See the ADR's Open 6.
7. **What an S7 plugin does when it meets a `progress` value it did not write.** #192 rules the declaration case unrepairable; the value case has no rule. Observable the first time the plugin is installed on saved data. This is **Blocking B3**, and it is downstream of B1.

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

**Input, not a ruling (2026-09-09 review): it recommends C.** Every supporting fact was verified at HEAD:

- `PluginStores` (`plugin-store.ts:42`), `reserve<T>()` (`:62`), `read<T>()` (`:74`), and `PluginStore` / `PluginStoreView` already public from `api/dataset-plugin.ts:29`. C adds no store and no Document key.
- D-S5-24 opens with the reason: *"ADR 0002 named the problem: per-plugin per-entry data must not live in `Entry.meta`, or a host and a plugin collide in one field."* Option A re-opens that collision under a new name, one level up.
- C closes **B3** at no extra cost: a consumer's `progress` in `data` and the plugin's in `plugin:s7` cannot be confused.
- **C's real cost, and it is not free:** with two homes for Field values, `fieldValue(id, key)` has to resolve *which* home. `FieldRegistry.#declaringPlugin` (`field-registry.ts:117`) already records the owner, so the routing exists — but the **read path for both callers** has to be written, not just the write path. C is also the largest change of the three, and it has no work group in this plan.

A is the industry's shared-metadata-bag pattern (last writer wins at a key); C is the slice-per-owner pattern. The ADR's consequences now say plainly that they describe HEAD rather than a ruling — do not read them as a decision already taken.

#### The call sites B1 asked for

Written 2026-09-09. This is what the section demanded before anyone chooses. Shared setup, with a legacy undeclared `progress` in the consumer's own data and a plugin that declares the same key:

```ts
interface TaskData { owner?: string; cost?: number }
const dataset = new Dataset<TaskData>({
  timeZone: 'UTC',
  entries: [
    { id: 'p1', kind: 'group', name: 'Site' },
    { id: 't1', parentId: 'p1', name: 'Survey', start: '2026-01-05', end: '2026-01-09',
      data: { owner: 'Jo', cost: 400, progress: 40 } },   // `progress` is undeclared legacy data
  ],
  fields: [{ key: 'cost', rollUp: 'sum' }],
  plugins: [scheduling()],   // registers { key: 'progress', rollUp: 'weightedMeanByDuration' }
});
```

**A — share `entry.data`.**

```ts
// app author
dataset.entries.get('t1')?.data.owner       // 'Jo', typed
dataset.entries.get('t1')?.data.progress    // type error — not in TaskData. Runtime: 40, then the plugin's
dataset.entries.fieldValue('t1', 'progress')            // 40, unknown
dataset.entries.update('t1', { data: { progress: 60 } }) // type error, writes fine at runtime
gantt.gridColumns = ['name', 'progress']                 // a cell edit writes entry.data
// plugin author
ctx.fields.register({ key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration' });
const extra: EditExtender = (request) => new Map([[phaseId, { data: { progress: 0.5 } }]]);
```

One home, so the grid edit needs no routing and the cascade writes the same `EntryEdit` shape as any other write. `Dataset<TaskData>` is a lie from the moment the plugin installs, and the consumer's `progress: 40` and the plugin's Field are one key — that is **B3**, unclosed.

**C — the plugin's own store.**

```ts
// app author
dataset.entries.get('t1')?.data.owner        // 'Jo', typed — never sees the plugin's progress
dataset.entries.get('t1')?.data.progress     // 40 — the consumer's own leftover, still undeclared
dataset.entries.fieldValue('t1', 'progress') // the plugin store, unknown
dataset.entries.update('t1', { data: { progress: 60 } })   // ← the whole problem: see below
gantt.gridColumns = ['name', 'progress']     // the cell edit must route by declaring plugin
const json = dataset.toJSON();               // progress rides in PluginDocument, not entry.data
// plugin author
ctx.fields.register({ key: 'progress', … });
const store = ctx.store.reserve<{ progress?: number }>();
const extra: EditExtender = (request) => /* writes the store, not { data: { progress } } */;
```

**The cost this plan understated, and it is not only `fieldValue` routing.** *Every* door that names a Field key has to route: `entries.update`, the cell editor, the cascade, and undo. Those doors write `Entry` today; under C they write two stores. The consequence is a call that already type-checks and silently does the wrong thing — `update('t1', { data: { progress: 60 } })` writes the consumer's bag while the grid reads the plugin's store, and no error says which write landed. That is worse than A's lie generic, because A's is a compile-time complaint and this one is silent.

**So the refusal is part of the pick, not a follow-up.** If C is chosen, `update()`'s `data` patch must refuse a key a plugin declared:

```
PluginFieldNotInDataError: 'progress' is declared by 'freegantt/scheduling'.
Read and write it with fieldValue or the grid, not through `data`.
```

C also needs `toJSON` taught that a leaf plugin value already lives in `PluginDocument`, so it is not written twice.

**The honest summary of the trade.** A is cheaper to ship and keeps the cascade sample one shape; its price is a generic the ADR has to label a known lie — *`TData` is the consumer's keys; a plugin's keys are extra and untyped.* C is the honest generic and closes B3; its price is a work group this plan does not have — route `fieldValue`, route `update`/cell-edit/cascade/undo, add the refusal, teach `toJSON`. **Neither is free, and the review's recommendation of C is a recommendation, not the answer.** Budget C, or take A and write the lie down where a consumer reads it.

### B2 — What does a `compute` Field show on a rolling-up parent?

A computed Field cannot roll up; the union forbids it. So on a group row, does `compute(entry, ctx)` run against the group Entry and show its answer, or does the cell stay empty?

If it runs, a `compute` Field reading `entry.data.cost` returns the group's **rolled-up** `cost` — a derived value reaching a computed Field through a door the union looks like it closed. If it does not run, a `ref: (entry) => rowNumber(entry.id)` Field goes blank on every group, which a consumer reads as a bug.

Held open on 2026-09-08 at the author's request, pending a clarification of what the Field is for. Settle it with sample code: one `compute` Field of each kind, and the group row beside the leaf row.

**Input, not a ruling (2026-09-09 review): run `compute` on every row.** The union closes *storage*, not *reading*. A `compute` Field reading `entry.data.cost` on a group sees the value the Rollup already put in the store — that is a stored read, not a second rollup, and the door was never closed. The alternative blanks `ref` on every group row, which a consumer reads as a bug. The review also argues this does **not** gate group C: it changes what a cell shows, not what the store holds. If that holds, B2 comes off the Blocking list and becomes an ordinary Open item. The limit worth pointing #214 at is the real one: a `compute` Field cannot ask *am I a parent?*

### B3 — What does an S7 plugin do with a `progress` value it did not write?

ADR 0011's Open 2, and [#192](../../issues/192)'s hazard one level down. Install the scheduling plugin on a Dataset whose `data` already carries a legacy `progress`, and the plugin registers over values it did not write, with nothing recording who wrote them. `read.ts` rules the *declaration* case unrepairable and throws `PluginSetupError`; the *value* case has no rule.

**Downstream of B1.** Option C there — a plugin's values in its own store — closes this at no extra cost, because a consumer's `progress` in `data` and the plugin's in `plugin:s7` cannot be confused. Answer B1 first, then see whether this is still a question.

The cost to weigh is asymmetry: the consumer gets typed reads from one generic, and under **A** the plugin author gets `unknown` and a registry lookup per read. **C** would also close ADR 0011's Open 2 (an S7 plugin meeting a `progress` value it did not write) at no extra cost, and would delete the ADR's *"Plugins and consumers share the `data` namespace"* consequence, which was recorded as today's behaviour rather than decided.

## Parked — do not design against this here

**Let the consumer decide how a value rolls up, in the Rollup callback, groups included.** An Aggregator is already a consumer-written function, but it only answers *what value* — never *whether this parent derives at all*, or *what a group does differently from any other rolling-up kind*. The escape hatches this ADR reaches for are all Field-wide or kind-wide: `rollUp: 'none'`, `rollUpKinds`, the deferred per-entry pin flag. A per-call answer from the Aggregator itself would cover all three and would give the refusal at `entries.update()` a documented way out.

Raised 2026-09-08, during this ADR's review. **It changes nothing in this plan.** Group C ships the blanket rule, and this is the shape of the escape hatch that comes after — a separate design with its own ADR. Written down so it is not rediscovered as a defect.

## Gate

**The prose sweep is mechanical, not a reading.** Section F lists what a person found. A person missed `plans/s2-data-core/s2.6-serialization.md:76`, which states the consumer rule in the old word. Keep the F table as well — it tells a reader what changed and why. The grep only proves nothing was missed.

**The grep has to be scoped, or it is not a gate.** Over `plans/ docs/ src/` it returns **648 hits across 121 files** at HEAD — `import.meta`, every superseded ADR, and this folder's own review files. ADR 0006 rules that an ADR is superseded, never edited, so history is *supposed* to keep the old word. Scope it to the live surface:

```
grep -rn '\bmeta\b\|FieldSource\|source: {' src/ harness/ CONTEXT.md CLAUDE.md \
  plans/00-overview.md plans/01-domain-architecture.md plans/02-public-api.md \
  | grep -v 'import\.meta'
```

**Which `plans/` files are live spec:** `00`–`04` only. Everything under `plans/s*/` is the record of a finished slice — it is edited when a decision it records is retired (that is section F's job, listed row by row), and it is **not** part of the gate. This grep returns **453** at HEAD and must return **0** after group A. A non-zero count is a missed row in F, not a reason to widen the exclusions.

`pnpm verify:full`, and its **last line** is the answer — `verify:full PASS — …` or `verify:full FAILED at check N of M: …`. Capture it with a redirect, never a pipe: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. A pipe makes `$?` read `tail`.

Review `harness/main.ts` and `harness/planner.ts` on every commit here, changed or not. The harness is the library's first consumer, and this redesign exists because its casts and its two disagreeing generics were the evidence.

## Naming already landed

`9c3f704` renamed the conversion family before this work started, so write against the current names: `toStoredEdit` / `toStoredEdits` (was `readEdit`), `toEditReading` / `toEditsReading`, `toEntry` / `toEntries`, `fromDocument` (was `readDocument`), `toDocument` (was `toJSON` inside `data/serialization`), `entryAfterEdit` (was `overlayStoredEdit`), `extraEditsReadingFor` (was `DatasetState.readExtenderEdits`). Result nouns kept their word: `EditReading`, `EntryReadContext`, `readers`, `entry-reader.ts`.

**One rename is still owed, and it is group A's:** `StoredEdit` → `ProposedEdit`, and `toStoredEdit` → `toProposedEdit` with it. The ADR gives the word *stored* to the Field union, and a `StoredEdit` is never stored — it is a write nobody has applied, published as `request.proposed`. Groups B onward are written in the new names. Until A lands, today's code still reads `toStoredEdit`.

**Two Document doors, two levels, and they are not synonyms.** Public: `dataset.toJSON()` and `Dataset.fromJSON()` (`src/api/dataset.ts:312,326`). Internal: `toDocument` and `fromDocument` in `data/serialization`, which the public pair calls. This plan names the function it changes; the ADR names the door a consumer calls. Neither file may use one word for the other.
