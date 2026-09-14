# Interface: DatasetOptions\<TProps\>

Defined in: api/dataset.ts:51

## Type Parameters

### TProps

`TProps` = `unknown`

## Properties

### aggregators?

> `optional` **aggregators?**: `Readonly`\<`Record`\<`string`, [`Aggregator`](../type-aliases/Aggregator.md)\>\>

Defined in: api/dataset.ts:81

Consumer Aggregators by name. Shipped names (`min`, `sum`, …) are already registered.

***

### dateOnlyEnd?

> `optional` **dateOnlyEnd?**: [`DateOnlyEndRule`](../type-aliases/DateOnlyEndRule.md)

Defined in: api/dataset.ts:75

How a date-only `end` such as `'2026-09-08'` is read. Defaults to `'inclusive'`: the entry
covers through the 8th. `'exclusive'` reads it literally as the start of the 8th, matching
half-open storage exactly. Only date-only strings are affected — see `DateOnlyEndRule`.

***

### entries

> **entries**: readonly [`EntryInput`](EntryInput.md)\<`TProps`\>[]

Defined in: api/dataset.ts:60

What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here.

A declared Field key sits flat, at the top level, the same shape `add()`/`update()` take (ADR
0011, Q15); a nested `props` stays legal for passenger keys and for a bag already held. Typed as
plain `EntryInput<TProps>` — see `model/dataset.ts`'s `EntryStore.add` for why the `&
Partial<TProps>` intersection Q15 suggests is not soundly expressible here; ingest still reads a
flat declared key off any object at runtime regardless of this static type.

***

### fields?

> `optional` **fields?**: readonly [`Field`](../type-aliases/Field.md)[]

Defined in: api/dataset.ts:77

Consumer Field declarations. Core Fields are already in the registry (D-S4-4).

***

### fieldTypes?

> `optional` **fieldTypes?**: `Readonly`\<`Record`\<`string`, [`FieldType`](FieldType.md)\<`unknown`\>\>\>

Defined in: api/dataset.ts:79

Named Field type bundles. A Field's own keys win over the bundle (D-S4-3).

***

### history?

> `optional` **history?**: `object`

Defined in: api/dataset.ts:90

Undo/redo History. `{ capacity: 200 }` keeps 200 undoable transactions; defaults to 100
(`plans/s2-data-core/s2.5-undo-redo.md` §1).

#### capacity?

> `optional` **capacity?**: `number`

***

### measureDuration?

> `optional` **measureDuration?**: [`DurationMeasure`](../type-aliases/DurationMeasure.md)

Defined in: api/dataset.ts:87

How core measures a duration (ADR 0017, Q6/J12). `'span'` is `end - start`, and it counts a gap
 between two Segments; `'segments'` sums the Segments and counts no gap. Defaults to `'span'`.
 `entry.duration()`, `ctx.duration()` and the core `duration` Field all read it. It sits on the
 Dataset and not on a Field: two Fields on one Dataset must not disagree about what a duration
 is.

***

### plugins?

> `optional` **plugins?**: readonly [`PluginOf`](../type-aliases/PluginOf.md)\<`unknown`, [`Dataset`](../classes/Dataset.md)\<`TProps`\>\>[]

Defined in: api/dataset.ts:105

The plugins this Dataset installs (D-S5-24, ADR 0019). An unordered set: installation resolves
 setup order from each plugin's `requires`, so `[scheduling(), entryDependencies()]` and the
 reverse install the same way (D-S5-31).

 Every plugin's `data` half runs during this constructor, so a Field one declares is in the
 registry before the first Rollup walks — which is why `Dataset.plugins` is read-only. A plugin
 that also fills a `view` half has that half run once per `Gantt` bound to this Dataset, each
 with its own context (I2). A chrome-only plugin is legal here too, and then every Gantt on this
 Dataset gets it; install it on one `Gantt` instead to give it to that Gantt alone.

 `PluginOf`'s Gantt type argument stays `unknown` here: a Dataset never calls a `view` half, so
 it never needs the `Gantt` type to type-check what it holds — and naming `Gantt` in this file
 would close an import cycle. Write the fully bound `Plugin<TProps>` (`api/gantt.ts`) when you
 declare a plugin; it assigns here unchanged.

***

### timeZone?

> `optional` **timeZone?**: `string`

Defined in: api/dataset.ts:71

IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
week starts) resolves through it, so two users in different zones see identical day boundaries.
It is also the zone a Plain (zoneless) date in `entries` resolves through.

Optional (#129). Omit it to author in the current viewer's own zone — resolved once, at
construction, from the environment (`Intl`, `'UTC'` if that reports nothing) and then fixed
for this Dataset's lifetime, same as an explicit value. Omitting it trades cross-viewer
consistency for ergonomics: a Plain date then reads differently for a viewer in a different
zone. Pass it explicitly whenever the dataset must render identically for every viewer, such
as a shared project plan.
