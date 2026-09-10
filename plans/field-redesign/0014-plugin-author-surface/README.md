# ADR 0014 — the plugin-author surface

**The decision:** [`docs/adr/0014-…`](../../../docs/adr/0014-the-plugin-author-surface.md)

Where a plugin's own Field values live, whether a Field key carries a namespace marker, what the read doors are called, and what an extender returns.

## Where it stands

**Four decisions are open — 9, 12, 13 and 16.** Two are closed — 7 and 14, and both were already recorded as downstream of 9.

**Nothing blocks the storage rename on this ADR, and it blocks nothing there.** That is the point of splitting it out. It was the heaviest gate on the old [ADR 0011](../0011-consumer-values-in-props/README.md), and it was never a real one.

**Two answers still serialize with work that already shipped.** Decision 16 waits on [0011](../0011-consumer-values-in-props/README.md) decision 22 — both edit the extender seam. Decision 13 waits on [0012](../0012-optional-dates/README.md) — `durationOf` becomes `Duration | undefined` there. Close those first.

## Why it does not gate the storage rename

`Entry.meta?: TMeta` is consumer-typed today (`model/entry.ts:39`), and a plugin's Field values already sit in that bag beside the consumer's — `field-registry.ts:148` says so in `authored`'s own comment. So [0011](../0011-consumer-values-in-props/README.md) ships `props: Readonly<Partial<TProps>>`, which is **HEAD's exact posture under a new name**. It inherits the arrangement; it does not choose it.

This ADR then either **widens** the type to `Readonly<Partial<TProps & PluginEntryProps>>` — additive, nothing breaks — or **migrates** the values to the plugin's own store. Neither is blocked by the rename having landed.

**The price of deciding late, stated honestly.** If 12 lands on a required plugin prefix, the Document written by 0011 holds `props: { progress: 60 }` and this ADR rewrites it to `props: { 'scheduling:progress': 60 }`. That is **schema 8** and a rename of plugin-**declared** keys — not the 184-occurrence `StoredEdit` rename. Decision 3 prices a pre-release schema number at zero, and the library has never shipped.

## 9 and 12 are one decision

Answer them together or the answers cancel. 9's case for sharing `props` rests on `entry.props.progress` reading as a typed dot access, and 12's plugin prefix takes the dot away. **Settle 13 after 9, and after [0012](../0012-optional-dates/README.md)** — whether the by-key doors merge or only share a name depends on whether a plugin's values need routing, and `durationOf`'s return type lands in 0012.

## One file, three ADRs, no decision collision on the merge

`data/edit-extension.ts` is touched by [0011](../0011-consumer-values-in-props/README.md) (the shallow-spread fix at `:35`, and decision 22's brand on the edit type) and by decision 16 here (the extender's signature and who owns composition). The spread fix and the signature are **different symbols** — expect a merge conflict, not a contradiction. **Decision 16 still waits on 22**: both edit the extender seam. Close 22 with 0011, then design 16 against the branded (or diffed) `ProposedEdit`.

---

# Open decisions

## 9. Where does a plugin's own Field value live?

**Gates this ADR**, because it decides what `Dataset<TProps>` promises. It does **not** gate [0011](../0011-consumer-values-in-props/README.md) — see *Why it does not gate the storage rename* above.

**A probe removed the argument that carried this.** The honest-generic case for a separate plugin store rested on `entry.props` being a lie the moment a plugin installs. It need not be. Probed with `tsc`, with the app author's call site unchanged and nothing hand-written by them:

```ts
// the plugin package ships this line in its own .d.ts
declare module 'freegantt' { interface PluginEntryProps { progress?: number } }

// the app author, exactly as today
const dataset = new Dataset<TaskProps>({ entries, plugins: [scheduling()] });
dataset.entries.get('t1')?.props.progress    // number | undefined — nothing hand-written
```

`Entry.props` becomes `Readonly<Partial<TProps & PluginEntryProps>>`. tldraw ships this pattern for custom shape props. Augmentation is global to the TypeScript program, so an app that installs a plugin on one Dataset sees the key typed on every Dataset. Every augmented key is optional, so it over-approximates and never claims a value is present. **A plugin type parameter on the constructor is not available** — see [`refuted.md`](../shared/refuted.md).

**The three options, as calls.**

| | Option | Cost |
|---|---|---|
| **A** | **Share `props`** | One home, so a grid edit needs no routing and a cascade writes the same `EntryEdit` as any other write. With augmentation the generic is honest |
| **B** | **An `Entry.pluginData` sibling** | Honest, but a third Entry key and a fourth Document key. It does **not** stop two plugins colliding unless it is keyed by plugin id — at which point it is C with extra steps |
| **C** | **The plugin's own store** | `plugin-store.ts` already ships `PluginStores`, `reserve<T>()` and `read<T>()`, and `PluginDocument` already serializes it. *Every* door that names a Field key must route — `entries.update`, the cell editor, the cascade, undo — and `toJSON` must learn that a leaf plugin value already lives in `PluginDocument`. Worse, `update('t1', { props: { progress: 60 } })` would type-check and write the consumer's bag while the grid reads the plugin's store. **If C is picked, `PluginFieldNotInDataError` is part of the pick, not a follow-up** |

**One recent field report runs against option A with nothing separating the writers: a shared bag with two writers and no marker gets split eventually**, and the split is a breaking rename for everyone using it. The report, with quotes, is in [`evidence.md`](../shared/evidence.md).

**What is true today, so the options are weighed against the code.** A plugin's Field values already sit in `props`, beside the consumer's. `field-registry.ts`'s `authored` excludes plugin-declared Fields from the Document on a stated premise — *"The plugin's values are not affected — those sit in `Entry.meta`, which round-trips whether the Field is declared or not."* One word changes and the guarantee does not. `PluginDocument` (D-S5-24) keeps its current job, the plugin's own non-Field rows. **This is a description of HEAD, not a ruling.**

ADR 0005 deferred a separate consumer store on the grounds that *"a consumer declaring their own key in their own `meta` has nobody to collide with"*. **With plugins installed, they do.** The registry already refuses a duplicate *declaration*. It does not refuse a *value* the consumer wrote before the plugin existed. **What sharing must gain, if it survives, is an error message that names the plugin.**

**Recommendation: A, with augmentation, and a required plugin prefix on the Field key (see 12).** The prefix is what stops A becoming the case above: one home for storage, two owners that cannot name the same key. Keep `PluginStores` for what it is good at — plugin state that is not a per-Entry Field, such as dependencies, baselines and caches. Bryntum keeps dependencies in a separate store for exactly that reason.

**Two findings against that recommendation. Neither is fatal; both have to be answered inside the pick.**

**First: 9's recommendation and 12's cancel each other.** A's whole proof is the probed call site above — `entry.props.progress`, a typed dot access. A prefixed key is not an identifier, so the read becomes `entry.props['scheduling:progress']` and the dot goes away. Every by-key call changes with it, `gridColumns` included. **So the prefix removes the reason to reject C and the reason to pick A in one stroke.** If both recommendations stand, say plainly that A is picked for its single storage home and not for the typed dot.

**Second: A was probed for reads and never for writes.** `PropsEdit<TProps>` maps `keyof TProps`, and a plugin's key is in the augmented `PluginEntryProps` instead. So `update(id, { props: { progress: 60 } })` does not type-check, and the grid cell editor writes plugin Fields on every editable declaration. A needs `PropsEdit<TProps & PluginEntryProps>` at the write door, which puts back the intersection that *one generic* was meant to remove. **Probe the write before picking A.**

---

## 12. Do consumer and plugin Field keys need a namespace marker?

**Raised 2026-09-09 by the author. Gates this ADR, and not [0011](../0011-consumer-values-in-props/README.md).** The question: should `{ key: 'owner' }` be `{ key: 'props.owner' }`, so the declaration says exactly where the value lives and a collision cannot happen?

**The first pass argued against it on evidence that is now withdrawn**, and its decisive objection dissolves too — both are [`refuted.md`](../shared/refuted.md) item 7.

**The real precedent is platforms that own part of a key space, and it is strong.** HTML, Kubernetes, OpenAPI and FullCalendar each split the space, and the table is in [`evidence.md`](../shared/evidence.md). Three lessons come out of it, pointing in different directions for our three writers:

- **For the consumer, a prefix buys forward compatibility.** HTML's `data-*` exists so authors avoid clashes with future versions of HTML — the hazard this ADR names when it deletes the core-key override. **HTML solved it with a prefix; SQL and CSS solved it with a reserved word list.** Both work.
- **For a third party, one shared prefix is not enough.** OpenAPI shipped a single `x-` space, vendors collided inside it, and the Initiative added a namespace registry. Kubernetes reached the same answer by rule. That is this library's plugin-versus-plugin collision, solved twice in the field.
- **A prefix that names _ownership_ costs less than one that names storage.** A consumer's `compute` Field and a consumer's stored Field then carry the same prefix, and nothing renames when a Field moves between them. What survives is smaller: a path needs escaping, and a consumer key holding the separator is ambiguous.

**Recommendation, and it is the Kubernetes shape:**

- **core keys stay bare and become a published, closed reserved list** — the SQL and CSS answer. Adding one in a later release is then a declared breaking change rather than a silent relocation.
- **consumer keys stay bare**, because both standards that split three ways leave the first-party author unprefixed. The app-author call site keeps `gridColumns: ['name', 'cost']`.
- **plugin keys carry a required prefix naming the plugin.** This half has the strongest evidence, it closed 7 at no cost, and it removes the main reason to consider a separate plugin store in 9.
- ~~`props: { start: … }` becomes an error~~ — **overruled 2026-09-09.** It is a warning, the value is ignored, and the core definition wins. See [0011's `props`-value ruling](../0011-consumer-values-in-props/README.md#a-props-key-that-names-a-core-key--warning-and-the-core-definition-wins).

**Still open, and this is the ruling wanted:** may a consumer ever hold a key that shadows a core key? If **no**, the reserved list gives the same guarantee as a consumer prefix at no call-site cost. If **yes**, a bare consumer space cannot deliver it, and `props.`-prefixed consumer keys return to the table on HTML's exact reasoning.

---

## 13. `read` and `fieldValue` are one job under two names

`FieldContext.read(entry, key)` and `entries.fieldValue(id, key)` answer the same question on two surfaces. `plans/02` requires one name per concept; two names for one job is the failure #7 records. Every comparable library uses a verb here — `getValue`, `getCellValue`, `getDataValue`, `record.get`. `fieldValue` is a noun, so the call reads as a property access spelled as a call.

**There are four doors, not two.** `entry.props.k` is the stored bag. `entries.fieldValue(id, k)` resolves any Field key. `ctx.read(entry, k)` answers the same question on the plugin surface. `ctx.durationOf(entry)` answers it for one Field, by name. Widen this decision to all four before renaming anything.

**Two corrections, both checked against the code.** `durationOf` does **not** exist because `duration` owns no `Entry` key — `model/field.ts:19` declares `duration: Duration` on `CoreFieldValues` by hand, so both by-key doors are fully typed. What `durationOf` actually is, is the **implementation** of the `duration` core Field, published as a convenience beside the door it implements. One of the four doors is built out of another. Second, it answers in **two different units** depending on which builder made the context, which is [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). **Settle 13 against that issue**, not against the assumption that `durationOf` earns its place.

**Recommendation: align the names across all four, and settle 9 first.** Whether the by-key doors merge or only share a name depends on whether a plugin's values need routing. **Land [0012](../0012-optional-dates/README.md) first** — `durationOf` becomes `Duration | undefined` there. Renaming a published door is not a decision to take in passing.

---

## 16. Two plugins write one field: what happens?

`edit-extension.ts:35` merges last-wins per Field key and reports nothing. Two installed plugins that both write `start` on one entry produce one value and no signal. The library raises a warning for smaller things — a dropped derived value, an unknown ingest key.

**Held open at the author's request**, together with the three ergonomic complaints beside it. **Waits on [0011](../0011-consumer-values-in-props/README.md) decision 22** — both edit the extender seam. Close 22 with the `ProposedEdit` type, then design this return against that type.

**Related, and confirmed as a defect rather than a preference.** The extension hook makes a plugin author do three things no comparable runtime asks for:

- It returns `new Map()` to say *nothing*, where ProseMirror's `appendTransaction` and CodeMirror's `transactionExtender` both return `null`.
- It brands ids by hand with `entryId('t1')`, against `plans/02`'s promise of loose input on every way in.
- It makes the author write the composition and the merge — `ctx.edits.wrap((next) => (request) => mergeEntryEdits(next(request), extender(request)))` — where CodeMirror combines returned specs itself and ProseMirror appends the returned transaction itself. **#197 exists because hand-rolled composition already lost edits once.**

**Recommendation: the runtime owns composition, merging and branding; the author returns a value or nothing.** A returned value keeps the purity story a mutable collector would blur.

```ts
extendEdits(request) {
  const moved = request.proposed.get('t1');          // plain string, no branding
  if (!moved) return;                                // nothing means nothing
  return new Map([['phase-1', { start: moved.start, props: { risk: 'high' } }]]);
}
```

**Keep the `Map`; an object keyed by Entry id is the wrong container** — [`refuted.md`](../shared/refuted.md) item 9. An array of `[id, edit]` pairs is the other safe shape, and **the three ergonomic complaints stand under either container.**

**The shape is a published plugin-author signature, so it needs a ruling.** Whether a contested write reports, and at what severity, is the other half.

---


---

# Closed decisions

## 7 — what an S7 plugin does with a `progress` value it did not write

**Closed 2026-09-09 as not independent.** Its entire body was *"Downstream of 9."*

A required plugin prefix on the Field key makes a consumer's `progress` and a plugin's `progress` different keys, which closes this at no cost. A shared bare key space leaves it open, and the answer is then an install-time duplicate-declaration error rather than a silent overwrite. **Both answers are decided by 9 and 12.** Listing it separately inflated the count of what was open.

## 14 — should `FieldContext` bind to the row?

**Closed 2026-09-09 as out of scope.** Was: *`compute(entry, ctx)` hands the row to a context that takes it back — `ctx.read(entry, 'cost')`.*

Its own recommendation was *"measure before deciding"*, which is work, not a ruling. Nothing in groups A–D gates on it, and the current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell, which is why `formatValue` gained a third `entry` parameter instead (#240).

**It is an issue, not a blocking decision.** The question survives, folded into decision 13, which now covers all four read doors. Measure there.

