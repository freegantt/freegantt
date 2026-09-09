---
status: proposed — draft, not a decision. Revised four times: after adversarial review, after the ruling changed from flat properties to a kept namespace, after the 2026-09-09 survey of comparable products, and after the 2026-09-09 consistency review, which closed six decisions and found eight defects in this file. Supersedes ADR 0005's `meta` rulings if accepted. **Ten blocking decisions are unmade** — see the last section, which is the only list of them. Closed decisions and their rulings live in [`plans/adr-0011-field-redesign/closed-decisions.md`](../../plans/adr-0011-field-redesign/closed-decisions.md).
decided: the namespace is `props`; a Field key is the whole address, so `FieldSource` retires; consumer values keep a namespace; a derived value never persists; a rolling-up parent's rolling-up Field is not editable; `editable: false` refuses `entries.update()` as well as the cell editor; a kind conversion promotes and demotes; a demoted Entry is a normal Entry with no dates; an Entry that starts rolling up drops its authored values and the Rollup recalculates them, with the drop in undo and no error; a plugin cascade's write to a derived cell is dropped with a warning; a `props` key naming a core key is a warning and the core definition wins; the Document is a save format rather than an interchange format.
undecided-and-load-bearing: whether an undeclared key may be written (decision 1); where a plugin's values live (decision 9); whether a Field key carries an ownership marker (decision 12). **Decisions 9 and 12 are one decision, not two** — see 9.
---

# Consumer values live in `props`, and a derived value never persists

ADR 0005 gave a consumer Field a declaration and left it without a home. `FieldSource`'s stored arm is `{ from: 'entry'; field: CoreFieldKey }`, and `CoreFieldKey` is `keyof Omit<Entry, 'id'>`. A consumer who writes `source: { from: 'entry', field: 'cost' }` gets a type error. So every consumer value lands in `meta`, and ADR 0005's own promise — *`'start'` and `'cost'` go through one code path* — is true of the declaration and false of the storage. The half a consumer cannot reach is the half that works.

The bag then pays for itself twice over. `update('t1', { cost: 7 })` merges and keeps `owner`; `update('t1', { meta: { cost: 7 } })` replaces and drops it. Both compile, and the destructive one reads better in English. A `meta` holding an array is replaced by an object, because `metaRecord` answers `{}` for an array. Two generics name the same set of values and nothing links them — `harness/planner.ts:31` writes `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, where the two disagree about `critical`, and neither the compiler nor the runtime notices. Every read of a `meta` Field allocates, because `metaStrategy.read` spreads the bag before one property lookup. And `meta` names four things at once (#266): a storage location, a Field key, a `FieldSource.from` value, and a Document key.

**A Field key is the whole address.** `{ key: 'cost' }` reads and writes `entry.props.cost`. `{ key: 'start' }` reads and writes `entry.start`, because `start` is a core key. Nothing declares a `source`: the key decides the home, and which home that is stays the library's business. `FieldSource` retires with all three arms — a Field either stores at its own key or declares `compute` and stores nowhere. **Declaring a key does not create it; declaring says what the library may do with it.**

**Consumer values keep a namespace, and it is named `props`.** One key space, two homes. Field keys stay in a single namespace, which is what lets one name serve `field` on a changeset row, `canWrite(entry, field)`, and `gridColumns: ['name', 'cost']`. Storage is namespaced underneath: the core keys sit on the Entry, and every other Field's value sits in `props`. So a consumer key cannot shadow a core key, a core key added in a later release cannot land on a consumer's value, and the Document reader keeps the rule it has today rather than inverting it. `meta` is renamed on `Entry`, `EntryInput` and `EntryDocument`; the `meta` core Field is deleted with no successor, because a whole bag is not a value a grid shows or a Rollup aggregates.

**The name is `props`.** Ruled 2026-09-09 by the author. `data` was the draft's word and it is rejected: `data/` is a core layer, so `data` would name a layer and a bag at once, and the mitigation on offer was a prose convention — *write `data/` for the layer and `entry.data` for the bag*. That is the move #7 already cost a review: "chart" named the public instance and an internal class, and the fix was to retire the word, not to pick a rule and trust context. `plans/02` says a generic word covering two concepts is a bug, not a style nit. `props` collides with nothing in `src/`, checked. What it costs is one inversion for a reader arriving from tldraw, where `props` is the library's schema and `meta` is the consumer's bag. That is one product's pairing against a collision on every page of this repo. The rule that a rename would have owed — the `data/`-against-`entry.data` glossary line — is deleted rather than written.

**The library writes into `props` only at a key the consumer declared with `rollUp`.** This is the invariant that keeps the Vaadin failure in decision 9 from being our own. The Rollup writes a derived value into a *consumer's* bag, which is the same shape as a library writing into `extendedProps` — and it is safe for exactly one reason: the consumer asked for it, in the declaration. **An undeclared key is never written by the library, ever.** State it wherever `props` is documented. Without it, decision 9's "prefix the plugin" mitigation looks complete, and it is not: a plugin is not the only second writer in the bag.

**An edit carries the Entry's own shape, and `props` merges.** `entries.update(id, { start: '2026-01-06', props: { owner: 'Sam' } })` writes one date and one consumer value, and keeps every other key in `props`. Nesting is not what makes today's write destructive; **replacing** is.

**`mergeEntryEdits` merges one level too few, and the nesting is what exposes it.** `data/edit-extension.ts:38` composes two extenders with `{ ...merged.get(id), ...edit }`, and its own comment promises *"`extra` wins per Field key, and every other key of both edits survives, at any composition depth (#238)"*. That promise holds while every Field key sits at the top level of an `EntryEdit`. Once consumer keys sit inside `props`, two extenders that each write a different `props` key lose one — which is #197 again, one level down. **`mergeEntryEdits` merges `props` per key**, and it lands in group A beside the type it follows.

**What the namespace costs is the shorthand, and this is the bill.** `plans/02:459` ships `update('t1', { start, cost })` — *change start and cost*. This ADR ships `update('t1', { start, props: { cost } })` — *change start, and a bag*. One sentence names two Fields; the other names one Field and a container. The trade is deliberate: a flat edit beside a nested store makes the object a consumer writes disagree with the object the library holds, at the one door a consumer uses most, and the safety a flat edit looked like it bought is bought by merging instead. It is still a loss, and `plans/02`'s *common case is a shorthand* principle does not survive it for Field writes. Say the cost; do not call the nesting a feature. **Contested — decision 11**, which carries a third option this paragraph does not consider: a flat spelling for **declared** keys only, over a top level that stays closed.

**Merging is the whole fix, and it is one rule at one door.** `toProposedEdit` reads a patch into a complete `props` record, the same way it already reads a loose date into an `Instant`. Nothing is applied there — a `ProposedEdit` is documented as storage-shaped and complete, and this keeps it so. (`toProposedEdit`/`ProposedEdit` are `toStoredEdit`/`StoredEdit` today; the rename is a consequence of this ADR, below, and this file writes the after-state throughout.) `metaStrategy.write` already reads the Entry's own bag as the base, so the merge exists and only moves. Ingest supplies a record and an edit patches one, so `props` is `Partial<TProps>` on `EntryInput` and `PropsEdit<TProps>` on `EntryEdit`, and the types say which door is which. An explicit `undefined` inside a patch clears that one key — the only way to say *remove*, and the way today's write path already reads it.

**The completeness guarantee has to be in the type, and today it is not.** `model/entry.ts:108` ships `StoredEdit = Partial<Omit<Entry, 'id'>> & { proposedKeys? }`, so after the rename `proposed.props` reads `Partial<TProps> | undefined` — an absent value the paragraph above says never happens. Write `ProposedEdit`'s type; do not only rename it. **`props` is required on a `ProposedEdit`.**

**The rename also costs an enforcement, and the loss is at the seam it matters most.** `model/entry.ts:98` states today's rule: *"Every `StoredEdit` is a legal `EntryEdit` — an `Instant` is an `InstantInput` — and the reverse is not. That asymmetry is the enforcement."* It holds because `Instant` and `InstantInput` are different types. At the `props` key it stops holding: a **complete record** and a **patch** are structurally the same shape, so the compiler cannot tell them apart, and *complete against patch* becomes prose. The footgun is concrete and it sits on the plugin-author surface. A plugin reads a complete `props` off `request.proposed`, spreads it into a returned `EntryEdit` — the natural spelling, since that is the object it was handed — and thereby proposes **every** key, derived ones included. `toProposedEdit` seeds `proposedKeys` from the patch's own keys, so every one of them becomes a ChangeSet row. That is decision 5's territory reached by accident rather than by intent. **Brand the two shapes apart, or make the plugin door take the patch shape only.** Do not leave the distinction to the doc comment. This is `plans/02`'s *one write shape, one knob* breaking at the one seam it was written for.

`PropsEdit` is that patch, and `Partial<TProps>` cannot be it. Under `exactOptionalPropertyTypes` a `Partial` property accepts an absent key and refuses an explicit `undefined` (`TS2375`), so `Partial` deletes the remove verb. **Every key of `props` is removable, without exception**, because the storage door already says so: `props` is `Partial<TProps>` everywhere, so *no* key of `TProps` is one the stored record must hold. A type that protected a required key would refuse a write into a state `add({ id, name })` reaches on its own — the same key, two doors, two answers. `TProps` says which keys may exist, never which keys must, and the edit type says it too:

```ts
/** A patch of `props`: every key optional, and every key removable by an explicit `undefined`.
 *  There is no protected key, because `props` is `Partial<TProps>` at every storage door — a key
 *  `TProps` marks required is still a key the stored record may not hold. */
export type PropsEdit<TProps> = { [K in keyof TProps]?: TProps[K] | undefined };
```

**The patch merges one level deep, and never recurses.** `update(id, { props: { address: { city: 'Ely' } } })` replaces the whole `address` object. It does not reach inside it. The reason is the ChangeSet, not convenience: a row is `{ field, from, to }`, and `field` is a Field key. A recursive merge changes `props.address.city`, which no Field key names — so no row can describe it, no undo can replay it, no subscriber can observe it, and no `equals` applies to it. **A patch may only name what the model can name.** A consumer who wants a nested value tracked declares it as its own Field key, or accepts whole-object replacement.

**This is where we part from JSON Merge Patch, and the reason is the medium.** [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396.html) merges recursively and spells removal as `null`. Both choices are forced by its medium and neither binds us. A merge patch **is a JSON document**, sent over HTTP as `application/merge-patch+json`, and JSON has no absent value — so a removal has to overload one of the seven values it does have, and the RFC states the resulting limit as a scope condition rather than a virtue: merge patch suits documents that *"do not make use of explicit null values,"* and *"is not appropriate for all JSON syntaxes."* Our patch is a TypeScript object passed to a function call. JavaScript already carries an absent value, and `Partial<T>` already means it, so `undefined` removes and **`null` stays an ordinary value a consumer may store**. On depth the RFC reasons the way we do and stops one level lower: it replaces an array whole, because *"it is not possible to patch part of a target that is not an object."* We draw the same line at the Field key, because that is the smallest thing our changeset can name.

**One boundary this leaves the consumer, and it is theirs to cross.** A patch that arrives as JSON — from a server, from a form — cannot say *remove*, for exactly the RFC's reason. A consumer who accepts wire patches translates `null` to `undefined` at their own edge, or calls `update` twice. The library does not read `null` as a removal: doing so would buy wire compatibility by forbidding a stored `null` forever.

**The Entry's own keys take the opposite rule, and the difference is the point.** `Partial<Omit<EntryInput<TProps>, 'id' | 'props'>>` cannot be the envelope: `start` and `end` are optional after this ADR, so `update(id, { start: undefined, end: undefined })` is the un-date verb, and `Partial` refuses that call (`TS2379`, probed at HEAD) for the identical reason it refuses a removal inside `props`. But mapping *every* envelope key removable is wrong in the other direction, because **optional at ingest does not mean removable by an edit**. `kind` is optional on `EntryInput` only because ingest defaults it to `'span'`; the stored `Entry.kind` is always there. The removable keys are named, not inferred:

```ts
type EntryEnvelope<TProps> = Omit<EntryInput<TProps>, 'id' | 'props'>;

/** **An edit may remove exactly what a stored Entry may lack.** Derived from `Entry`, never
 *  hand-listed: `EntryInput`'s optionality answers a different question — `kind` and `segments`
 *  are optional there only because ingest fills them, and a stored Entry always holds both. */
type OptionalKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type RemovableEntryKey = OptionalKeysOf<Entry> & keyof EntryEnvelope<unknown>;

export type EntryEdit<TProps> = {
  [K in keyof EntryEnvelope<TProps>]?: K extends RemovableEntryKey
    ? EntryEnvelope<TProps>[K] | undefined
    : EntryEnvelope<TProps>[K];
} & { props?: PropsEdit<TProps> };
```

**One shared mapped type over both halves is not available, and it was tried twice.** A type called `EditOf` was drafted to serve `PropsEdit` and `EntryEdit` at once, published into the working documents, and found wrong in **both** directions on the next pass: it protected a key `TProps` marks required, which the storage door already lets a stored record lack, and it let `update(id, { kind: undefined })` compile. The halves take opposite rules, so there is nothing to extract. Written down because the two declarations look factorable and the mistake was made twice.

**Deriving it is the point, not a trick.** `RemovableEntryKey` resolves to `'parentId' | 'start' | 'end'` today — probed, and probed equal to the hand-written union. The derivation states the rule the hand-written list only *encoded*, and it is self-maintaining: the moment `Entry.end` stops being optional, or a new optional key joins `Entry`, the edit type follows without anyone remembering to update a second list. A hand-written union is a rule that has to be re-derived by a reader and re-checked by a maintainer, and this ADR already got that list wrong once in the opposite direction.

`props` is **omitted before it is restated**, because an intersection cannot narrow a property the interface already declares. `id` leaves with it: an edit names its Entry at the call, never inside the patch. Each half is a type test: `{ start: undefined }`, `{ parentId: undefined }` and `{ props: { owner: undefined } }` compile — the last one with `owner` **required** on `TProps`; `{ kind: undefined }`, `{ name: undefined }` and `{ segments: undefined }` do not.

**The probe ran against group D, not against HEAD, and an earlier draft of this section said "probed at HEAD".** `model/entry.ts:31,33` ship `start: Instant` and `end: Instant` as **required**, so at HEAD `RemovableEntryKey` resolves to `'parentId' | 'meta'`. It only resolves to `'parentId' | 'start' | 'end'` once group D lands. **That is an ordering hole, and the plan carries it:** `EntryEdit` lands in group A and the optional dates land in group D, so `update(id, { start: undefined })` does not compile for the three groups in between. The derivation is inert until D. Either move the optional dates forward into A, or state that the un-date verb arrives with D — do not describe it as available after A.

The name is `PropsEdit`, not `PropsPatch`: this type sits on the object an app author writes, and `*Patch` names a pipeline step (`plans/02`). It is exported, because a consumer who factors a helper over a props edit otherwise reaches for `Partial<TProps>` — the one type that cannot say *remove*.

**A rolling-up Field on a rolling-up parent refuses the write.** `view/capability.ts` already answers this for gestures: `isRollUpKind(entry.kind) && rollsUp(field)` returns `DERIVED`, so the cell editor and the bar drag both refuse. `entries.update()` answers the opposite, and the result is a value that commits, emits a changeset row, enters undo — and then reverts in silence the next time anything touches the subtree. Probed: `update('p', { cost: 999 })` stores `999`, and an unrelated rename of a child puts it back to `10`. **One question, one answer, at both doors** (I14). The rule moves into `data/`, where `rollsUp` already lives, and `view/capability.ts` asks the same source it asks today.

**`editable: false` refuses `entries.update()` too, and that is the same rule, not a second one.** Ruled 2026-09-09. An earlier draft asked whether the two doors differ and filed the answer to #256. They **do** differ, and it is verified: `editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field the consumer declared unwritable is writable through `entries.update()` today. Refusing a *derived* write there while permitting an `editable: false` write leaves the library with two answers to *"may this value change"* at two doors — which is the split I14 exists to close, and the split this ADR invokes I14 to close for the other half. **Both halves move together.** The whole write rule moves into `data/`, and `view/capability.ts` asks it rather than restating it. The error is `FieldNotEditableError`, a named `FreeGanttError` with a `plans/02` §7 row.

**One predicate answers it, and it is named.** Three rules now meet at one question — is this Field derived here, is it editable, and does it exist at all. `data/` exports one resolver and every **write** door calls it: `EntryStore.update()`, `view/capability.ts`, the cell editor, the bar drag. Do not re-ask the question in a second place. `toJSON` is not a write: it asks only the derived half, so it is a caller of that half, not of `editable`. The seven rows in the table below are seven callers of that shared test, not seven copies of it — that is what *one question, every door* means, and it is the difference between this landing as a rule and landing as mud.

**Two things follow that this ADR does not settle**, because both change the default posture of a public door rather than following from the ruling. They are decisions **18** and **19** below.

**A childless parent demotes to a normal Entry, with no dates.** Ruled 2026-09-09 by the author. There are no children left to calculate from, so `start` and `end` are absent. It draws no bar until someone dates it later, which a normal Entry may. `entry-reader.ts:170` gives a childless group a zero-length span at `referenceDate` today — a clock reading taken when the Dataset was built, never saved, so an empty group reloads somewhere else. There is no honest value to invent, and demotion does not keep the last derived envelope: that envelope was the children's, and they are gone. **`Entry.start` and `Entry.end` become optional on every kind**, not only on a rolling-up parent: an author adds a row now and dates it later, which is ordinary use, and the current `InvalidInstantError` for a dateless `'span'` refuses it. An Entry with no span draws no bar and still shows its grid row. This reaches further than one fill: bar geometry, the Segment invariant (*never empty*, #212), sort comparators and `range: 'fitDataset'` each gain an absent case. Four of those are visible to a consumer, so each gets an answer rather than a file to visit. `range: 'fitDataset'` over a dataset where nothing is dated shows the range an empty dataset already shows. A dateless Entry sorts **last** under every comparator, and the order is stable. A dateless row is **inert to a gesture**: it draws no bar, so there is no grip to grab and no drag creates one. An S7 link naming a dateless endpoint raises a diagnostic and draws nothing.

**Dates and Segments are one fact, stated once.** An Entry has dates **if and only if** it holds at least one Segment, and `start`/`end` are always the envelope of those Segments. One biconditional keeps the blast radius to one rule:

- `add({ start, end })` mints one Segment, as today.
- `add({ segments })` with no dates derives the envelope from them.
- `add({})` stores no dates and no Segments.
- `update(id, { start: undefined, end: undefined })` is the un-date verb, and it clears the Segments in the same write.

Two refusals stay, and both are about an author saying two things at once: one date without the other, and `segments: []` on its own (`EmptySegmentsError` — *never empty*, #212). The empty case is `add({})`, which names no segments rather than naming none.

**`FieldContext.durationOf` becomes `Duration | undefined`.** It computes `end − start` today, and a dateless Entry has neither. That is plugin-author surface and it changes with the dates. `fieldValue` and `ctx.read` already answer `| undefined`, so `CoreFieldValues` needs no change; the Aggregator that weights by duration skips a dateless child rather than weighting it at zero.

**A dateless row's `duration` cell is blank, and `durationOf` has to return `undefined` to make it so.** An earlier draft of this paragraph said no code changes. That was wrong. `field-access.ts:92` has no guard today — `diffMs(entry.end, entry.start)` — so an absent date yields **`NaN`, not a throw**. `formatDuration` returns `''` only for `undefined`/`null`; `{ value: NaN }` is neither, so the cell renders `"NaN d"`, and `weightedMeanByDuration` weights by `NaN` and poisons the parent's aggregate. Guard `durationOf` first — `if (entry.start === undefined || entry.end === undefined) return undefined` — and the blank cell and the skipped child both follow. An em dash or a `'—'` placeholder is not invented here: a blank cell is what an absent value looks like everywhere else in this grid. The call-site list lives in the plan's group D; do not re-derive it.

**A zero-length span stays legal, and D-S5-46 needs no rewrite.** D-S5-46 rules that the mutation boundary refuses an inverted span and admits a zero-length one. It was opened: its two stated reasons are the half-open interval `[start, end)` and `layout/gesture-draft.ts`'s resize clamp. **Neither is the `referenceDate` fill**, so deleting the fill leaves that decision standing as written. A milestone is one instant, and that is an authored shape.

**The fill is written down under D-S2-10 and D-S2-22**, and both say it. Delete it in both places, and do not go looking for it in D-S5-46.

**A derived value lives in the store and never reaches the Document.** The Rollup writes a parent's `start`, `end` and `cost` today, and `toJSON` writes all three out as though a person authored them. `fromJSON` reads them back and the Rollup overwrites them. When the stored answer and the written one disagree, the written one loses in silence: a parent `cost: 999` over a child `cost: 10` imports as `10`, with no warning and no `rollup-corrected` report — that pass compares `start` and `end` only. **A value the Rollup would reproduce exactly is not written.** A stale derived value stops being possible rather than being detected.

The two rulings hold each other up. The refusal means nothing but the Rollup can put a value in a rolling-up parent's cell, so omitting it loses nothing a person authored. Without the refusal, omission drops user edits.

## Example

```ts
interface ConsumerEntryProps {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<ConsumerEntryProps>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },
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

dataset.entries.get('t1')?.props.owner          // 'Jo' — typed by ConsumerEntryProps
dataset.entries.fieldValue('t1', 'owner')      // 'Jo' — the same value, read by key
dataset.entries.update('t1', { start: '2026-01-06', props: { owner: 'Sam' } })
```

**Two doors read one value, and each answers a different question.** `entry.props.x` is the stored bag, typed by `TProps`. `fieldValue(id, key)` reads *any* Field key — `start`, a `compute` Field, a plugin's. Both stay, and every comparable library publishes the same pair: AG Grid's `node.data` beside `getCellValue`, TanStack Table's `row.original` beside `row.getValue`, Bryntum's generated accessor beside `record.get`. The record door returns storage; the by-key door resolves getters and aggregates.

**The by-key door keeps its type, and an earlier draft of this ADR said it lost it.** `model/dataset.ts:41` ships `fieldValue<K>(id, field): FieldValue<TFields, K> | undefined` today. `FieldValue` maps over the **generic**, never over the registry, so one generic carries it across unchanged as `FieldValue<TProps, K>`: a core key reads as its shipped type, and a key `TProps` declares reads as the type the consumer wrote. Two value classes stay `unknown`, and both own no `TProps` key — a `compute` Field's answer, and a plugin's Field. That residue is [#267](../../issues/267), and this ADR does not close it. Where a caller knows the type and the generic cannot, a type argument names it at the call, the way AG Grid's `getCellValue<TValue>` does.

`phase` carries no declaration. It is a value the consumer wrote at ingest and a bar renderer reads. It needs no type bundle, no rollup, no editor and no column, so it needs no Field. **Declare a Field when the library has a job to do with the value, not to make the value exist.** Whether *editing* is one of those jobs is **decision 1**, re-opened on 2026-09-09: `phase` is either writable with no declaration, or writable only once one line declares it. Either way it needs no type bundle, no rollup and no column, so the sentence above holds under both answers.

The Field union is exclusive. A stored Field may roll up and may be edited; a computed Field may do neither.

**A `compute` Field runs on every row, a rolling-up parent included — decision 10, closed 2026-09-09.** The union closes *storage*, not *reading*. A `compute` Field that reads `entry.props.cost` on a rolling-up parent sees the value the Rollup already put in the store: a stored read, not a second rollup, through a door the union never closed. It changes what a cell shows and never what the store holds. The alternative — blanking `compute` on every group row — puts `{ key: 'ref', compute: (e) => rowNumber(e.id) }` at a blank cell on every group, which a consumer reads as a bug. **The limit worth naming is the real one:** a `compute` Field cannot ask *am I a parent?*, which is [#214](../../issues/214).

```ts
type Field<TValue = unknown> =
  | { key: FieldKey; type?: FieldTypeName; rollUp?: AggregatorName; editable?: boolean;
      compute?: never; /* equals, compare, formatValue, parseValue, inputType, column */ }
  | { key: FieldKey; compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      rollUp?: never; editable?: never; /* compare, formatValue, column */ };
```

The union is a declaration-site aid, not the enforcement. `FieldRegistry`, `DatasetOptions.fields` and `FieldLookup` all hold bare `Field`, so excess-property checking fires only where a literal is written. `FieldRegistry` throws `ComputedFieldCannotBeWrittenError` for `compute` beside `rollUp` or `editable`, the same way it already throws `UnknownAggregatorError`. It is a named `FreeGanttError` with a `code:` and a `plans/02` §7 row, like every other.

**`TValue` is a declaration-site aid too, and nothing reads it back.** Those same three holders take bare `Field`, so `fieldValue(id, 'ref')` answers `unknown` for a `compute` Field, no matter what its arm returned. The parameter checks the function a consumer writes; it does not type the value a consumer reads. **The erasure at the registry is the cause, and it is not a limit of the read door** — a key `TProps` declares types through `FieldValue<TProps, K>` without the registry taking part. So the gap is exactly the values that own no `TProps` key. Closing it is a Field-aware renderer read, which is [#267](../../issues/267) and not this ADR.

**A `compute` arm takes the row and the context, and each carries what the other cannot.** `entry` is the row. `ctx` is everything else the library knows about it: the dataset's zone, a read by Field key, and the entry's duration. `entry.props.x` reaches a stored consumer value and nothing else — not a core key that owns no place in `props`, not `duration`, which is computed and owns no `Entry` key, and not another Field's `compute` arm. `ctx.read(entry, key)` reaches all three. **The rule in one line: read a *value* through `entry.props`, and read a *Field* through `ctx.read`.** That is the two-doors split above, one level down. Whether `ctx` should bind to the row rather than take it back was decision 14, closed 2026-09-09 as a measurement task rather than a decision (`closed-decisions.md`).

The name is `compute`, not `get`. Read the call site aloud: *"field `ref`, compute a row number from the entry."* `get` already names three unrelated jobs here — `entries.get(id)`, `FieldLookup.get(key)`, `registry.get` — and `compute` keeps the vocabulary `source: { from: 'compute' }` already teaches.

## The flow, once

`dataset.entries.update('t1', { props: { progress: 60 } })`, on a child of a rolling-up phase:

1. **Read.** `toProposedEdit` normalizes dates through `time/` and merges the patch onto the Entry's own record, so a `ProposedEdit` always carries a complete `props`. It seeds `proposedKeys` from **inside** the namespace: the edit's top-level keys except `props`, plus every key of `edit.props` that this write is allowed to name. Whether an **undeclared** key may be among them is **decision 1** — the recommendation is that `update()` throws `UnknownFieldError` and ingest still carries. This example names `progress`, which is declared.
2. **Extend.** The extension hook runs once. A plugin's cascade returns more `EntryEdit`s, read through the same door.
3. **Diff.** `diffEdit` emits one row: `{ store: 'entries', id: 't1', field: 'progress', from: 40, to: 60 }`. The row names a Field key, never a path into `props`, so unwrapping the patch is the whole difference the namespace makes here. Today a whole-`meta` write emits two rows for one value — one for `meta` itself, one for the key inside it. The `meta` Field is deleted, so the second row has nothing left to come from.
4. **Roll up.** The pass walks ancestors, runs `weightedMeanByDuration`, and writes `phase-1`'s `progress` into the store.
5. **Commit.** One changeset holds the child row and the parent row. One undo step reverses both.
6. **Write.** `toJSON` omits a rolling-up kind's rolling-up keys. `phase-1` is written without `progress`, `start` and `end`.
7. **Read back.** `fromJSON` reads the core keys by name and carries `props` across, undeclared keys included. The construction Rollup fills `phase-1`. There is nothing to correct and nothing to warn about.

**Step 6 asks one structural question.** Is this Entry a rolling-up kind, and is this a rolling-up Field? Then the value is derived, and it is not written. Nothing compares values, nothing tracks what a pass produced, and nothing depends on how many children a parent has right now.

That test is the same one `view/capability.ts:119` already asks to refuse the cell editor and the bar drag. **One question, every door.** I14 is the *write* half of it — one `canWrite` behind every gesture and every write. `toJSON` is not a write, so it is the same question asked by the writer, not a fifth `canWrite`. Do not claim I14 for the omission.

**Seven doors, one derived test.** Every write row below is a *caller* of the one write rule in `data/`, never a copy of it. `toJSON` asks only whether the value is derived.

| Door | Kind | Answer |
|---|---|---|
| cell editor, bar drag | write | refused today (`view/capability.ts:119`) |
| `entries.update()`, derived cell | write | refused — the change this ADR makes |
| `entries.update()`, `editable: false` | write | refused — the 2026-09-09 ruling. Permitted today |
| `entries.add()`, `fromJSON`, `new Dataset({ entries })` | write | value **dropped**, with a report raised |
| the extension hook (a plugin cascade) | write | write **dropped**, with a warning raised — decision 5, closed |
| autoGroup promotion | write | dates change owner mid-commit — see below |
| `toJSON` | writer | key **omitted** |

**Promotion is a door, and nobody aimed at it.** An Entry authored with dates becomes a rolling-up kind the moment it gains a child under autoGroup — `fixtures/hierarchy-dataset.ts` authors exactly that shape. Its dates were authored, they are derived from that commit on, and no call named a derived Field. Promotion is the third way an Entry becomes a rolling-up kind, beside `kind` at ingest and a `rollUpKinds` flip. The Rollup recomputes its dates from the new child.

**Promotion demotes as well, and today it does not.** `hierarchy.test.ts:116` pins the current rule by name: *"removing every child demotes nothing."* So an Entry that gains a child and loses it again stays a rolling-up kind for the rest of its life. After the omission rule above that would hold no dates and draw no bar, with no call responsible. **`plans/01` §2.5 already chose that position on purpose:** *Promote only, never demote — demoting on losing the last child would reintroduce exactly the flickering identity this rule exists to prevent.* This ADR overrules that clause. **No comparable product ships promotion without demotion.** Microsoft Project derives summary status from outline structure, so outdenting the last child ends it. Bryntum derives `isLeaf` from `children`. DHTMLX Gantt's `auto_types` converts a task to a project when it gains children *and converts it back when they go*. **The conversion runs both ways, and stays automatic.** On demotion the Entry becomes a **normal Entry with no dates** — there are no children to calculate from, so `start`/`end` are absent, and it can be dated later. What **kind** it returns to is decision **8**. Whether `'group'` survives as an authored kind at all, once structure decides parent-ness, is decision **20**. Group F rewrites §2.5's promote-only / flickering-identity sentence.

**An authored value on a derived cell is dropped, and the library says so.** A consumer who writes `{ id: 'p', kind: 'group', props: { cost: 500 } }` gets no `cost` on `p`. Keeping it needs a second storage slot beside the derived value — a shadow copy of one Field, which is the old bag again under a worse name. Echoing it back on `toJSON` is worse still: the moment a child changes, the echoed number is a wrong answer wearing an authored value's clothes. Dropping it is the only option that cannot lie.

The changeset row for that `add()` carries the Entry **as stored** — after the drop, and after ingest fills `props: {}` and the Segments. One `EntityAdded` row holds the whole Entry, and the row states what the store now holds rather than what the call passed. A row carrying the authored value would show every subscriber a value that is not there, and undo would replay one the same door just refused.

**`update()` refuses; `add()` drops. A patch is not a record.** Name a Field and the library answers; hand it a record and the library keeps what is yours. That is PATCH against PUT, and it is the whole rule. `update()` is a patch: the caller named `cost`, so refusing tells them the exact thing they asked for is not theirs to set, and it throws `DerivedFieldNotWritableError`, a named `FreeGanttError` with a `plans/02` §7 row. `add()`, `new Dataset({ entries })` and `Dataset.fromJSON()` carry records: an Entry's shape has a `start`, an `end` and a `props`, and carrying them is not naming them. A file exported by another tool dates its parents, and throwing at it would reject an ordinary import over a key the author never chose. Bulk is a consequence of that split, not the reason for it — `add()` of one Entry drops too. A **mixed** patch — `{ start, props: { cost } }` where `cost` is derived — is refused **whole, before any write**. Applying the date and dropping the rest would leave a transaction in a state no `before*` event described.

The refusal lives at `EntryStore.update()`, **not** in `toProposedEdit`. That placement is the whole of the plugin-author story: the extension hook reads through the same conversion, so a refusal there would bind a cascade, and a refusal at the public door cannot. A plugin author learns no rule, checks no predicate and passes no flag — the exemption is a fact about where one guard sits. **What the exemption buys the plugin is nothing, and decision 5 closed it that way**: the cascade is exempt from the *throw*, and the write is then dropped where the hook's writes are read, with one warning. Exempt from the throw was never the same as *the write survives the pass*.

**One report per operation, not per value.** A hand-written Document with 500 groups over three rolling-up Fields would otherwise raise 1,500 warnings, each with a `console.warn` behind it. A consumer fixes their whole export at once, so per-value reports carry nothing extra. The report names the count, the Field keys, and up to three Entry ids.

**The report is not dev-gated.** `reportCorrectedRollUps` was gated on `isDevMode()` until S5.12, and that flag resolves when *this repo* builds `dist/` — so the whole pass was eliminated from every consumer build and no consumer ever saw a line of it (D-S5-41). This report goes through `raiseError` at `severity: 'warning'` (ADR 0009), always, with `console.warn` behind it only when nothing is subscribed to `error`.

**One finding this exposes, tracked as #270.** `rollup.ts:208` skips a declining Aggregator **that saw children** — a childless parent never reaches an Aggregator at all (`rollup.ts:184,191` skip it first). So a parent whose children stopped supplying values keeps the last answer the Aggregator produced. Once the Document omits derived values, a re-read runs the Aggregator again and answers "no value" while the live store still answers `10`. The re-read is correct.

## Considered options

- **Flat consumer properties on the Entry, in one key space with `start`.** This was the previous draft's ruling, and it is rejected. Its one gain is a single storage home. It charges for that at four other places: the Document reader's unknown-key rule inverts, so an unknown top-level key becomes consumer data; three reserved name sets appear at three doors, the proposed edit's own `proposedKeys` among them; an older file whose consumer key a later release promotes to a core key needs a migration door of its own; and the internal `Entry` lists the core keys while the runtime object also carries `owner` and `phase`, which only an index signature closes — and that signature makes `entry.strat` compile. A namespace costs one indirection and pays all four back.
- **Flat consumer keys on the edit alone, with `props` everywhere else.** Rejected, and it was this draft's own first answer. It saves one unwrap at the differ and costs a shape: `props` would name the namespace at ingest, on the stored Entry and in the Document, and not on the object a consumer writes most often. The safety it looked like it bought is bought by merging instead. **A narrower variant is live as decision 11 and is not covered by this rejection:** flat for **declared** keys only, over a top level that still refuses an unknown one. What is rejected here is the open form, where any consumer key may sit flat.
- **Keep the namespace under its current name, `meta`.** Rejected. `meta` names four things (#266), and three of them go here; keeping the word for the survivor keeps the ambiguity in the glossary for no gain. It is also the wrong word: "meta" says *about the data*, and the contents are the data.
- **Keep the namespace in the Document only, with flat runtime entries.** Rejected. The runtime shape and the Document shape would then disagree about where a value lives, so the reader and the writer would each move every consumer key across a boundary, and every seam between them would have to know which side it stood on.
- **Keep `meta` and open `FieldSource`'s entry arm to any key (the small fix).** Rejected: it leaves the declaration carrying an address the library should own, so the three-arm strategy table, the second generic and the whole-bag write all survive. The bag stops being mandatory and stays available, which is the worst of both.
- **Read consumer values through an accessor and never store them.** Rejected. Reads alone would carry four of the planner's five fields, and a Gantt whose grid edits, undoes and aggregates a consumer value has to hold it.
- **A nested accessor path (`accessor: ['finance', 'approved']`).** Deferred. It costs a compiled reader, an immutable path writer, path equality, undo through a path and a Document rule, and a Gantt has no case for it yet. The Field key names the value; `column.header` names what a reader sees. It is an additive optional key whenever a real consumer needs one.
- **Record what the Rollup wrote, and omit that set.** Rejected — see the table above. It needs a cumulative set that no `ChangeSet` can carry and that five reachable seams invalidate.
- **Persist derived values and report a correction on import.** Rejected: it keeps a value whose meaning depends on declarations that may not travel with it. Generalizing `reportCorrectedRollUps` past `start`/`end` would find the disagreement; not writing the value stops the disagreement existing.
- **Let a rolling-up parent cell be edited, and distribute the value down to the children.** Rejected as a default. It is a real model — a comparable data grid ships `groupRowEditable` with a value setter and distribution strategies — but a distribution rule is a per-Field policy with no defensible default (split evenly? by duration? by current share?). Refusal is the honest answer until a consumer names the policy.
- **Let a per-entry flag turn derivation off, so the write sticks.** Deferred, and it is the escape hatch a comparable Gantt uses: its summary fields are UI-disabled *except on a manually scheduled parent*. FreeGantt's analogue is the per-entry pin flag, which is scheduling-plugin data (ADR 0002) and lands in S7. Until then a Field-wide `rollUp: 'none'` is the only opt-out. **The deferral carries decision 6's surviving half, which its ruling did not touch:** two comparable products put *"do my values derive?"* on the record and neither ships anything like `rollUpKinds`, so the flag may be the axis rather than the escape hatch. Decision 6 ruled only what a *flip* does — it drops and recalculates. Whether the kind set is the right axis at all is **parked, not blocking**, and it sits beside decision **20**: both ask whether structure or a stored value should decide how a row behaves.
- **Publish an ownership ladder now (managed, custom setter, controlled writes).** Rejected for this ADR. It is an escape hatch from a storage model being replaced. Revisit when a consumer asks.
- **`internal: true` for `parentId` and `segments`.** Rejected. An absent `column` already means "not a column", and `gridColumns` naming such a Field already throws `FieldNotColumnableError`. A second key for one job breaks *one config tree per job*, and the ADR could not name a question `internal` answers that nothing else does.

## Consequences

- **The write path is the one that already exists.** `metaStrategy.write` already builds a complete record from the Entry's own values plus the one key it is given, and `diffEdit` already emits one changeset row per declared key through `proposedKeys`. Deleting the strategy table removes a dispatch, not a mechanism. This is the smallest half of the change; the Document, the derived-value rule and the optional dates are the large ones.
- **`props` is the one reserved key, and there is no reserved *set*.** Declaring `{ key: 'props' }` throws, because a whole namespace is not a Field. It throws at **runtime** only: `FieldKey` is `CoreFieldKey | (string & {})`, so the literal type-checks. That is the brand doing its job — it offers the core keys to a completion list while accepting any consumer string — and it is written here so that nobody later "fixes" `FieldKey` into a closed union and flattens the brand. A consumer key never sits at the top level of an edit or of a `ProposedEdit`, so `proposedKeys` cannot be shadowed by one and needs no guard of its own. `EntryEdit` omits that one key and restates it — `props?: PropsEdit<TProps>` against `EntryInput`'s `props?: Partial<TProps>` — because an intersection cannot narrow a property the interface already declares, and because the two doors take different shapes.
- **`CoreFieldValues` moves with `CoreFieldKey`, and the plan missed it.** `model/field.ts:19` ships `CoreFieldValues extends Omit<Entry, 'id'>`, and `model/field.ts:34`'s `FieldValue` resolves its first arm against it. Change `CoreFieldKey` to `keyof Omit<Entry, 'id' | 'props'>` and leave `CoreFieldValues` alone, and `fieldValue(id, 'props')` **types as the whole bag** while the registry throws and `fieldValue` throws `UnknownFieldError` — a public type promising a value the runtime refuses. `CoreFieldValues` is exported at `api/index.ts:57`, so the leak is on the public surface. Both types omit `'props'`, or neither does.
- **A removal is an ordinary write.** The stored record loses the key rather than keeping it under `undefined`, because a record holding `undefined` and a record missing the key serialize to one file and read back as one shape. The changeset row is the usual one, `{ field: 'owner', from: 'Jo', to: undefined }`, so undo restores the key by replaying `from`. The removed key sits in `proposedKeys`: the consumer proposed that Field, and an extender reading `EditRequest.proposed` has to see a proposal rather than an absent key.
- **One generic, written by hand, and it types two things.** `Dataset<ConsumerEntryProps>` types `entry.props` and the `props` patch an edit carries. It also types `fieldValue`, through `FieldValue<TProps, K>` — **an earlier draft of this bullet said it did not, and that was wrong**: `FieldValue` maps over the generic, never over the registry, so the typing that ships at `model/dataset.ts:41` survives the loss of the second generic intact. What it does **not** type is a value owning no `TProps` key: a `compute` Field's answer, and a plugin's Field under decision 9. That residue is [#267](../../issues/267) and stays open. Whether `update()` also takes flat consumer keys is **decision 11**. One declaration for the bag at both doors is the whole claim, and it is enough: the `harness/planner.ts:31` disagreement — `Dataset<PlannerMeta, { owner?; progress?; phase? }>`, whose two halves differ on `critical` — becomes unrepresentable. Inferring the shape from the `entries` array stays possible later and is no longer load-bearing.
- **The internal `Entry` describes its own object.** `props` defaults to `Readonly<Record<string, unknown>>`, so `entry.props.phase` compiles inside `layout/` and `view/` and answers `unknown` under `noUncheckedIndexedAccess`. No cast, no index signature on `Entry`, and `entry.strat` still fails to compile. `Entry` stays non-generic in those layers, which is what ADR 0005 ruled and this keeps.
- **`Entry.props` is always present; `EntryInput.props` is optional.** Ingest fills `{}`, the same rule `segments` already follows, so no reader carries a "no props" branch. `metaRecord` — which answers `{}` for an array and copies the bag on every read — is deleted, and a stored read becomes one property lookup.
- **`TProps` says which keys may exist, never which keys must.** `props` is `Partial<TProps>` at every door: `Entry.props: Readonly<Partial<TProps>>`, `EntryInput.props?: Partial<TProps>`, `EntryDocument.props?: Partial<TProps>`. `Readonly<TProps>` beside an ingest fill of `{}` is a lie the compiler cannot see — `Dataset<{ owner: string }>` would read `entry.props.owner` as `string` on an Entry that holds nothing. A required key cannot survive a door that accepts `add({ id })`, so the type stops claiming one. A conditional slot type that keeps a required key required was drafted and dropped: it adds a public name and a second shape at two doors, and no consumer has asked.
- **The harness's double cast is not this ADR's to claim, and an earlier draft claimed it.** That draft said `Partial` at every door buys a widening that deletes `harness/main.ts:89`'s `as unknown as`. Re-probed against the real `Dataset` class at HEAD, inside the project's own `tsconfig`: `Dataset<PlannerMeta, PlannerFields>` **already** widens to the bare `Dataset` today, with two generics and no `Partial` anywhere. The widening was never the problem. The cast bridges two *different* concrete instantiations — `harness/hierarchy.ts:28` and `props.ts:30` declare the shared `window.__dataset` global as `Dataset<{ cost: number }, { cost: number }>`, and `main.ts` declares its own field shape — and that conversion fails at HEAD and fails after this ADR too. **The cast is a harness declaration choice, not a library gap.** Declaring the global as the bare `Dataset` deletes it today, with no ADR: every e2e read of it (`segments`, `start`, `end`, `id`) sits on `Entry`, outside either page's fields, which that file's own comment already says. The `Partial` rule keeps its **first** reason, which is sound on its own and was verified directly — `Readonly<TProps>` beside an ingest fill of `{}` is a required-key lie.
- **Ingest has no open half.** `props` holds everything the library does not name, so an unknown top-level key at ingest is a mistake rather than a value with nowhere else to go. `EntryInput` is a closed interface, so the compiler already refuses one in a written literal; whether the reader also throws on data arriving from a server is a small, separable choice.
- **An undeclared key round-trips. Whether it is *writable* is decision 1, and this bullet used to assert it.** Both answers keep the round-trip: an undeclared key stores at ingest, survives `toJSON`/`fromJSON`, and is never dropped. They differ at one door. Under the drafted answer `update(id, { props: { phase: 3 } })` succeeds, the typo guard inside `props` is dropped, and **one thing follows that is not optional** — the key must enter `proposedKeys`, or it writes with no ChangeSet row, no undo step and no subscriber. Under the alternative that door throws and the key stays read-only until one line declares it. `change-set.ts`'s `fieldsWrittenBy` already skips the namespace key itself when `proposedKeys` is stated, so the keys inside it are the only thing that can name the write either way. `UnknownFieldError` fires for an unknown key at the **top level** of an edit under both answers, where the schema owns the names.
- **`parentId` and `segments` keep their declarations.** Three mechanisms read them out of the registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list; `widenSegmentsToEnvelope` gates on `registry.get('segments')`; and `segmentsEqual` supplies the equality rule that puts an id-only Segment write into the changeset (#212, ADR 0010). Undeclaring them is not an available option.
- **This is `schema: 5`.** Four things change in the file: `meta` becomes `props`, `SerializedField.source` leaves, `start` and `end` become optional, and a rolling-up parent's rolling-up keys are omitted. A `schema: 4` reader cannot read what this writer produces, and the version gate means an older consumer build refuses a newer file rather than misreading it. **The numbering restarts at `1` on release, and that stands — decision 3, closed 2026-09-09.** The one hazard it left is that a pre-release `schema: 3` and a future released `schema: 3` are the same number in two shapes. One rule at the release gate retires it permanently: **a released reader refuses a file it did not write.** Nothing reads schema 3 today, so nothing has to be spent — not a public number, and not a `preRelease` flag for a problem that ends when the library goes public.
- **The Document reader's rules do not change, and that is the point of the namespace.** An unknown key inside `props` is passenger data and is kept, exactly as an undeclared `meta` key is today. An unknown top-level key stays unknown, so `plans/02-public-api.md:738`'s rule survives with one word renamed. ADR 0008's ruling stands unchanged: a legacy `progress` is consumer data inside `props`, with no core key for it to collide with.
- **`props` is carried by reference, except on a rolling-up parent.** D-S2-12 says the namespace is never walked field by field. The derived-value rule bends that in exactly one place — a rolling-up kind, whose rolling-up keys the writer omits — and nowhere else. Say so where D-S2-12 is written down, rather than leaving the two rules to disagree in silence.
- **#192's hazard survives one level down, and it is about declarations rather than storage.** Install the S7 scheduling plugin on a Dataset whose `props` carries a legacy `progress`, and the plugin registers `progress` over values it did not write, with nothing recording who wrote them. `read.ts` already rules that an undeclared-provenance row is unrepairable and throws `PluginSetupError`. Values have no equivalent, and this ADR does not give them one.
- **Where a plugin's own Field values live is open, and this ADR does not decide it.** Today they sit in the same bag as the consumer's, and this ADR keeps that only because it changes nothing there. **That is a description of HEAD, not a ruling** — **decision 9** below holds the question, and it gates group A, because it decides what `Dataset<TProps>` promises. Read every sentence below as *what happens if nothing changes*.
  - **Today: a plugin's Field values sit in `props`, beside the consumer's.** `field-registry.ts`'s `authored` excludes plugin-declared Fields from the Document on a stated premise: *"The plugin's values are not affected — those sit in `Entry.meta`, which round-trips whether the Field is declared or not."* One word changes and the guarantee does not. `PluginDocument` (D-S5-24) keeps its current job, the plugin's own non-Field rows.
  - **Today: plugins and consumers share the namespace.** ADR 0005 deferred a separate consumer store on the grounds that "a consumer declaring their own key in their own `meta` has nobody to collide with" — with plugins installed, they do. The registry already refuses a duplicate *declaration*; it does not refuse a *value* the consumer wrote before the plugin existed. What sharing must gain, if it survives B1, is an error message that names the plugin.
  - **The cost of leaving it here.** `Dataset<TProps>` types the consumer's keys and a plugin's key is not among them, so the generic is honest only while nothing is installed. A per-entry `pluginData` key was considered and rejected — it splits one namespace by an owner and adds a fourth Document key. The third answer, and the one the 9 September review recommends, is the store that already ships: `src/data/plugin-store.ts`. Its cost is that `fieldValue(id, key)` must route to the declaring plugin, which `FieldRegistry` already records.
- **What a plugin does lose is a *derived* value, because its declaration does not travel.** An S7 group's rolled-up `progress` is omitted by the rule above, and a Document read without the plugin cannot re-derive it — plugin declarations are deliberately not written (D-S5-33). The leaf values still round-trip. This is judged acceptable: without the plugin there is no `progress` semantics to preserve, and installing it re-derives every parent.
- **An Entry that starts rolling up drops its authored values, and the Rollup recalculates them.** Ruled 2026-09-09 by the author — decision **6**, closed. **The library never refuses this, at any of the three doors.** An author who typed `cost: 500` on a row and then gave that row a child asked for a parent, and a parent's `cost` comes from its children. Throwing at that call would refuse an ordinary edit over a value the author is plainly done with. Three doors reach it: autoGroup promotion, a `kind` write, and a `rollUpKinds` flip. All three drop and recalculate. Set a kind **out** of the set and the last derived answer stays, now authored (D-S4-6). This is the only reading where the store after a change equals a fresh Dataset built under the new setting.
- **The drop is an ordinary ChangeSet row, and undo restores it. History is never cleared.** `{ field: 'cost', from: 500, to: 40 }` sits in the same changeset as the cause. Undo reverses **the cause and the drop together**: the child leaves, the parent stops rolling up, and `500` is an authored value again. Nothing replays a value the new state refuses, because the new state goes back with it. An earlier draft claimed the opposite and wiped the history to escape it; that draft read the drop as a lone row rather than as one row of the transaction that caused it. **`rollUpKinds` is not a destructive setter, and no `RollUpKindsWouldDropValuesError` is added.**
- **The `rollUpKinds` flip is a transaction, and one question about it is open.** It emits one ChangeSet, enters undo as one step, and `beforeChange` may veto it. The other two doors already carry their cause in the same transaction. The flip's cause is a **config assignment**, and a `ChangeSet` has no row shape for one — `added`, `removed` and `updated` all name a store entity. So undoing the flip's step restores the values while `rollUpKinds` still rolls them up, and the next commit that touches the subtree drops them again. **Either the undo step reverses the config key with the values, or the flip's drops stay out of history and the key's documentation says so.** Recorded under decision 6's ruling in `closed-decisions.md`; it is a follow-up on one door, not a re-opening. `DatasetState.setRollUpKinds:289-293` swaps two references today, so the transaction is work this ruling gives itself.
- **An Aggregator's `undefined` changes meaning on a rolling-up parent.** It is documented as *no opinion — keep the stored value*. Once nothing but the Rollup can write that cell, there is no authored value to keep, and "keep" means "keep the previous derived answer", which is stale by construction. On a rolling-up parent, `undefined` means **no value**. Elsewhere the current reading stands.
- **`toJSON` output is no longer byte-identical to the input for a rolling-up parent.** `toJSON → fromJSON → toJSON` is still stable, because the structural test is a pure function of kind, hierarchy and declarations.
- **Two names, two levels, and neither is a synonym for the other.** `dataset.toJSON()` and `Dataset.fromJSON()` are the public doors (`src/api/dataset.ts:312,326`); `toDocument` and `fromDocument` are the `data/serialization` functions behind them. This ADR names the public door except where it names a file to change. The plan names the function.
- **The key-order contract holds and covers the core keys.** `toJSON` writes them in their fixed order and `props` last; inside `props`, order follows the consumer's own object. `serialization/index.ts`'s rule that `Object.keys` never walks a store entity stands, with the single exception a rolling-up parent's `props` needs.
- **A Document is our save format. It is not an interchange format, and that is now a decision rather than an observation.** A third-party reader sees a group with no span and no rolled-up values, and would need the same Aggregator *implementations*, referenced by name only. Today the file carries the numbers; after, it carries the recipe. Nothing in `plans/02` claimed interchange, and nothing will.
- **`reportCorrectedRollUps` is deleted, not generalized.** With no reproducible derived value in the Document there is nothing to correct.
- **The deleted surface.** `FieldSource` and all three arms, `SerializedField.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`, `source-strategy.ts`'s strategy table, `normalize-source.ts`, `metaRecord`/`metaKey`/`metaSlot`, and `Field.source` itself. `TMeta` becomes `TProps` and loses its second generic across 101 references. One successor is needed and easy to miss: `encodeFieldDocument` keeps a `compute` Field out of the Document *through* the strategy table — `writeStoredSource` calls `computeStrategy.serialize()`, which answers `undefined`, and `encodeDeclaredField` drops the row. Delete the table and the test goes with it. `'compute' in field` replaces it.
- **Also superseded, beyond ADR 0005.** `plans/01-domain-architecture.md:273-281` (the `FieldSource` type and its default), `plans/01:330` and `plans/02-public-api.md:454` (*"Source decides stored or computed"*, in both docs), and `plans/02` §7's two `FieldSource` errors.
- **A known hole: a dateless row cannot be dated through the UI.** It draws no bar, so no gesture reaches it, and the default `gridColumns` is `['name']`, so no cell editor reaches `start` either. The motivating story — *an author adds a row now and dates it later* — needs a code call or a `gridColumns` change. Dating from the timeline is its own gesture, with its own capability and veto surface, and it does not belong in a storage redesign. Recorded as a hole, the way #235 is.
- **A consumer Field never names a core key.** `#mergeCoreFieldOverride`, `#consumerOverriddenCoreKeys`, `CORE_FIELD_OVERRIDABLE_KEYS` and `illegalCoreOverrideKey` are deleted. Core Fields seed `#byKey` first, so a consumer declaration on a core key falls through to the `DuplicateFieldKeyError` already sitting there — no new error, and one branch less. The key space then keeps one meaning per name: a core key is the library's, every other key is the consumer's, and no release moves a key from one side to the other in silence. **This is the reason.** With the override in place, promoting a consumer key to a core key in a later release relocates that Field's storage from `props.colour` to `entry.colour` and leaves the stored values unreachable, with nothing raised. The window is narrow — `illegalCoreOverrideKey` already throws for a declaration carrying anything past `editable` — and a silent window is the wrong size at any width.
- **What that deletes is one capability: `{ key: 'start', editable: false }`, and `interactions.edit` no longer replaces it.** `editable` is the only key `CORE_FIELD_OVERRIDABLE_KEYS` ever allowed. An earlier draft named `interactions: { edit: (entry, field) => (field === 'start' ? false : undefined) }` as the replacement, and asked as an aside whether `editable: false` also refuses `entries.update()`. **It does not** — verified, `editable` is read at `view/capability.ts:120` and nowhere else in `src/`. The 2026-09-09 ruling makes `editable` a data-level gate, so the two doors stop differing. That ruling also breaks this replacement: `interactions.edit` is a Gantt-level, view-level policy, and `data/` may not import it (`plans/01` §1). It gates gestures and cells; it cannot gate `entries.update()`. So deleting the core override now removes a **data-level** capability with nothing standing in for it. That is **decision 19**, and it is open. The deletion's own reason is unchanged and still good — a consumer key promoted to a core key in a later release relocates storage in silence.
- **D-S2-22's *precedence clause* is retired. D-S2-22 is not.** The decision itself rules that the span Rollup is a **core step** in the commit path, not an extender — retiring it would take the Rollup out of core, which this ADR does not intend and must not be read as intending. What retires is one paragraph inside it: the yield-to-the-body rule. `rollup.ts:196` skips a rolling-up Field the transaction body proposes, so a user-proposed parent value wins the pass; that loop runs only over rolling-up parents × rolling-up Fields, which is the exact cell `entries.update()` now refuses, so nothing reaches the guard. `editProposesField`, `RollUpEditSets.body` and the `body`/`merged` split that exists only to feed it are deleted with the clause. **Decision 5 turned on the same code, and it is now answered:** the guard reads `body`, and a cascade's edits are not in `body`. Unify the predicate first — one function answers *did anyone propose this Field?* and both callers use it — then delete the split with the clause.
- **D-S2-22 also restates the `referenceDate` fill**, and *that* half is retired by the optional dates, not by anything above. Name both halves separately or a reader retires the wrong sentence.
- **`props` is copied at ingest, and immutable afterwards.** `metaRecord` copies the bag on every read today, so deleting it would leave the store holding the consumer's own object — and a consumer mutating their input array would then mutate the store outside a transaction, outside the ChangeSet and outside undo. Ingest takes a shallow copy, `Entry.props` is `Readonly<Partial<TProps>>`, and every write builds a fresh record. A read becomes one property lookup, which is what the deletion was for.
- **An unknown top-level key at ingest raises a warning, and the key is ignored.** `EntryInput` is closed, so the compiler already refuses one in a written literal. Data arriving from a server is the real case, and `props` is the only home a consumer key has: throwing turns one uninteresting column into a crash, and silence hides a typo'd `strat`. A warning through `raiseError` is the posture the dropped derived value already takes — one rule, not two. The check is one `Object.keys(input)` walk per Entry against a known set derived from `CORE_FIELDS` plus `'props'` — no second list to keep in step.
- **A `props` key that names a core key is a mistake, and it gets the same warning.** `entry.props.start` stores without complaint and is then unreachable: `fieldValue(id, 'start')` answers the Entry's own `start`, because a core key is a core key. The consumer's value is invisible with nothing raised. The same ingest walk catches it, so the rule is one sentence and one loop: **a key inside `props` never names a core key, and a key at the top level is never a consumer's.** **Ruled 2026-09-09 by the author: it is a warning, and the core definition wins.** The value is ignored and the core Field answers. It never throws. The reason is the data's provenance: a consumer feeds this Dataset from an API they do not own, and a column added upstream must not break their page. Decision **12** recommended an error here on the grounds that it stores a value no door can read back — the value is not stored now, so that ground is met without a throw. Nothing in this bullet is contested any more.
- **The error is `ComputedFieldCannotBeWrittenError`.** It fires for `compute` beside `rollUp` and for `compute` beside `editable`, and neither is about storage — both are about writing. *Store* is the word this ADR gives the Field union's other arm. `compute` beside `column` stays legal: a computed column is an ordinary read-only column.
- **D-S4-35 is retired.** *"Omitted `source` is `meta` under the Field key"* (`plans/s4-hierarchy-and-rows/README.md:209`, and Q17 at `:36`). The key is the whole address now, so there is no `source` to omit.
- **D-S2-7's `meta` carve-out goes with the `meta` Field.** `plans/s2-data-core/s2.6-serialization.md:76` states the consumer rule in the old word, and `plans/s4-hierarchy-and-rows/README.md`'s rule table carries *"Whole-`meta` write after a declared Field exists"*. Both describe a write shape that stops existing.
- **D-S4-2 is retired, and its title is *"one adapter reads and writes a `FieldSource`"*.** The `& Partial<TFields>` arm on `EntryEdit` is a paragraph inside that decision, not the decision's name. Deleting `FieldSource` retires the adapter, and the flat-edit arm goes with it — that is the *Flat consumer keys on the edit alone* option above, rejected there and retired here. Retire the adapter; do not pin the wrong title on it.
- **`StoredEdit` is renamed `ProposedEdit`.** This ADR gives the word *stored* to the Field union — *a **stored** Field may roll up and may be edited* — beside the sense `storedValue` and `storedSourceOf` already carry. The edit type then holds the word twice over for two meanings, and it is the weaker claim: a `StoredEdit` is never stored. It is a write nobody has applied, at `EditRequest.proposed`, in `entries.pendingEdits()`, in a Draft, and at `diffEdit`, which compares it *against* the store. `ProposedEdit`/`ProposedEdits`, `toProposedEdit`/`toProposedEdits` and `EditReading.proposed` follow, about 184 occurrences. The conversion name gets weaker — *convert the edit to a proposed edit* names no change — and the published call site wins, because a plugin author reads `request.proposed` and only core calls the conversion.
- **The library has never shipped, so this lands as one change.** Staging the storage rename behind the current interface and breaking the surface afterwards is discipline for a library with users.

## Issues this ADR depends on

Remove a row here once it is closed, and remove this section when it is empty.

| Issue | What this ADR needs from it |
|---|---|
| [#213](../../issues/213) | A `compute` write is dropped in silence. The registry refusal for `compute` + `rollUp` must land **before** #213's own fix, or the Rollup starts throwing instead of writing a phantom row. |
| [#270](../../issues/270) | A declining Aggregator leaves a stale rolled-up value. Independent of this ADR, but the Document's re-read and the live store disagree until it is fixed. |
| [#267](../../issues/267) | A renderer casts `entry.meta`. Typing `props` as a record removes the three casts in `harness/planner.ts` — every one wants a plain stored value and already narrows from `unknown`. It does **not** answer the issue: a `compute` Field owns no `props` key, so it stays unreachable at paint, and no declared `type` is applied. A Field-aware renderer read is still owed. |
| [#266](../../issues/266) | `meta` names a storage location, a Field key, a `FieldSource.from` value and a Document key. Three of the four go, and the survivor is renamed. The `Document`/DOM collision half of that issue stays open. |
| [#264](../../issues/264) | Core ships one Field type and its own Fields bypass the layer. The Field union here settles the shape a type bundle attaches to. |
| [#214](../../issues/214) | `FieldContext` cannot reach a second Entry, so a `compute` Field cannot depend on the tree. The `compute` arm published here inherits that limit. |

## Blocking decisions

**One list, and it is the only list of what is open.** It merges what this ADR held open, the plan's **Blocking B1–B3**, the working review's **D1–D7**, and the questions raised against [`api.md`](../../plans/adr-0011-field-redesign/api.md) on 2026-09-09. Each entry states the question, the evidence behind it, a recommendation, and what it blocks. **A recommendation is not a ruling.**

**Numbers never move.** A closed decision keeps its number and leaves this list. Its ruling and its evidence go to [`closed-decisions.md`](../../plans/adr-0011-field-redesign/closed-decisions.md), which is the only other place a decision is written down. Do not renumber the survivors to close the gaps — the plan, the conflict log and two reviews cite these numbers.

**Ten are open: 1, 8, 9, 11, 12, 13, 16, 18, 19, 20.** **18**, **19** and **20** are new; the `editable` ruling raised 18 and 19, and 18's cost table raised 20. Ten are closed: 2, 3, 4, 5, 6, 7, 10, 14, 15, 17. **5** and **6** closed 2026-09-09 by the author.

| Here | Was also called |
|---|---|
| 1 | plan Open 1 — settled 2026-09-08, re-opened 2026-09-09 |
| 8 | new on 2026-09-09 |
| 9 | plan Blocking B1, review D1 |
| 11 | review D5 |
| 12, 13, 16 | new on 2026-09-09 |
| 18, 19 | new on 2026-09-09, from the `editable` ruling |
| 20 | new on 2026-09-09, from 18's cost table. Larger than this ADR; **8** is a narrower form of it |

**Decision 12 gates group A, not the schema bump.** A writes the Document key. A marker decided after A is a second rename of the same files. Schema 5 bumps at the end of D. The namespace's own name was the other Document word, and decision **17** closed it as `props`.

**9 and 12 are one decision.** Answer them together or the answers cancel: 9's case for sharing `props` rests on `entry.props.progress` reading as a typed dot access, and 12's plugin prefix takes the dot away. See 9.

---

### 1. May an undeclared key travel in a `props` patch?

Settled *yes* on 2026-09-08. **Re-opened 2026-09-09** by a survey of what ships elsewhere. **Blocks group B.**

**What the market does.** Three patterns exist and all three are coherent.

| Pattern | Who | Behaviour |
|---|---|---|
| Atomic bag | tldraw `meta`, Excalidraw `customData`, **this library at HEAD** | Undeclared, untyped, **replaced whole**. One identity, one change event, one undo step. |
| Declared fields | Bryntum, AG Grid | Per-key merge, per-key change tracking, **declaration required** |
| Namespaced bag, per-key setter | FullCalendar `extendedProps` | Undeclared keys kept and never modified. `setExtendedProp` writes **one** key. **No changeset, no diff, no undo.** |

**The claim is narrower than "nobody does per-key writes on an undeclared key," and it should be stated exactly.** FullCalendar does — `setExtendedProp` sets a single undeclared key and re-renders. It never pays what we would pay, because it has no ChangeSet, no diff and no undo history, so an undeclared key needs no equality rule, no row and no order. **What nobody ships is per-key merge over an undeclared space *inside a transactional store*,** and the reason is structural: per-key merge there needs per-key identity, equality and ordering, and the declaration is where all three come from. Bryntum, which does have a change-tracking store, shows the other end: an undeclared field gets no accessor, so it gets no tracking and no re-render, and their support forum carries the consequences.

**What it would cost us.** An undeclared key has no `equals`, so a `props` value holding an object emits a ChangeSet row on **every** write, changed or not — undo noise and subscriber noise that grows with the consumer's app. It has no deterministic row order, because group B(b) walks the registry for order and drains the rest afterwards. And a live guard pays for it: group B(c) stops `fieldValue` throwing `UnknownFieldError` so that a row naming an undeclared key can be read back.

**Recommendation — reuse this ADR's own rule, *records carry and patches name*.** The derived-value section already draws that line: `update()` refuses, `add()` drops. Draw it here too. `add()`, `new Dataset({ entries })` and `fromJSON()` **carry** an undeclared key, store it and round-trip it, which keeps an import from a foreign tool working and matches tldraw and Excalidraw. `update()` **names** a key, so naming an undeclared one keeps throwing `UnknownFieldError`. An undeclared value then never changes, so undo never needs it, no `equals` is needed, row order stays deterministic, and `fieldValue` keeps its guard. Group B's three edits are not needed at all.

**The objection, and the answer.** *A namespace a consumer may fill and never change is incoherent.* They can change it — by declaring it, which is one line, `{ key: 'phase' }`. Declaring is where a consumer says *I intend to change this*, and it gives *why declare a Field?* a one-sentence answer it does not have today. **The cost:** `harness/planner.ts`'s `phase` gains that line.

**Two further costs, both real, neither fatal.**

*A plugin that writes a Field it has not registered fails.* Registration closes when `setup()` returns (`RegistrationClosedError`), so a plugin that computes a key name later, or writes on behalf of another plugin that is not installed, has no way to declare it and its cascade throws. Today that write succeeds. Whether that is a defect or the rule working is part of this decision.

*The type says yes where the runtime says no.* `TProps` membership and Field declaration are two different things, and the type cannot see the registry:

```ts
interface PlannerProps { owner?: string; phase?: number }   // phase is in TProps…
fields: [{ key: 'owner' }]                                  // …and declared as no Field

update('t1', { props: { phase: 3 } })   // ✅ type-checks — PropsEdit maps keyof TProps
                                        // ❌ throws UnknownFieldError — nothing declares it
```

Closing that gap needs declared-key inference from a `fields` literal, which is #267's machinery and out of scope here. It is the same posture `fieldValue` already takes at HEAD — a registry check the type cannot see — so it is consistent rather than new. If this recommendation lands, the error message carries the fix: *"'phase' is not a declared Field, so update() cannot name it. Declare it: `{ key: 'phase' }` — or write it at ingest, where undeclared keys are kept."*

---

### 8. What does demotion return an Entry to?

**Settled on 2026-09-09: the conversion runs both ways, and stays automatic.** The dates on demotion are settled too (same day, by the author): the Entry becomes a **normal Entry with no dates**. There are no children to calculate from, so `start`/`end` are absent. It can be dated later. What is still open is the **target kind**.

**Decision 20 subsumes this.** Its third answer below — *stop storing parent-ness* — is the narrow form of 20's question, *should `kind` be authored at all?* If 20 lands on *calculated*, this decision dissolves rather than being answered. Do not settle 8 before 20 unless 20 is deferred on purpose.

Promotion writes one kind, `'span'` → `'group'`. Demotion has no single answer. Returning every childless rolling-up Entry to `'span'` overwrites the kind of a group a consumer **authored** childless. Remembering that *we* promoted needs a stored marker, which is a fourth thing the Document carries.

**The third answer deletes the question: stop storing parent-ness.** Microsoft Project derives summary status from outline structure and stores none, which is why it owes no demotion rule — *"any task with subtasks has no timing or cost information of its own."* Bryntum derives `isLeaf` from `children`. That route takes `'group'` out of `EntryKind`, leaves `kind` naming only what a row *is*, and re-points `rollUpKinds` — so it is larger than this ADR, and it reaches `plans/01` §2.5, whose *"`Entry.kind` is authored, never derived from having children"* the default-on `autoGroup` already contradicts at HEAD. The promote-only / flickering-identity sentence in that same paragraph is overruled by the both-ways conversion; group F rewrites it.

**Answer before group C:** without a target kind, demotion cannot run, and a stale `'group'` under the omission rule is a rolling-up row with no dates rather than a normal Entry that can be dated later.

---

### 9. Where does a plugin's own Field value live?

**Blocks group A**, because it decides what `Dataset<TProps>` promises.

**A probe removed the argument that carried this.** The honest-generic case for a separate plugin store rested on `entry.props` being a lie the moment a plugin installs. It need not be. Probed with `tsc`, with the app author's call site unchanged and nothing hand-written by them:

```ts
// the plugin package ships this line in its own .d.ts
declare module 'freegantt' { interface PluginEntryProps { progress?: number } }

// the app author, exactly as today
const dataset = new Dataset<TaskProps>({ entries, plugins: [scheduling()] });
dataset.entries.get('t1')?.props.progress    // number | undefined — typed, nothing hand-written
```

`Entry.props` becomes `Readonly<Partial<TProps & PluginEntryProps>>`. tldraw ships this pattern for custom shape props. **One route was probed and fails, so nobody re-derives it:** a plugin type parameter on the constructor infers only when the author writes no explicit type argument, because TypeScript stops inferring later type parameters once an earlier one is written (`api/dataset.ts`, #123). `new Dataset<TaskProps>({ plugins: [scheduling()] })` makes it fall back to its default, `plugins` stops type-checking, and the plugin's keys disappear. **Augmentation is the only route that keeps today's call site.** Its cost: it is global to the TypeScript program, so an app that installs a plugin on one Dataset sees the key typed on every Dataset. Every augmented key is optional, so it over-approximates what may exist and never claims a value is present.

**The three options, as calls.** **A — share `props`.** One home, so a grid edit needs no routing and a cascade writes the same `EntryEdit` as any other write. With augmentation the generic is honest. **B — an `Entry.pluginData` sibling.** Honest, but a third Entry key and a fourth Document key, and it does **not** stop two plugins colliding unless it is keyed by plugin id — at which point it is C with extra steps. **C — the plugin's own store.** `plugin-store.ts` already ships `PluginStores`, `reserve<T>()` and `read<T>()`, and `PluginDocument` already serializes it. Its cost is not only `fieldValue` routing: *every* door that names a Field key must route — `entries.update`, the cell editor, the cascade, undo — and `toJSON` must learn that a leaf plugin value already lives in `PluginDocument`. Worse, `update('t1', { props: { progress: 60 } })` would type-check and write the consumer's bag while the grid reads the plugin's store, with nothing saying which write landed. **If C is picked, `PluginFieldNotInDataError` is part of the pick, not a follow-up.**

**One field report on option A with nothing separating the writers, and it is recent.** FullCalendar's Vaadin binding shipped `extendedProps` as the consumer's bag, and then the library underneath started writing into it. Version 3.0.1 renamed the consumer's half to `customProperties`, *"because due to a change of the internal client side library, extendedProps became used by the client itself, so to prevent conflicts of properties, custom properties are now stored separately."* **A shared bag with two writers and no marker gets split eventually**, and the split is a breaking rename for everyone using it. Excalidraw sits in the same position now — its docs publish `customData` as the integrator's, and Excalidraw itself writes there.

**Recommendation: A, with augmentation, and a required plugin prefix on the Field key (see 12).** The prefix is what stops A becoming the case above: one home for storage, two owners that cannot name the same key. Keep `PluginStores` for what it is good at — plugin state that is not a per-Entry Field, such as dependencies, baselines and caches. Bryntum keeps dependencies in a separate store for exactly that reason.

**Two findings against that recommendation, from the 2026-09-09 consistency review. Neither is fatal; both have to be answered inside the pick.**

**First: the recommendation and decision 12's cancel each other, and neither noticed.** A's whole proof is the probed call site above — `entry.props.progress`, typed, with nothing hand-written. Decision 12 recommends a **required prefix** on a plugin's Field key. A prefixed key is not an identifier, so the read becomes `entry.props['scheduling:progress']` and the dot goes away. Every by-key call changes with it, `gridColumns` included, which `api.md` sees for `gridColumns` alone. **So the prefix removes the reason to reject C and removes the reason to pick A in the same stroke.** Answer 9 and 12 as one decision. If both recommendations stand as written, say plainly that A is picked for its single storage home and not for the typed dot, because the typed dot does not survive.

**Second: A was probed for reads and never for writes.** `PropsEdit<TProps>` maps `keyof TProps`, and a plugin's key is not in `TProps` — it is in the augmented `PluginEntryProps`. So `update(id, { props: { progress: 60 } })` does not type-check, and the grid cell editor writes plugin Fields on every editable declaration. A needs `PropsEdit<TProps & PluginEntryProps>` at the write door, which puts back the intersection that *one generic* was meant to remove. **Probe the write before picking A.** The read probe does not carry it.

---

### 11. Does *common case is a shorthand* survive for Field writes?

`plans/02:459` ships `update('t1', { start, cost })`. This ADR ships `update('t1', { start, props: { cost } })`. One sentence names two Fields; the other names one Field and a container. **This edits a locked spec** either way, so it needs an explicit ruling.

**What the market does: nobody nests at the write door.** Bryntum writes `record.set({ startDate, cost })`. DHTMLX Gantt mutates the task and calls `updateTask(id)`. AG Grid spreads flat, `{ ...rowNode.data, price }`. Every one of them keeps consumer values beside core ones in a single flat write.

**FullCalendar shipped the flat shorthand, and it is the one product that has run this experiment to its end.** It is the closest analogue on the page — a scheduling UI with a fixed set of reserved event keys and a consumer's own values beside them — and it went wrong twice.

**First failure: the flat space had no namespace at all.** Before v4 a consumer's custom field sat bare on the event, and FullCalendar later added an option with the same name. `extendedProps` was introduced in `4.0.0-alpha.2` to fix it. **That is this ADR's stated hazard, realised in a shipped product** — a consumer key that a later release promotes to a library key — and the fix was the namespace this ADR is proposing to keep.

**Second failure, and it is still open.** The namespace fixed reading; the *write* door stayed open, because a non-standard key at the top level is still accepted and relocated into `extendedProps` during parsing. [Issue #7636](https://github.com/fullcalendar/fullcalendar/issues/7636), filed March 2024, labelled *Discussing*, no maintainer reply: *"the type-checking can not detect typos for existing props"* and *"properties in extendedProps can be overridden by those props (or maybe the vice versa) which causes unexpected result."* The reproduction is `tilte:` for `title:` — accepted in silence as a custom property, and the event renders with no title. The issue asks FullCalendar to **disallow** custom keys at the top level and require the explicit hash. (Its own snippet misspells `extendedProps` as `extendedProp`, which demonstrates the defect it reports.)

**Read the lesson precisely, because it is narrower than "flat is bad."** What broke FullCalendar is an **open** top level, not flatness. A key it does not recognise is taken as a consumer value rather than refused, so no spelling of a reserved key can ever be checked. **This ADR already closes that door:** `update('t1', { strat: … })` throws `UnknownFieldError`, and that rule is what FullCalendar is being asked for eight years later.

**What the nesting buys is exactly that closed top level. It does not collide with 1's current recommendation.** 1 now recommends that `update()` throws for an undeclared key, so the typo guard *inside* `props` **stays**. Nesting and the declared-key shorthand are then both still live: 1 no longer decides this one. The collision returns only if 1 lands the other way — undeclared keys writable, inner guard dropped, outer guard kept — because this ADR cannot say *TProps is enough inside* and *we nest to get a closed top level for the same typo reason*. **Settle 1 first only for that branch.** The product call here is independent: keep `plans/02`'s shorthand, or keep a closed top level.

**The third option, now with evidence behind it: a flat shorthand for *declared* keys only, with `props: {}` as the long form.** `update('t1', { start, cost })` is legal exactly when `cost` is declared; anything the registry does not know still throws at the top level. That keeps `plans/02`'s *common case is a shorthand* principle, and it is **not** FullCalendar's mistake, because the top level stays closed — an unknown key is refused rather than relocated. Its price is two spellings for one store, which the plan warns against, and it makes a write's legality depend on registration. **This is the option to weigh against the nesting, not the open flat form FullCalendar shipped.**

**Read #7636 once more before picking it, because the lesson reaches further than the ADR took it.** What FullCalendar shipped is a write whose *meaning* depends on what the library knows about the key: a recognised key sets a reserved property, an unrecognised one becomes a custom property, and the author cannot tell which happened. The declared-key flat spelling keeps that shape and moves it one stage later. `update(id, { cost })` compiles always, and **throws or writes depending on live registry state at the moment of the call** — and `fields` is live-reconfigurable like every config key. So the same line is legal in one Dataset and an error in the next, with the type saying nothing either way. The nesting has no such state: `props: { cost }` writes a consumer value under every configuration. Weigh that against the shorthand, and say which cost is the smaller one.

---

### 12. Do consumer and plugin Field keys need a namespace marker?

**Raised 2026-09-09 by the author, and the first pass argued against it on bad evidence.**

The question: should `{ key: 'owner' }` be `{ key: 'props.owner' }`, so the declaration says exactly where the value lives and a collision cannot happen?

**The evidence the first pass cited was withdrawn.** AG Grid's `field: 'medals.gold'` and TanStack Table's `accessorKey: 'name.last'` are **not** this. There the consumer nested their own object and the path navigates their own shape; the library imposes nothing and owns no key on the row. That is a different question and citing it was wrong.

**The real precedent is platforms that own part of a key space, and it is strong.**

| Platform | Core keys | Consumer keys | Third-party keys |
|---|---|---|---|
| HTML / DOM | bare (`id`, `class`, `href`) | **prefixed** `data-*` | — |
| Kubernetes | reserved `kubernetes.io/` | **bare** — "if the prefix is omitted, the label key is presumed to be private to the user" | **prefix required**, reverse-DNS |
| OpenAPI | bare | — | **prefixed** `x-`, and then `x-{namespace}-` |
| FullCalendar | bare, about 21 reserved event keys | **namespaced on read** (`event.extendedProps.x`), accepted either way on write | — |

**FullCalendar is the closest analogue, and its namespace exists because the bare space failed.** A consumer's custom field sat bare on the event until v4; FullCalendar then added an option with the same name, and `extendedProps` landed in `4.0.0-alpha.2` to stop it happening again. Reading is namespaced without exception. Writing was left open, and decision 11 carries what that cost. **A fourth product reached the same answer as HTML, from the same injury.**

Three lessons, and they point in different directions for our three writers.

**For the consumer, the guarantee a prefix buys is forward compatibility.** HTML's `data-*` exists so that "authors can define any attribute they want as long as they prefix it with `data-` to avoid clashes with future versions of HTML." That is precisely the hazard this ADR names when it deletes the core-key override: promoting a consumer key to a core key in a later release relocates storage with nothing raised. **HTML solved it with a prefix; SQL and CSS solved it with a reserved word list.** Both work.

**For a third party, one shared prefix is not enough.** OpenAPI shipped a single `x-` space, vendors collided inside it — `x-internal` is in de facto use by several — and the OpenAPI Initiative had to add a **namespace registry** so extensions read `x-{namespace}-`. Kubernetes reached the same answer by rule: automation and third-party components **must** carry a reverse-DNS prefix, while a user's own keys may stay bare. That is this library's plugin-versus-plugin collision, already solved twice in the field.

**The first pass's decisive objection dissolves under the right framing, and that should be said.** It argued a prefix welds the public name to the storage mechanism, so a Field moving between `compute` and stored would be renamed in every saved Document. That holds only if the prefix names **storage**. If it names **ownership** — whose key is this — then a consumer's `compute` Field and a consumer's stored Field carry the same prefix and nothing renames. `data-foo` does not tell you where the browser keeps it. What survives is smaller: a path needs escaping, and a consumer key holding the separator is ambiguous. AG Grid hit that, and its derived column ids collapse the separator and break lookups that use the original string.

**Recommendation, and it is the Kubernetes shape:**

- **core keys stay bare and become a published, closed reserved list** — the SQL and CSS answer. Adding one in a later release is then a declared breaking change rather than a silent relocation.
- **consumer keys stay bare**, because both standards that split three ways leave the first-party author unprefixed. The app-author call site keeps `gridColumns: ['name', 'cost']`.
- **plugin keys carry a required prefix naming the plugin.** This is the half with the strongest evidence, it closes 7 at no cost (7 closed 2026-09-09 as downstream of this), and it removes the main reason to consider a separate plugin store in 9.
- ~~**`props: { start: … }` becomes an error**~~ — **overruled 2026-09-09 by the author.** It stays a **warning**, the value is ignored, and the core definition wins. A consumer feeds this Dataset from an API they do not own, so an upstream column named `start` must not break their page. The leak this bullet worried about closes anyway, because the value is not stored.

**Still open, and this is the ruling wanted:** may a consumer ever hold a key that shadows a core key? If **no**, the reserved list gives the same guarantee as a consumer prefix at no call-site cost. If **yes**, a bare consumer space cannot deliver it, and `props.`-prefixed consumer keys return to the table on HTML's exact reasoning.

---

### 13. `read` and `fieldValue` are one job under two names

`FieldContext.read(entry, key)` and `entries.fieldValue(id, key)` answer the same question on two surfaces. `plans/02` requires one name per concept, and names specific enough to disambiguate at a glance; two names for one job is the failure #7 records.

Every comparable library uses a verb here — `getValue`, `getCellValue`, `getDataValue`, `record.get`. `fieldValue` is a noun, so the call reads as a property access spelled as a call.

**There are four doors, not two, and an earlier draft counted two.** `entry.props.k` is the stored bag. `entries.fieldValue(id, k)` resolves any Field key. `ctx.read(entry, k)` answers the same question on the plugin surface. `ctx.durationOf(entry)` answers it for one Field, by name. Four ways to ask *what is this value* is the shape #7 records, not two. Widen this decision to all four before renaming anything: `durationOf` is the one that looks unlike the others and is not.

**Two corrections to the line above, both checked against the code.** First, `durationOf` does **not** exist because `duration` owns no `Entry` key. `model/field.ts:19` declares `duration: Duration` on `CoreFieldValues` by hand, so `ctx.read(entry, 'duration')` and `fieldValue(id, 'duration')` are both fully typed. Typing is not the reason. What `durationOf` actually is, is the **implementation** of the `duration` core Field — `core-fields.ts:118`'s compute arm calls it — published as a convenience beside the door it implements. One of the four doors is built out of another. Second, it answers in **two different units** depending on which builder made the context, which is [#274](../../issues/274). Settle 13 against that issue, not against the assumption that `durationOf` earns its place.

**Recommendation: align the names across all four, and settle 9 first.** Whether the by-key doors merge or only share a name depends on whether a plugin's values need routing. Renaming a published door is not a decision to take in passing.

---

### 16. Two plugins write one field: what happens?

`edit-extension.ts:35` merges last-wins per Field key and reports nothing. Two installed plugins that both write `start` on one entry produce one value and no signal. The library raises a warning through `raiseError` for smaller things — a dropped derived value, an unknown ingest key.

**Related, and confirmed as a defect rather than a preference:** the extension hook makes a plugin author do three things no comparable runtime asks for. It returns `new Map()` to say *nothing*, where ProseMirror's `appendTransaction` and CodeMirror's `transactionExtender` both return `null`. It brands ids by hand with `entryId('t1')`, against `plans/02`'s promise of loose input on every way in. And it makes the author write the composition and the merge — `ctx.edits.wrap((next) => (request) => mergeEntryEdits(next(request), extender(request)))` — where CodeMirror combines returned specs itself and ProseMirror appends the returned transaction itself. #197 exists because hand-rolled composition already lost edits once.

**Recommendation: the runtime owns composition, merging and branding; the author returns a value or nothing.** A returned value keeps the purity story a mutable collector would blur, and CodeMirror shows a returned spec is enough. Loose input then argues for an object literal over a `Map`:

```ts
extendEdits(request) {
  const moved = request.proposed.get('t1');          // plain string, no branding
  if (!moved) return;                                // nothing means nothing
  return { 'phase-1': { start: moved.start, props: { risk: 'high' } } };
}
```

**The shape is a published plugin-author signature, so it needs a ruling.** Whether a contested write reports, and at what severity, is the other half.

**One correction to the sample above: an object keyed by Entry id is the wrong container, and the `Map` should stay.** JavaScript walks integer-like string keys first and in ascending numeric order, so `{ '10': …, '2': … }` iterates as `2` then `10`. Entry ids are consumer strings and numeric ids are ordinary, so a `Record` silently reorders the cascade — and the merge is last-wins per Field key, which makes order load-bearing. `__proto__` as an Entry id is the second hazard on the same container. **Keep the `Map`, or take an array of `[id, edit]` pairs.** The three ergonomic complaints stand under either container: returning nothing should mean nothing, ids should stay loose, and the runtime should own the composition.

---

### 18. Does an *absent* `editable` also refuse `entries.update()`?

**Raised 2026-09-09 by the `editable` ruling. Blocks group A**, which is where the gate moves into `data/`.

`Field.editable` is `boolean | undefined`, and `view/capability.ts:120` reads it as `field.editable === true ? WRITABLE : NOT_WRITABLE` — so absent and `false` are one answer there. The ruling says `editable: false` refuses `entries.update()`. It does not say what absent does, and the two available answers are far apart.

**Copy the view rule.** `entries.update()` refuses unless a Field declares `editable: true`. One rule, one resolver, one answer at every door — which is the whole point of the ruling. The price is the default posture of a public door: `update(id, { props: { owner: 'Sam' } })` starts throwing for every Field that did not opt in, `harness/planner.ts`'s `owner` among them. A data library whose write door is closed by default is a surprising shape, and `editable` was named for the *grid*, not for the API.

**The price is larger than consumer Fields, and it was measured.** Only three core Fields declare `editable: true` — `name`, `start`, `end`. Every other core Field declares nothing, so copying the view rule closes three **structural** doors that have nothing to do with a grid:

| Call | Field | Today |
|---|---|---|
| `update(id, { parentId })` — reparenting | `parentId` | no `editable`. Live at `harness/main.ts:181` and `hierarchy.ts:254` |
| `update(id, { segments: [...] })` — Segment writes | `segments` | no `editable`. #212, ADR 0010 |
| `update(id, { kind: 'milestone' })` | `kind` | no `editable` |

Keeping the view rule therefore means declaring `editable: true` on `parentId` — a Field with **no column at all** — which is answering a grid question about something no grid shows. That is the tell that `editable` is being asked to do two jobs. It does not decide this on its own, but it is the cost, stated exactly.

**Split absent from `false`.** Absent means "no opinion, the API may write"; `false` means "refused everywhere". Today's writes keep working and the ruling still lands. The price is that `boolean | undefined` then carries three meanings at one door and two at another — which is the split the ruling just closed, moved from between the doors to inside the type.

**A third shape exists and neither of the two above reaches it:** `editable` names the *grid's* answer and a second word names the API's. That is a new key on `Field`, so it needs its own justification against *one config tree per job*.

**No recommendation.** The first answer is the coherent one and the second is the compatible one, and the choice is a posture, not a deduction.

---

### 19. What replaces `{ key: 'start', editable: false }` at the data door?

**Raised 2026-09-09 by the `editable` ruling. Blocks group A**, which deletes `CORE_FIELD_OVERRIDABLE_KEYS`.

Before the ruling, `editable` gated the grid only, so `interactions: { edit: … }` replaced the deleted capability exactly — one view-level gate for another. After the ruling `editable` is a **data-level** gate, and `interactions.edit` is a Gantt-level, view-level policy that `data/` may not import (`plans/01` §1). So the deletion now removes something with nothing standing in for it: there is no way to say *`start` is not writable through the API* on this Dataset.

The deletion's own reason is unchanged and still good. A consumer key that a later release promotes to a core key relocates storage in silence, and the override is the window that lets it happen.

**Three shapes, and each has a real cost.**

- **Keep the override for `editable` alone**, as `illegalCoreOverrideKey` already restricts it. Cheapest, and it keeps the silent window the deletion exists to close — narrower than the general case, because only a declaration carrying `editable` slips through.
- **A Dataset-level `readOnlyFields`**, naming keys the API refuses. It is a second way to say what `editable` says, which breaks *one name per concept*.
- **Accept the loss.** Core keys stay writable through `entries.update()`, and a consumer who wants them locked vetoes in `beforeChange`. `beforeChange` is already the cancelable door every mutation passes, so this may be the answer that needs no new surface at all.

**Recommendation: the third, and check it first.** If `beforeChange` genuinely covers the case, decision 19 closes at no cost and the deletion proceeds as written. Probe it before designing anything.

### 20. Should `kind` be authored at all?

**Raised 2026-09-09 by the author, from decision 18's cost table. No recommendation — the question is being recorded, not answered.**

`kind` turned up in 18 as a core Field nothing declares editable, which put `update(id, { kind: 'milestone' })` on the list of calls that would start throwing. That prompts a larger question, and it reaches past this ADR.

**The question, in three parts.**

1. Should `kind` be a **calculated** Field rather than an authored one — derived from structure the way promotion and demotion already derive it — instead of a stored value a caller sets?
2. If it is calculated, is a **milestone** then a custom column a consumer defines, rather than a built-in kind?
3. That assumes a custom column can change **the appearance of the bars on the chart**. If it cannot, that is a limit of our API, and the limit is the finding.

**What is true today, so the question is asked against the code rather than against a guess.** Part 3's premise does not hold at HEAD, and it fails in a specific way worth recording:

- Bar appearance is keyed by **`kind`**, not by a column. `barRenderer` takes `BarRenderer | RendererByKind`, where `RendererByKind = Readonly<Record<string, BarRenderer>>`, and the renderer registry allocates one bar slot per kind (`view/renderer-registry.ts:34`, `bar:${kind}`, D-S5-12).
- A Grid column carries `cellRenderer`, which paints a **grid cell**. Nothing on a column reaches the timeline.
- So a consumer who defines a custom column cannot change a bar, and a consumer who wants a differently-drawn bar defines a **kind** and registers a renderer for it. Kinds are already open — `EntryKind` is `'span' | 'group' | 'milestone' | (string & {})` — and two plugins may each define their own and both install.

**Where it collides.** `plans/01` §2.5 rules *"`Entry.kind` is authored, never derived from having children"*, which default-on `autoGroup` already contradicts at HEAD. Decision **8** asks what demotion returns an Entry to, and its third answer — *stop storing parent-ness* — is a narrower version of this question. If 20 is answered *calculated*, 8 dissolves. If 20 is answered *authored*, 8 still needs its own answer.

**This is larger than ADR 0011** and is recorded here because 18 surfaced it. It reaches `plans/01` §2.5, `EntryKind`, `rollUpKinds`, the renderer registry and the capability resolver.

## Sources for the evidence above

**The named products are deliberate, and they stay.** `CLAUDE.md` bars vendor Gantt product names from specs, docs and code, and it carries one exception for an ADR (ruled 2026-09-09): a decision record has to be checkable, and *"a comparable Gantt does X"* cannot be checked or weighed for how far it generalizes. Do not anonymize these back to *a comparable Gantt* — the earlier text that reads that way predates the ruling. **When these decisions land in `plans/00`–`04`, the names do not travel with them:** a spec states the decision, never the survey behind it.

- AG Grid — [Value Getters](https://www.ag-grid.com/javascript-data-grid/value-getters/), [Transaction Updates](https://www.ag-grid.com/javascript-data-grid/data-update-transactions/), [TypeScript Generics](https://www.ag-grid.com/javascript-data-grid/typescript-generics/)
- TanStack Table — [Column Defs](https://tanstack.com/table/latest/docs/guide/column-defs)
- Bryntum — [data fields and data source](https://forum.bryntum.com/viewtopic.php?t=23351), [manually scheduled summaries](https://forum.bryntum.com/viewtopic.php?p=81164)
- DHTMLX Gantt — [Task Types](https://docs.dhtmlx.com/gantt/desktop__task_types.html)
- Microsoft Project — [summary task rollup](https://support.microsoft.com/en-us/project/rollup-task-field)
- FullCalendar — [Event Object](https://fullcalendar.io/docs/event-object), [issue #7636, *disallow non-standard event properties as `extendedProps`*](https://github.com/fullcalendar/fullcalendar/issues/7636), [the Vaadin binding's `extendedProps` → `customProperties` rename](https://vaadin.com/directory/component/full-calendar-flow)
- tldraw — [Shapes: `props` against `meta`](https://tldraw.dev/docs/shapes)
- Excalidraw — [`customData`](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)
- WHATWG — [custom data attributes](https://html.spec.whatwg.org/multipage/dom.html)
- Kubernetes — [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/), [Well-Known Labels, Annotations and Taints](https://www.kubernetes.io/docs/reference/labels-annotations-taints/)
- OpenAPI — [Namespace Registry](https://spec.openapis.org/registry/namespace/), [Specification Extensions](https://swagger.io/docs/specification/v3_0/openapi-extensions/)
- [RFC 7396 — JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396.html)
- CodeMirror — [Reference Manual](https://codemirror.net/docs/ref/)
- ProseMirror — [`plugin.ts`](https://github.com/ProseMirror/prosemirror-state/blob/master/src/plugin.ts)
- Zod — [Defining schemas](https://zod.dev/api)
