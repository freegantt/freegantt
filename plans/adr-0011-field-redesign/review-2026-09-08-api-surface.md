# Review — ADR 0011's proposed API surface

> **Delete this file when it is vetted.** It is a reviewer's working record, not a decision.
> Move each accepted finding into `README.md` or into `docs/adr/0011-…md`, open an issue for each
> deferred one, then remove this file. It has no authority over either document.

**Reviewed:** `plans/adr-0011-field-redesign/README.md` and
`docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md`, at `33aceec`.
**Method:** every code claim below was opened at HEAD before it was used. File and line numbers are
from HEAD, not from the plan.

**Verdict:** the storage model is right, and the two rulings hold each other up as the ADR says.
Four things must change before group A starts. Three of them are type defects that the plan states
as settled. One is a rule hole on the plugin surface. Nine more findings sit below them.

---

## Part 1 — every proposed API, one at a time

### 1. `Dataset<TData>` — one generic

```ts
class Dataset<TData = Record<string, unknown>> { … }
```

**Good.** Two generics that name one set of values and never meet is a real defect, and
`harness/planner.ts:31` proves it at a call site.

**Issue 1.1 — the widening type is unstated.** `harness/main.ts:85` casts a Dataset through
`unknown` today, with a comment that names the reason: *"`Dataset<TFields>` gives no common type two
differently-fielded instances both satisfy."* That is harness code compensating for the library, so
it is an API gap by CLAUDE.md's stop rule, and this ADR rewrites the exact generic behind it. The
ADR must answer one of two ways. Either `Dataset<A>` is assignable to `Dataset` (the default
parameter), and the cast goes; or it is not, and the ADR records that the cast survives the
redesign. Do not assert either from the type diagram — `EntryStore`'s members are methods, so they
compare bivariantly, and the answer changes with one property-vs-method edit. Probe it with a
throwaway test, read the answer, delete the probe.

**Issue 1.2 — the plugin surface carries the generic too.** `src/api/dataset.ts` publishes
`DatasetPlugin<TMeta, TFields>`, `DatasetPluginContext<TMeta, TFields>` and
`Dataset.fromJSON<TMeta, TFields>`. Group A's list does not name them. They are public.

### 2. `EntryInput.data?: TData`

```ts
interface EntryInput<TData = Record<string, unknown>> { …; data?: TData; }
```

**Good at the call site.** `data: { owner: 'Jo' }` reads as one job.

**Issue 2.1 — `data` is optional and `Entry.data` is required. That pair is unsound.** The ADR
fills `{}` at ingest. `{}` does not satisfy `TData` when `TData` holds one required key. A consumer
who writes `Dataset<{ owner: string }>` then reads `entry.data.owner` as `string` and gets
`undefined`. This repo forbids a lie generic, and the ADR names that rule itself.

Fix it with the idiom the ADR already uses for `DataEdit`:

```ts
/** `data` is optional while every key of `TData` is optional. One required key makes it required. */
export type EntryDataSlot<TData> = {} extends TData ? { data?: TData } : { data: TData };
```

The alternative — `Entry.data: Readonly<Partial<TData>>` — reads every value as
`T | undefined` forever, which throws away the reason for the generic. Take the slot type.

### 3. `Entry.data: Readonly<TData>`, always present

**Good.** It follows `segments`, so no reader carries a "no data" branch. The copy-at-ingest rule
(ADR consequence *"`data` is copied at ingest, and immutable afterwards"*) is right and is the one
thing that makes deleting `metaRecord` safe.

**Issue 3.1 — a `data` key that shadows a core key is unreachable, and nothing says so.** `data`
accepts undeclared keys. `entry.data.start` is therefore legal and stores fine. `fieldValue(id,
'start')` answers `entry.start`, because the key space is one space and the core key owns the name.
The consumer's value is then invisible to every Field-shaped read, with no error. "The key is the
whole address" is true only when no two homes answer one key. State the rule: a `data` key that
names a core key is a mistake. Raise the same ingest warning the ADR already gives an unknown
top-level key.

### 4. `EntryEdit.data?: DataEdit<TData>` — the merging patch

**The plan's stated type does not compile as intended.**

```ts
// today (src/model/entry.ts)
export type EntryEdit<TMeta, TFields> = Partial<Omit<EntryInput<TMeta>, 'id'>> & Partial<TFields>;
```

The plan says `EntryEdit` *"restates `data?: DataEdit<TData>` rather than inheriting it"*. An
intersection cannot restate a property. `{ data?: TData } & { data?: DataEdit<TData> }` requires
`data` to satisfy **both**, so a partial patch fails against a `TData` with a required key, and the
remove verb is refused by the inherited half. The restatement has to be an omission:

```ts
export type EntryEdit<TData = Record<string, unknown>> =
  Partial<Omit<EntryInput<TData>, 'id' | 'data'>> & { data?: DataEdit<TData> };
```

Write that exact type into the ADR. It is the whole of the "two doors take different shapes" ruling,
and the prose form of it is wrong.

### 5. `DataEdit<TData>`

```ts
export type DataEdit<TData> = {
  [K in keyof TData]?: {} extends Pick<TData, K> ? TData[K] | undefined : TData[K];
};
```

**Correct, and the reasoning behind it is correct.** `Partial` does delete the remove verb under
`exactOptionalPropertyTypes`. The mapped type keeps it for an optional key and refuses it for a
required one, which is the right pair of answers.

**Issue 5.1 — publish it from `api/`, and give it a `plans/02` row.** The ADR says it is exported.
Nothing in group A says where from.

### 6. The `Field` union

```ts
type Field<TValue = unknown> =
  | { key: FieldKey; type?: FieldTypeName; rollUp?: AggregatorName; editable?: boolean;
      compute?: never; /* equals, compare, formatValue, parseValue, inputType, column */ }
  | { key: FieldKey; compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      rollUp?: never; editable?: never; /* compare, formatValue, column */ };
```

**Good.** Deleting `FieldSource` is the strongest part of this ADR. The declaration stops carrying
an address that the library owns. `compute` is the right word, and the call site reads.

**Issue 6.1 — the error has two names.** The ADR writes `ComputedFieldCannotStoreError` at its Field
union and `ComputedFieldCannotBeWrittenError` in its consequences, with an argument for the second.
`README.md` names neither. Pick the second, use it once, and add it plus
`DerivedFieldNotWritableError` to `plans/02` §7 in the same edit that deletes the two `FieldSource`
rows.

**Issue 6.2 — `TValue` on the compute arm promises a type that nothing reads.** `FieldRegistry`,
`DatasetOptions.fields` and `FieldLookup` all hold bare `Field`, so `compute`'s return type is lost
at declaration. `fieldValue(id, 'ref')` then answers `unknown`, because `TData` has no `ref` key.
That is defensible, and it is invisible: a consumer writes `compute: (e) => rowNumber(e.id)` and
reasonably expects `number` back. Extend `Field`'s existing "declaration-site aid" comment to say
so, in one sentence, and keep #267 pointed at it.

**Issue 6.3 — `{ key: 'data' }` type-checks.** `FieldKey` is `CoreFieldKey | (string & {})`, so only
the registry refuses the reserved key, and only at runtime. That is acceptable. Say it, so nobody
tries to close it in the type and flattens `FieldKey` doing it.

### 7. `CoreFieldKey = keyof Omit<Entry, 'id' | 'data'>`

**Good, and it removes the `meta` core Field cleanly.** One consequence is unlisted:
`src/data/change-set.ts:85` skips the literal string `'meta'` on the raw-key path. Group A must
rename it. `src/data/fields/field-access.ts:26` (`isOptionalEntryKey`) names `'meta'` too, and must
drop it — `data` is never absent, so it is never deleted by an explicit `undefined`.

### 8. `entries.update()` refuses a derived write

**Right answer at the right door**, and `view/capability.ts:119` already asks the same question, so
I14 is satisfied for the three doors the ADR lists.

**Issue 8.1 — there is a fifth door, and it is the plugin's.** The ADR puts the refusal at
`EntryStore.update()` *so that a cascade is not bound by it*. So an `EditExtender` may still propose
a rolling-up parent's rolling-up Field. What happens then is unwritten. I read the pass:
`src/data/rollup.ts:196` calls `editProposesField(body.get(parentId), field)` — `body`, never
`merged`. Extender edits live in `merged`. So a cascade's parent write commits, enters the
ChangeSet, enters undo, and the same pass overwrites it in the same commit. That is precisely the
silent revert this ADR exists to end, one layer down. The ADR then retires D-S2-22 on the premise
that *"nothing reaches the guard"*. A cascade reaches it.

Answer it before group C. Two candidates: drop the value and raise the same warning `add()` raises
(consistent, and a plugin author reads a diagnostic rather than learning a rule), or widen the skip
to `merged` and let a plugin win the pass (louder, and it re-opens D-S2-22 rather than retiring it).
I recommend the first. Either way it must be written, because "one question, one answer" is the
claim being made.

### 9. `entries.add()` and `fromDocument` drop the value, and report

**Issue 9.1 — `add()` is not a bulk door.** The ADR's reason for dropping instead of refusing is
that a door carrying whole Entries in bulk should not reject a 500-row import over one key. That
argument fits `fromDocument`. `entries.add(input)` adds one Entry, from one call, naming one Entry's
keys — the same shape `update()` refuses. As written, the same authored value throws or warns
depending only on which method the consumer called.

I recommend `add()` throws `DerivedFieldNotWritableError` too, and only `fromDocument` drops. That
takes the doors that answer differently from two to one, which is what I14 asks for. Construction
(`new Dataset({ entries })`) is the case to weigh against this: it is bulk in the same sense the
Document is, so it may keep the drop. State the split as *authored one at a time refuses; read in
bulk drops* — that rule names the doors without naming the methods.

### 10. `toDocument` omits a rolling-up parent's rolling-up keys

**Good, and the argument that it needs the `update()` refusal beside it is correct.**

**Issue 10.1 — the two documents name this door four ways.** `README.md` says
`toDocument`/`fromDocument`. The ADR body says `toJSON`/`fromJSON` throughout, including its door
table and its flow. The public class publishes `toJSON`/`fromJSON` (`src/api/dataset.ts:312,326`),
and `9c3f704` renamed the internals to `toDocument`/`fromDocument`. Both documents are half right,
and together they read as four doors. Pin one sentence: the public door is `dataset.toJSON()`, the
internal function is `toDocument`, and the plan writes the internal name.

### 11. Schema `5` now, `1` at release

**Issue 11.1 — restarting the count makes `1`–`5` ambiguous.** A dev-era `schema: 3` file and a
released `schema: 3` file are then indistinguishable, and a released reader accepts the old one and
misreads it. The monotonic argument only holds while a number is never reused. Release as `6`, or
write a `preRelease: true` marker that a released reader refuses. It costs one key now and cannot be
added later.

### 12. Optional `start` / `end`, on every kind

**Right call**, and deleting the `referenceDate` fill (`src/data/entry-reader.ts:170`) is overdue.
This is the largest group by blast radius: 27 non-test files under `src/` read `.start`.

**Issue 12.1 — the dates/Segments invariant is unstated.** `#212` says `segments` is never empty,
and ingest fills one Segment over `[start, end)`. A dateless Entry has no Segment, so the invariant
changes and neither document says how. State it as a biconditional: **an Entry has dates if and only
if it has at least one Segment**, and the envelope is always the Segments' envelope. Then say what
`entries.add({ segments: [...] })` with no dates does — I expect it derives them, and that is a
feature worth naming. `src/data/serialization/index.ts:45` and `src/data/entry-reader.ts:127` both
branch on `length === 1` today; each gains a `length === 0` arm.

**Issue 12.2 — `durationOf` cannot answer, and it is public.** `FieldContext.durationOf(entry):
Duration` (`src/model/field.ts:189`) computes `diffMs(entry.end, entry.start)`
(`src/data/fields/field-access.ts:92`). With no dates there is no duration. The return type becomes
`Duration | undefined`, which changes `CoreFieldValues.duration`, the shipped `duration` core Field
(`core-fields.ts:118`), `formatDuration`, `compareDuration`, and `weightedMeanByDuration`'s weight
(`aggregators.ts:14`). That is a plugin-author surface change. Group D does not list it.

**Issue 12.3 — there is a way to make a dateless Entry and no way to un-date one.**
`entryAfterEdit`'s `isOptionalEntryKey` decides which keys an explicit `undefined` deletes.
`start`/`end` are not in it. Rule the verb in or out. If it is in, the "both or neither" rule must
refuse `{ start: undefined }` on its own, the same way ingest refuses one date without the other.
The ADR already records the mirror hole (a dateless row cannot be dated through the UI); this one is
unrecorded.

### 13. Deleting the core-Field override

Losing `{ key: 'start', editable: false }` for `interactions: { edit: … }` is a fair trade, and the
reason (a later release moving a key across the boundary in silence) is the strongest argument in
that section. The ADR already flags the one thing to check — whether `Field.editable: false` refuses
`entries.update()` as well as the gestures. Keep that check; it is #256's, and it is real.

### 14. `rollUpKinds` becomes a destructive setter

**This is the sharpest edge in the ADR, and it is recorded as a consequence rather than designed.** A
live-reconfigurable config key that drops stored values **and clears undo history** is a large thing
to hand a consumer through a property assignment. `plans/02` says every config key is
live-reconfigurable; it does not say one may erase history.

Ask for one of three, in the ADR, not during implementation: refuse the flip while the store holds
authored values on that kind and name the error; keep the values and let the Rollup overwrite what
it can; or keep the drop behind an explicit call (`gantt.dataset.setRollUpKinds(kinds, { drop:
true })`) so no plain assignment destroys anything. I recommend the first — it is the only one where
a consumer cannot lose data without reading a message.

### 15. `StoredEdit` → `ProposedEdit`

**Good.** `request.proposed` is the published call site, and the type now matches it. The weaker
conversion name (`toProposedEdit`) is the right thing to trade away. Rename with serena, per
CLAUDE.md; 184 occurrences is exactly the case a text replace gets wrong.

### 16. `mergeColumn` — the pre-work fix

**The diagnosis is correct.** Verified at `src/data/fields/field-registry.ts:52-61`: `sizing` binds
the whole `own` or `from` object, and it is spread last, so the bundle's non-sizing keys overwrite
the Field's own.

Two notes on the proposed fix. First, extract the pair on **both** branches; the `own` branch is
harmless today only because `ownRest` was already spread, and leaving it whole preserves the same
trap for the next reader. Second, the plan asks for three test rows and none of them names `flex`.
Add a fourth: a bundle that sets `width` and a Field that sets `flex`. That is the case #249's rule
exists for, and the pair is the thing being extracted.

---

## Part 2 — findings that cross the whole plan

### C1 (blocking, group B) — an undeclared `data` key still emits no ChangeSet row

Open 1 is settled as *yes, an undeclared key may travel in a `data` patch*, and the plan says group B
must put undeclared keys into `proposedKeys` or the write produces no row and no undo step. That is
necessary and **not sufficient**. I read `diffEdit` (`src/data/change-set.ts:75-81`): when an edit
states `proposedKeys`, the loop iterates `registry.all` and skips any Field the set does not name. A
key that is in the set and not in the registry is never visited. `toStoredEdit` stamps
`proposedKeys` on every public write (`src/data/entry-reader.ts:517`), so every consumer write takes
that branch.

The read is missing too: `ctx.read` answers `undefined` for an unregistered key
(`src/data/fields/field-access.ts:87`), so even a fixed loop has nothing to diff.

Group B needs both: iterate the proposed keys and the registry, not the registry alone; and give an
undeclared key a read path to `entry.data[key]`. Without them, the settled ruling ships as a silent
write — the exact fault class #197 and #238 already cost this repo.

### C2 (must answer) — `data` names a value namespace and a core layer

CLAUDE.md's cautionary example is #7: "chart" meant two things, nothing said which, and it stalled a
review. This ADR rejects `meta` because it names four things. It then picks `data`, which already
names the mandatory core layer and its directory, and now also names an Entry key, a Document key,
`DataEdit`, and the ordinary English word both documents use dozens of times. "`data/` merges
`data`" is a sentence this plan will have to write.

The call site itself is fine — `entry.data.owner` and `update(id, { data: { owner } })` both read.
The collision is in prose and in grep, which is where this repo's reviews happen.

Answer it in the ADR rather than leaving it to the reader. My recommendation: keep `data` at the
call site, and add one ruling to `CONTEXT.md` beside the new glossary entry — the layer is always
written with the slash (`data/`), the namespace is always written as a property (`entry.data`), and
neither is ever written as the bare English word in a spec. If the author prefers a clean word,
`values` is the best available (`entry.values.owner`, `ValuesEdit`); its cost is one collision with
`RollUpContext.values(children)`, in a different type and a different shape.

### C3 (gate is unusable as written)

`grep -rn '\bmeta\b\|FieldSource\|source: {' plans/ docs/ src/` returns **631 hits across 120
files** at HEAD. It matches `import.meta` (6 hits under `src/`, `harness/`, `e2e/`), every
historical slice plan, and ADR 0005 (11 hits). The gate says it must return nothing outside this
ADR's own history. That is either unachievable or destructive: `docs/adr/0006:75` records the
convention that an ADR is **superseded, never edited**, and the F table's own ADR 0005 row says the
same.

Scope the gate to the live surface, and exclude the record:

```
grep -rn '\bmeta\b\|FieldSource\|source: {' src/ harness/ CONTEXT.md CLAUDE.md \
  plans/00-overview.md plans/01-domain-architecture.md plans/02-public-api.md \
  | grep -v 'import\.meta'
```

Slice plans under `plans/s*/` are history too. Say which of them are live spec and which are record.

### C4 (B1) — option C is cheaper than the README says, and it has one real cost

The README's option C claims `src/data/plugin-store.ts` already ships the machinery. Verified:
`PluginStores` at `plugin-store.ts:42`, `reserve<T>()`/`read<T>()` at `:62,74`, and `PluginStore` /
`PluginStoreView` are already public from `src/api/dataset-plugin.ts:29`. So option C adds no store
and no Document key. Its real cost is elsewhere, and the README does not name it: with two homes for
Field values, `fieldValue(id, 'progress')` must resolve **which** home, so the registry has to make
the declaring plugin part of the address. `FieldRegistry.#declaringPlugin` already records it
(`field-registry.ts:99`). Whether that is one indirection or a fork in every read is the question the
sample-code exercise should answer. Write the read path for both callers, not just the write path.

### C5 (B2) — my answer, offered as input

The union closes **storage**, not **reading**. A `compute` Field on a rolling-up parent reading
`entry.data.cost` reads a value that legitimately sits in the store at read time; the Rollup put it
there, and reading a stored value is what every Field does. So run `compute` on every row, group
rows included, and let `ref: (entry) => rowNumber(entry.id)` answer everywhere. The genuine gap B2
exposes is different, and smaller: a `compute` Field cannot ask *am I on a rolling-up parent*,
because `FieldContext` carries no `isRollUpKind` and cannot reach a second Entry. That is #214.
Record the answer and point at #214; do not hold group C for it.

### C6 (ingest warning) — the unknown-key list has no owner

*"An unknown top-level key at ingest raises a warning"* needs an `Object.keys(input)` walk per Entry
against a known-key set. Two costs the plan does not own: one walk per row at construction, and a
list that will drift from `EntryInput` because nothing links them. Derive the set from `CORE_FIELDS`
plus `'data'`, or drop the warning — the compiler already refuses an unknown key in a written
literal, which is the case the plan cites.

### C7 (work order) — "no green commit between A and D" needs a scope

That is fine on this branch and not fine on `main`. Say it as: the branch may be red between A and
D, `pnpm verify:full` runs green before the PR merges, and the pre-push hook is the backstop. The
memory of #142 and #255 is that a green `verify` over a red `e2e/` reads as done; a red branch that
nobody re-gates reads the same way.

---

## Part 3 — what to do, in order

**Before group A starts**

1. Fix the `EntryEdit` type in the ADR (§4). It is stated as prose that does not hold.
2. Rule the `data`-slot soundness (§2.1). Take `EntryDataSlot`, or accept the lie generic in writing.
3. Answer C1 in group B's list. The settled Open 1 does not work without it.
4. Answer §8.1 — what a plugin cascade's derived write does.
5. Answer C2 — one meaning per word for `data`.

**Before group C**

6. Decide §9.1 — `add()` refuses, or the rule is written as bulk-versus-single.
7. Decide §14 — how a `rollUpKinds` flip loses values, if it may lose them at all.

**Before group D**

8. State the dates ⇔ Segments biconditional (§12.1).
9. Add `durationOf` and the `duration` Field to group D's list (§12.2).
10. Rule the un-date verb in or out (§12.3).

**Editorial, any time before the work lands**

11. One name for the computed-write error, and `plans/02` §7 rows for both new errors (§6.1).
12. One name per Document door across both documents (§10.1).
13. Schema numbering (§11.1).
14. Scope the gate grep (C3).
15. Publish `DataEdit` from `api/`, with a `plans/02` row (§5.1).
16. `mergeColumn`: extract the pair on both branches, and add the `flex` test row (§16).

**Nothing here changes the ADR's two central rulings.** The key is the whole address, and a derived
value never persists. Both are right, and both are worth the work.
