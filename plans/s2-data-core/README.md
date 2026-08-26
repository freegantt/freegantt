# S2 — Data core: transactions, undo, changesets, JSON

**Slice:** S2 (`plans/03` §S2) · **Issue:** #1 · **Closes:** #33 · **Implements (core half):** #15 · **Baseline:** `main` @ `ed3b935` (`.slice` = `S2`, S1 gate green with six ✔)
**Governed by:** `plans/00` D4/D7/D10/D12, `plans/01` §1/§6, `plans/02` §2/§3/§6, `plans/04` §1/§2.
**Form:** the same settled-spec form as [`plans/s1.11-close-the-gate/README.md`](../s1.11-close-the-gate/README.md). This file holds the decisions; the seven step files hold the TODO boxes.
**Not yet decided:** [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) holds every question this slice still owes an answer to, and names the step each one blocks. Nothing settled here is repeated there.

S2 builds the layer every later slice rides on. It is also the slice that widens the public surface most — mutation, undo, events and a versioned JSON contract all arrive at once — so it is the slice where the surface starts being governed (I11, `plans/04` §2: "api-report — S2").

Three findings are load-bearing enough to state before anything else:

1. **`plans/02` and `model/dataset.ts` disagree about what `dataset.entries` is.** `plans/02` §2 publishes `dataset.entries.update('t2', { … })`; `model/dataset.ts` declares `readonly entries: readonly Entry[]`, and `layout/`, `view/` and `api/` all read it as an array today. One of the two has to move, and it cannot be decided later: every mutation call site in this slice is on the losing side of it. §2 D-S2-2.
2. **`data/` cannot serialize without `time/`, and the layer map has no `DATA --> TIME` arrow.** Instant⇄ISO is time math and I10 confines it to `time/`. The arrow's absence was honest through S1, when `src/data/` held one `export {}`. It stops being honest the moment the store reads a consumer-written date. §2 D-S2-1.
3. **`view/event-bus.ts` says the step that needs a shared bus makes the call.** This is that step: `plans/02` §3 puts `change` on the `Dataset` and `gridWidthChange` on the `Gantt`, and both need one `EventBus`. §2 D-S2-5.

---

## 0. Scope calls — confirmed

| # | Question | Answer |
|---|---|---|
| **Q1** | **Does S2 ship the plugin-installation API** (`DatasetOptions.plugins`, `setResolver`) that #15 designs? | **No — only the hook it feeds.** `DatasetData` holds one resolver field, initialized to identity before any transaction can run, with exactly one call site in the commit path. The public way to *claim* the slot lands in S3 with the plugin that claims it; a `plugins: []` option nothing can fill is the dishonest surface I11 exists to catch. Tests inject a resolver through the internal `DatasetDataOptions`, which proves the commit path is generic without widening anything public. §2 D-S2-6. |
| **Q2** | **Does S2 ship `declareStore` and the `plugin:${id}/${name}` arm of `StoreName`?** | **No.** `StoreName` is `'entries'` in S2 and widens in S3 with the first plugin store (#16). Shipping a union arm nothing produces makes `ChangeSet` untypeable at the point of use for no gain. §2 D-S2-7. |
| **Q3** | **Does S2 ship `hierarchy: { autoGroup: true }`?** `plans/02` §2 shows it on `DatasetOptions`. | **No — `plans/03` puts it in S5**, with the tree UI that gives it a visible meaning. S2 stores `parentId` and validates it (no unknown parent, no cycle); it derives nothing from it. Recorded here so a reader does not read its absence as an oversight. §9. |
| **Q4** | **Is `Entry.start`/`end` still mandatory when `kind` derives its span** (`plans/01` §2.5: "input may omit them and they are initialized")? | **Mandatory in the store, optional on input — and S2 both initializes and maintains them.** An input omitting both gets a zero-length span at the dataset's **Reference date** (CONTEXT.md); from then on the span rollup keeps it equal to the union of its children's. The rollup ships in S2 as the default resolver, because a group whose dates never follow its children is not a group. §2 D-S2-10, D-S2-22. |
| **Q5** | **Does the render path get a rAF owner in S2?** `docs/01` marks `raf-single-owner` `PLANNED (S2)`. | **Yes.** The caller is in this slice: the mutation playground fires several mutations in one tick, and each auto-wrapped mutation is its own changeset. Measured cost of the migration: 45 dom tests, ~14 call sites. §2 D-S2-15. |
| **Q6** | **Does S2 need a new harness page, or can the playground live on `index.html`?** | **A new page.** `e2e/harness.spec.ts` asserts against `index.html`'s fixed entry count; a page whose whole purpose is to change that count cannot share it. Same reasoning that gave S1.11 `large-dataset.html` (D-S1.11-5). §2 D-S2-17. |

---

## 1. User stories

Acceptance for each story is the checkbox under it. The boxes live in the step files; this list says which step owns each.

- **U1.** (consumer) I call `dataset.entries.update('t2', { end: '2026-10-01' })` and the bar moves on screen. I wrote no invalidation code. → S2.4
- **U2.** (consumer) I wrap fifty edits in one `dataset.transaction(…)`. I get **one** `change` event, one layout pass, one frame — not fifty. → S2.2, S2.4
- **U3.** (consumer) I press Ctrl+Z. Every field the transaction touched goes back to the value it had, and nothing else moves. → S2.5
- **U4.** (consumer) I save `dataset.toJSON()`, reload, and `Dataset.fromJSON(doc)` gives me the same dataset — byte for byte. → S2.6
- **U5.** (consumer building a sync adapter) I subscribe to `change` and see `{ store, id, field, from, to }` for every edit. I can post that delta to a server without re-reading the dataset. → S2.2
- **U6.** (consumer) I hand `dataset.apply(changeSet)` a delta from my server. Bad rows come back in a rejection report; the good rows still land. → S2.6
- **U7.** (reviewer) I run `pnpm gate` on `.slice` = `S2` and read four lines, each naming an acceptance box from `plans/03` and each backed by a test that actually ran. → S2.7
- **U8.** (maintainer) I read `docs/01-invariant-guard-matrix.md`. Every row that says `AUTO` for S2's rules has a rule file and a failing fixture behind it. → S2.7

---

## 2. Decisions

Each states the alternative it beat and, where one exists, the finding it closes.

### D-S2-1 — `data/` gains a `time/` import edge

`plans/01` §1's diagram draws `DATA --> MODEL` and no more. Two things in this slice cross that line:

- **Serialization.** `toJSON()` writes instants as ISO-8601 (`plans/02` §6); `fromJSON()` reads them back. `new Date(i).toISOString()` is `Date` use, banned outside `time/` by I10/B2. `time/instant.ts` already exports `toISO` for exactly this.
- **Mutation-time input reading.** `dataset.entries.add({ start: '2026-09-01', end: '2026-09-08' })` takes an `EntryInput`. Resolving a Plain string needs the dataset zone and the DST fold/gap policy; advancing a date-only `end` by one day is zone-aware arithmetic. Both are `time/input.ts`'s job already (`toInstant`, `toEndInstant`).

**The edge is added:** `DATA --> TIME` in `plans/01` §1, and `forbid('data-boundary', 'data', ['time', 'model'])` in `.dependency-cruiser.cjs`. `time/` sits below `data/` in the pure stack and `scheduling/` already has the same arrow; nothing about the layering changes, only the drawing catches up with what `data/` now does.

Rejected: leaving `data/` model-only and keeping both jobs in `api/`. It splits one contract across two layers — `docs/01` already scopes `no-derived-in-json` to `src/data/serialization/**`, a directory that would then not exist — and it forces `api/` to re-read every mutation before delegating, which is a second reading path beside the store's own.

Rejected: a file-level exemption (`data/serialization/**` may import `time/`, the rest may not). dependency-cruiser expresses it, but the second consumer (input reading, in `entry-store.ts`) arrives in the same slice, so the exemption would be widened before it was a week old.

### D-S2-2 — `Dataset.entries` becomes a store view; `readEntries` moves to `data/`

Call sites first, per CLAUDE.md. `plans/02` §2 is published as:

```ts
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.add({ id: 't3', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.remove('t3');
```

"the dataset's entries — update t2" reads true. So `dataset.entries` is the **collection**, not a snapshot array, and `model/dataset.ts`'s `readonly entries: readonly Entry[]` is what moves:

```ts
// model/ — types only
export interface EntryStoreView {
  /** The committed snapshot — see D-S2-3 for its identity rule and D-S2-21 for what it does
   *  *not* show while a transaction is open. */
  snapshot(): readonly Entry[];
  get(id: EntryId): Entry | undefined;
  has(id: EntryId): boolean;
  readonly size: number;
}

export interface Dataset {
  readonly entries: EntryStoreView;
  readonly timeZone: string;
}
```

`data/`'s `EntryStore` extends the view with `add`/`update`/`remove`. The three read call sites in the tree today become `dataset.entries.snapshot()`: `Viewport.bind`'s `ScaleBinding`, `GanttShell.render`'s `LayoutInput`, and `GanttShell.reveal`'s index scan. `LayoutInput.entries` stays `readonly Entry[]` — `layout/` takes a snapshot and has no interest in a store.

`api/entry-input.ts`'s `readEntries` moves to `data/entry-reader.ts` unchanged. It is the store's own reading now: construction and `entries.add()` must read an `EntryInput` the same way, and the one place that happens is inside the store.

Rejected: `dataset.entryStore.add(…)` beside `dataset.entries: readonly Entry[]`. Two names for one collection — check 4 of the naming test, and the failure #7 records verbatim.

Rejected: an `EntryStore` that is also array-like (`Symbol.iterator`, `length`, index access). It reads as an array at some call sites and as a store at others, and the two never agree on what `entries[0]` means after a remove.

### D-S2-3 — The snapshot array is rebuilt once per commit, not once per read

`snapshot()` returns a cached `readonly Entry[]`. Its identity changes only when a transaction commits. Two things depend on that:

- `GanttShell.render()` calls it on every frame. A fresh array per render is an allocation on the cold path for no reason, and it defeats `ScaleBinding`'s reference comparison.
- "did the data change?" becomes an identity check, which is what `BoundValue`'s equality half already expects (D-S1.5-4).

Insertion order is the snapshot's order, and it is stable across updates. `toJSON()` reads the same order, which is half of what makes it byte-stable (D-S2-12).

### D-S2-4 — Signals own derived state inside `data/`; the event bus owns delta delivery

`data/reactivity.ts` is the only file that imports `alien-signals` (B7; the `require-invariant-header` entry in `docs/02` §3.8 already names the file and its header sentence). Its consumers in S2 are all inside `data/`:

| Consumer | Primitive | Why not plain code |
|---|---|---|
| store revision | `signal` | one write per commit; every derived value below invalidates from it |
| `byId`, `byParent` indexes | `computed` | rebuilt on read after a structural change, not on every mutation inside a transaction |
| the `snapshot()` array | `computed` | D-S2-3's cached array, invalidated by the same revision |

`dataset.on('change')` is **not** an effect. An effect carries no payload, and the payload — the `ChangeSet` — is the entire contract (D7, principle 4). It is a typed `EventBus` subscription. Keeping the two jobs separate is what stops the codebase growing a second reactivity mechanism (#1's R4): signals answer *what is the current derived value*, the bus answers *what just changed*.

Instance-scoped, no module-level state (I2). `no-module-level-state` (`docs/02` §3.4) lands in this slice to hold that.

### D-S2-5 — `EventBus` moves from `view/` to `data/`

`view/event-bus.ts`'s own header defers the call: *"a bus shared with a future Dataset event would be a third runtime carve-out in a module specified as types-only. The step that actually needs sharing makes that call, with the caller in front of it (D-S1.8-4)."* The caller is here.

`model/` is still not the answer — it is types-only, and `model-is-types-only` lands in this slice to enforce it. `data/` is: it is pure, it is DOM-free, `view/ --> data/` is an existing edge in the layer map, and `data/` is where the `change` event's payload is built.

`EventBus<TEvents>` moves to `data/event-bus.ts` verbatim. `GanttEventMap` stays in `view/` (view events); `DatasetEventMap` is new in `data/`:

```ts
export interface DatasetEventMap {
  change: { changeSet: ChangeSet };
}
```

One event, and it fires — `scheduleDiagnostics` is S3's, and declaring it now would be the I11 defect the map's own S1.8 comment warns about.

### D-S2-6 — The resolve hook ships in S2; the public way to claim it ships in S3

CLAUDE.md: *"The resolve hook is the identity function when no scheduling plugin is installed, so this is not conditioned on scheduling being present — the shape holds either way."* So `data/` must call it from day one, or S3 adds a second commit path.

```ts
// data/resolve-hook.ts
export interface ProposalResolutionRequest {
  entries: readonly Entry[];
  proposed: ReadonlyMap<EntryId, EntryEdit>;
}
export interface ProposalResolution {
  patch: readonly FieldPatch[];
  diagnostics: readonly Diagnostic[];
}
export type ProposalResolver = (request: ProposalResolutionRequest) => ProposalResolution;

export const identityResolver: ProposalResolver = () => EMPTY_RESOLUTION;
```

`DatasetData` holds one `#resolveProposal: ProposalResolver`, assigned once at construction, read at exactly one call site in the commit path. There is no `if (plugin)` to remove later because there is nothing to branch on. The **default** is `spanRollupResolver` (D-S2-22), not `identityResolver`; only the default *value* differs, and the commit path is byte-identical either way. `identityResolver` stays exported as the "no cascade, ever" baseline the tests contrast against.

**What S2 does not ship:** `DatasetOptions.plugins`, `DatasetPluginContext`, `edits.setResolver`, `ProposalResolverConflictError`. Those are #15's design and they land in S3 with the plugin that uses them. An option a consumer cannot fill is the dishonest surface I11 exists to catch, and `no-not-implemented` (B8) lands in this slice.

**How it is tested without a public claim:** `DatasetDataOptions.resolveProposal` is internal (`data/` is unreachable through the `exports` map). A test injects a resolver that patches a second entry and asserts the patch lands in the same changeset with `origin: 'engine'` and reverts in one undo step. That is I7's shape, proven now, with the engine arriving in S3 to fill it.

Rejected: no hook at all until S3. The commit path would then be written twice, and the second writing is the one that has to keep undo atomic.

### D-S2-7 — `StoreName` is `'entries'` in S2, and `ChangeSet` is a discriminated union on it

`plans/01` §6 declares `added: Array<{ store: StoreName; entity: unknown }>`. `unknown` was right while `StoreName` was open-ended. With `'entries'` as the only arm, it is a typed union today and stays extensible:

```ts
export type StoreName = 'entries';                     // S3 adds `plugin:${string}/${string}`

export type EntityAdded  = { store: 'entries'; entity: Entry };
export type EntityRemoved = { store: 'entries'; entity: Entry };
export type FieldUpdated = { store: 'entries'; id: EntryId; field: EntryField; from: unknown; to: unknown };
```

A consumer narrows on `store` and gets `Entry`, not `unknown`. When S3 adds the plugin arm, `unknown` comes back for that arm only — where it is honest, because core does not know the plugin's entity shape.

`from`/`to` stay `unknown`: `field` is a union over `Entry`'s own keys, and typing the pair against it needs a mapped type that reads worse than the cast a consumer writes once. Recorded as a deliberate stop, not an oversight.

**A field whose `from` equals its `to` is not recorded.** "Equals" is decided per field, because one rule cannot serve all of them:

| Field(s) | Comparison | Why |
|---|---|---|
| `name`, `kind`, `parentId`, `progress` | `===` | primitives |
| `start`, `end` | `===` | `Instant` is `number & { __brand }` — exact epoch-ms equality, and *not* date arithmetic, so I10 is not implicated. The mutator reads the loose input through `time/`'s `toInstant`/`toEndInstant` **first**, then compares two Instants; comparing a raw `'2026-09-08'` against a stored `Instant` is the bug this ordering makes impossible. |
| `segments` | element-wise on `start`/`end` | our own type, so this is not walking consumer data. A resize gesture (S4) rebuilds the array every frame; `===` would record a change on every commit that changed nothing. |
| `meta` | `===` only | opaque and consumer-owned (D-S2-12). Deep comparison would be the library walking data it does not understand. |

`meta`'s reference-only rule has one consequence worth stating rather than discovering: **`meta` is exempt from `apply`'s `'stale-from'` check** (D-S2-11). An incoming `from` for `meta` was parsed from JSON and can never be reference-equal to the stored value, so a staleness check on it would reject every remote `meta` write. A sync adapter therefore gets last-write-wins on `meta` and optimistic-concurrency detection on every other field. Deliberate stop, same as `unknown` above.

Without this rule a no-op edit costs a full frame: a changeset is built, `change` fires, the shell pushes a **new array identity** into `ScaleBinding.entries`, `BoundValue`'s equality half (D-S1.5-4) sees a new reference, `fitDataset` re-resolves and a frame renders — defeating one layer up the churn D-S1.5-4 exists to prevent. It also keeps no-op edits off the undo stack, which is what makes U3's "nothing else moves" true for an inline editor that writes its row back on blur.

This refines `plans/01` §6 and is one of the spec edits in §7.

### D-S2-8 — Nested transactions join the outer one; one commit, one changeset

```ts
dataset.transaction(() => {
  renameAndReschedule(dataset);   // this helper opens its own transaction
});
```

The inner call runs its body and returns; only the outermost commits. Any other rule makes a helper that wraps its own body uncallable from inside a transaction — the common case, and the one auto-wrap exists to serve (`plans/02` §2: "Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path").

Rejected: throwing on a nested call. It turns every helper into a two-variant function (`doX` and `doXInTransaction`), which is a second code path wearing a different hat.

An empty transaction — one whose body changed nothing, or whose only change resolved to the same value — commits nothing: no changeset, no event, no undo entry.

**`transaction()` returns whatever its body returns** — `transaction<T>(body: () => T): T` — so it composes (`const id = dataset.transaction(() => createPhase(dataset))`). It does **not** return the changeset. `on('change')` is the single delta channel, by construction rather than by documentation.

The reason is decisive rather than stylistic: a changeset return could never be a complete delta feed anyway. Auto-wrapped single mutations do not go through `transaction()` at all — `dataset.entries.update(…)` returns an `Entry` — so a caller reading a return value is already missing every non-transactional edit. Returning `ChangeSet | undefined` would additionally overload `undefined` across two unrelated cases ("nothing changed" and "your edits joined an outer transaction"), and a caller that treated it as the delta feed would silently drop every edit made by a helper called from inside a transaction — the exact shape this decision blesses.

Rejected: a discriminated `TransactionOutcome`. Every call site pays for a value almost none of them read. Rejected: returning `ChangeSet | undefined` and documenting the two `undefined` cases. Documentation is not one of the automatic answers §4 promises. If a caller for "did this commit?" ever appears, it comes back as its own named member, not as an overloaded return.

### D-S2-9 — Mutating from inside a `change` handler throws

`MutationDuringNotificationError` (`code: 'mutation-during-notification'`). A handler that mutates re-enters the commit path while the notification is still fanning out, and every handler after it receives a changeset that no longer describes the dataset. The sanctioned pattern is to schedule the follow-up outside the notification.

Rejected: queueing the re-entrant mutation and committing it after the fan-out. It works, and it makes "one gesture, one transaction, one undo step" (I6, D10) quietly false — the user's single edit becomes two undo entries for a reason nothing on screen explains.

Note the case this does **not** cover: an edit made *inside a transaction body* by a helper the body called is not a re-entrant notification, it is D-S2-8's ordinary nesting, and it joins the same changeset. `autoGroup` (S5) is that shape, which is why it can promise "in the same undo step".

### D-S2-10 — Validation is at the mutation boundary, and every rejection is a typed error

The store validates before it writes. Nothing half-applies.

| Condition | Error | Code |
|---|---|---|
| `add` with an id already in the store | `DuplicateEntryIdError` | `duplicate-entry-id` |
| `update`/`remove` of an unknown id | `EntryNotFoundError` | `entry-not-found` |
| `parentId` naming an entry the store has no entry for | `EntryNotFoundError` | `entry-not-found` |
| `parentId` making a cycle (including self-parenting) | `ParentCycleError` | `parent-cycle` |
| a date field that names no instant | `InvalidInstantError` (existing, from `time/input.ts`) | `invalid-instant` |
| a mutation from inside a `change` handler | `MutationDuringNotificationError` | `mutation-during-notification` |
| `fromJSON` with a `schema` this build does not read | `UnsupportedSchemaError` | `unsupported-schema` |

`EntryNotFoundError`'s message currently hard-codes `reveal:` (S1.9, D-S1.9-6). It gains an `operation` argument — `new EntryNotFoundError(id, 'entries.update')` — so the message names the call the consumer actually made. `code` is unchanged, so nothing a consumer catches on moves.

**Removing an entry that has children** is legal and orphans nothing: `parentId` is validated on write, so a removed parent leaves children whose `parentId` names a missing entry. That is a real state a consumer can reach, so S2 settles it: `remove(id)` removes the entry **and every descendant**, in the same changeset. Rejected: rejecting the removal (a consumer deleting a phase has to walk the tree themselves, and doing it wrong is how orphans get made); rejected: re-parenting children to the grandparent (a silent edit nobody asked for — principle 6).

**A `kind` that derives its span** may omit `start`/`end` on input, so `EntryInput.start` and `EntryInput.end` become optional (§3). The store writes a zero-length span at the dataset's **Reference date** and stores both fields, so no layer downstream handles absence, and the rollup takes over from there (D-S2-22). The Reference date is captured once per `Dataset`, at construction, by `time/`'s `now()` — the one `Date.now()` read a Dataset performs (CONTEXT.md). An input of a **non**-deriving kind that omits either field is an `InvalidInstantError`: the field is required and `undefined` names no instant.

### D-S2-11 — `apply(changeSet)` validates and reports; it never throws mid-way

```ts
const report = dataset.apply(changeSet);   // { applied: number; rejected: readonly Rejection[] }
```

`plans/02` §6: *"`apply` validates and reports rejections rather than throwing mid-way."* A sync adapter — D7's designed-for consumer — cannot recover from a throw, because it has no way to learn which rows landed before it.

`apply` runs as one transaction and emits **one** changeset of its own, tagged `origin: 'load'`, built from what actually applied. The changeset a consumer hands in is a request; the changeset that comes back out of `on('change')` is what happened. Conflating the two is how a sync loop echoes itself forever.

**`apply` pushes nothing onto the history.** History is this session's edits; `origin: 'load'` is by definition not one. Two users on one document: the remote user renames `t2`, my adapter applies it, and my next Ctrl+Z must undo *my* last edit — not revert theirs. Worse, an undo of a remote change emits `change` with `origin: 'undo'`, which my adapter posts back, undoing that rename for everyone. `fromJSON` already says the same thing in whole-document form ("a document is a state, not a session" — D-S2-12); `apply` is the incremental form and agrees with it.

Rejected: an `apply(changeSet, { history })` option. One honest value in S2 is the I11 shape §0 Q1 rejects elsewhere; it comes back when a caller wants the other value.

`Rejection` names `{ store, id, field?, reason }` with `reason` a typed code (`'unknown-id' | 'duplicate-id' | 'stale-from' | 'invalid-value' | 'parent-cycle'`). `'stale-from'` is the interesting one: an `updated` row whose `from` does not match the current value is rejected, not applied — that is optimistic-concurrency detection for free, and it is why `from` is in the contract at all.

### D-S2-12 — `toJSON()` is byte-stable by construction, and the test asserts bytes

```json
{
  "schema": 1,
  "timeZone": "America/Chicago",
  "dateOnlyEnd": "inclusive",
  "derivedSpanKinds": ["group"],
  "entries": [
    { "id": "t1", "name": "Groundwork", "start": "2026-09-01T05:00:00.000Z", "end": "2026-09-11T05:00:00.000Z" }
  ]
}
```

Four rules make it stable: fixed key order (declaration order in the writer, never `Object.keys` over a store entity); optional keys omitted when absent, never written as `null`; entries in the store's insertion order (D-S2-3); instants as `Z`-suffixed ISO, which `fromJSON` reads as absolute so the dataset zone never re-enters the reading.

The test asserts `JSON.stringify(toJSON(fromJSON(doc)))` equals `JSON.stringify(doc)` — string equality, not `toEqual`. `plans/03`'s box says byte-stable, and a deep-equal assertion passes on a document whose keys have been reordered.

`meta` round-trips opaquely: the value is carried by reference into the document and back out, never re-serialized field by field, and its own key order is preserved because nothing walks it.

`schema: 1` is the only version this build writes. `fromJSON` accepts `1` and throws `UnsupportedSchemaError` for anything else. `plans/02` §6's "migrates older schemas forward" has no older schema to migrate yet; the migration seam is a `readers: Record<number, Reader>` map with one entry, so the second entry is a map addition rather than a rewrite.

**Keys the reader does not know are dropped**, and `plans/02` §6's *"never silently drops fields"* is corrected to *"never silently drops fields of a schema it reads"* — `schema` is the gate, and a schema-1 document carrying a key from a later build is not a schema-1 document this build can honour. Preserving unknown keys verbatim sounds more principled and is a trap: they would have to survive undo/redo too, which drags `EntryField` open to arbitrary strings and undoes D-S2-7's typed union. The rule a consumer needs is one sentence, and it belongs in `plans/02` §6 and `CONTEXT.md`: **anything of yours goes in `meta` and survives byte for byte; anything at top level belongs to the schema and is governed by it.**

**`fromJSON` goes through construction like any other `Dataset`**, so the span rollup (D-S2-22) runs on read. A document whose stored group span disagrees with its children is corrected once, on the first read, and reaches its fixed point in that one pass — so `[S2-A2]` holds from the first `toJSON` onward. The disagreement raises a dev-mode `console.warn` naming the entry: a silent correction of authored data leaves the consumer no feedback that their document was wrong.

### D-S2-13 — Undo capacity is 100 by default, and it is a `Dataset` option

```ts
new Dataset({ entries, timeZone: 'UTC', history: { capacity: 200 } });
```

"a dataset with a history capacity of 200" reads true. When the stack is full the oldest entry drops and `canUndo` goes false at the bottom.

Rejected: unbounded. A long editing session in a browser tab then holds every changeset it ever made, and the first person to notice is the one profiling a memory leak in S7.

Rejected: `undo: { capacity }`. `undo` is the verb (`dataset.undo()`); `history` is the thing that has a capacity. Two words, two jobs.

### D-S2-14 — Undo and redo replay the recorded changeset; they never re-run the resolve hook

`plans/01` §6: *"Redo replays the recorded changeset (deterministic even if engine behavior changes between versions)."* Undo applies the recorded changeset inverted (`to`→`from`, added↔removed) with `origin: 'undo'`; redo re-applies it with `origin: 'redo'`. Neither opens a resolve-hook call, so an engine that changed between library versions cannot rewrite history.

A new edit after an undo clears the redo stack. A changeset applied by undo/redo does **not** push a new undo entry — it moves the cursor.

### D-S2-15 — `view/frame-scheduler.ts` is the single rAF owner, and every render request goes through it

`plans/01` §3: *"One rAF pipeline: at most one `sync(frame)` per animation frame."* `docs/02` B10 already names the file (`src/view/frame-scheduler.ts`) and `docs/01` already marks it `PLANNED (S2)`. The caller arrives in this slice: the playground fires several mutations in one tick, each auto-wrapped into its own transaction and its own `change` event.

```ts
this.#frames.request();   // coalesced; at most one render per animation frame
this.#frames.flush();     // synchronous — construction, and tests
```

**This is not a second batcher.** `BatchedNotifier` (S1.7) coalesces one synchronous fan-out — one `setPaneSize` touching two sub-models. `FrameScheduler` coalesces one animation frame — independent signals arriving in the same tick. Different scopes, and neither subsumes the other. Stated here so a reviewer meeting both does not read R4.

**Measured migration cost at baseline:** 45 dom tests across `view/gantt-shell.test.ts` (19), `api/gantt.test.ts` (15) and `render/dom/index.test.ts` (11); ~14 call sites in the shell tests set a property and then assert DOM. Each gains one `flush()`. That is the price of the invariant, it is bounded, and it is measured rather than guessed.

Rejected: coalescing the data path only and leaving scroll/zoom synchronous. Two paths to one `sync()`, which is R4's shape and would leave B10's allowlist naming a file that only half owns the frame.

Rejected: deferring to S4 and correcting `docs/01`'s row to `PLANNED (S4)`. Honest, and wrong: the caller is in this slice, and a deferral whose caller has already arrived is just an unfixed bug with a citation.

### D-S2-16 — "Invalidate incrementally" is defined by what the changeset says changed, and it is asserted

`plans/03` §S2 says committed changesets *"invalidate layout incrementally (changed rows only), not globally"*. That is prose until it names something falsifiable. In S2's shape — flat rows, uniform height, a windowed frame — it resolves to exactly one rule:

> A changeset containing only `updated` rows never rebuilds the row-height index. A changeset containing `added` or `removed` rows does.

`FrameLayout.#heightsFor` already keys its cache on `(rowCount, rowHeight)`, so the behaviour is there; what is missing is the assertion. `FrameLayout` gains an internal `heightIndexRevision` counter, and `[S2-A3]` asserts a 500-entry field-only bulk update produces **one** `change` event, **one** `computeFrame` call, **one** `backend.sync` call, and **zero** height-index rebuilds.

Row-level incrementality below that — recomputing only the changed rows' geometry inside `computeFrame` — is not S2's, and `plans/03`'s wording is corrected to say so: `computeFrame` already emits only windowed rows, and a windowed pass over ~40 rows is not the cost that a per-row diff would pay for. S7's spike is what decides whether it ever becomes one.

### D-S2-17 — The playground gets its own harness page

`harness/data.html` + `harness/data.ts`, registered as the fifth input in `vite.config.ts` (D-S1.11-5's rule: every harness page goes in the input map).

Contents, all against the public API only: buttons for add / rename / move ±1 day / remove; undo and redo buttons wired to `canUndo`/`canRedo`; a changeset log panel printing `store · id · field · from → to` per row; an export/import pair over `toJSON()`/`fromJSON()`.

Rejected: extending `index.html`. `e2e/harness.spec.ts` asserts against its fixed entry count, and a page whose purpose is to change that count cannot share it — the same call D-S1.11-5 made.

### D-S2-18 — The rules `docs/02` §5 phases into S2 land with fixtures, and any that cannot are corrected in `docs/01`

`docs/02` §5 phases `+ B9, 3.6` into S2. Four more `PLANNED (S2)` rows in `docs/01` now have code to govern, because the files they name exist for the first time:

| Rule | Governs | Now real because |
|---|---|---|
| B7 `no-external-runtime-import` | only `src/data/reactivity.ts` imports a runtime dep | that file exists (D-S2-4) |
| B8 `no-not-implemented` | dishonest surface | S2 is the biggest surface widening (I11) |
| B9 `no-derived-in-json` | no `Row`/`Item`/`GeometryFrame` in serialization | `src/data/serialization/**` exists (D-S2-12) |
| B10 `raf-single-owner` | one rAF pipeline | `src/view/frame-scheduler.ts` exists (D-S2-15) |
| 3.4 `no-module-level-state` | I2 | `data/` is where a store cache would be tempting (D-S2-4) |
| 3.6 `no-store-mutation-outside-transaction` | every mutation through a transaction | stores exist (D-S2-2) |
| 3.7 `model-is-types-only` | `model/` stays types + brand helpers | `changeSetId` joins the allowlist (D-S2-7) |
| 3.8 `require-invariant-header` | `data/reactivity.ts`'s header sentence | that file exists |

Each lands with ≥2 valid and ≥2 invalid fixtures (`docs/04` §4). A rule S2 cannot honestly land gets its `docs/01` row corrected to `PLANNED (Sn)` naming the slice that lands it — the S1.11 D-S1.11-11 discipline, applied to this slice's own rows rather than to someone else's.

Two rows are already known to need correction regardless of what lands:

- **B3 `no-random`** allowlists `src/data/id.ts` "(id minting only)". S2 mints `ChangeSetId` from a per-instance counter, not a random source (a module-level random id generator is I2's failure). No such file is written, so the allowlist entry names a path that does not exist and should say so.
- **The dependency-count row** was fixed to two at S1.11. S2 adds no runtime dependency; the row is re-checked, not re-edited. `plans/04` §1.1's rejected list is where a third candidate goes if one is proposed — check it before proposing.

### D-S2-19 — `api-extractor` report gating lands here (I11)

`plans/04` §2: `vite-plugin-dts` + `@microsoft/api-extractor` — *"S0 (build) / S2 (report gating)"*. `docs/04` §5's pipeline diagram already draws the `api-report diff (S2+)` job and §5's required-checks list already says "Later slices add `api-report` (S2)".

The report is committed to the repo; the job fails on a diff, with the message `docs/04` §5 specifies: the fix is either "revert the surface change" or "commit the updated report and say so in the PR." S2 is the right slice for it precisely because S2 widens the surface most — a report first committed in S3 would bake in whatever S2 got wrong.

`pnpm verify` gains the `api-report` step, and `test/guards/verify-covers-ci.test.ts` is what proves the local gate and CI still agree.

### D-S2-20 — #33 closes by making the binding live, not by adding a setter

`GanttShellOptions.dataset` is already the live object. What is missing is the signal and the fan-out:

```ts
// GanttShell constructor
this.#datasetSubscription = dataset.on('change', () => {
  this.#viewportHandle.setEntries(dataset.entries.snapshot());
  this.#frames.request();
});
```

`ViewportHandle.setEntries(entries)` sits beside `setPaneSize(size)` and `setContentSize(size)` and behaves identically: it writes the binding field and fans out inside `#notifications.batch(…)`, so the scale's `fitDataset` re-resolve and the render request coalesce into one reaction. `ScaleBinding.entries` stops being a construction-time snapshot and becomes the field a bound Gantt pushes to, which is what `paneWidth` already is.

**This is not the `setEntries()` #33 warns about.** That warning is against a *public* `gantt.setEntries()` — a second reactivity mechanism beside the changeset. This is the changeset mechanism's own fan-out, on an internal binding handle, driven by exactly one subscription. `GanttShellOptions` gains no entries key and `Gantt` gains no setter.

`destroy()` unsubscribes. A destroyed Gantt holding a live subscription to a shared Dataset is a leak, and S7's mount/destroy audit is too late to find it.

### D-S2-21 — A transaction is a write set, and reads inside its body see it

The pattern is standard and has a name: the **write set** (transaction-local overlay) with **read-your-own-writes** — a read consults the pending set first and falls back to the committed store. Yjs's `doc.transact()`, Immer/Mutative drafts and TanStack DB's optimistic mutations are all one of its two variants. Nothing here is invented, and the vocabulary should not read as though it were.

Mutators buffer into `#pending` and write nothing to the store until commit (D-S2-8's step 6). `get`, `has`, `size` and `childrenOf` **read through** `#pending`, and validation runs against the same overlay. Rollback on a mid-body validation failure is discarding `#pending` — which is what makes S2.3's "a validation failure inside a transaction body leaves the store as the body found it" a property rather than a rollback engine.

Without the overlay every read-then-write helper is silently wrong inside a transaction, and D-S2-8's whole justification — that such a helper must be callable from inside one — collapses. Concretely: `add('t9')` twice in one body would not throw `DuplicateEntryIdError`, and `remove('t9'); add('t9')` in one body would throw one.

The overlay is not new state. `#pending` is the same map the changeset builder already fills (D-S2-8 step 1); this decision only says that reads consult it.

**`snapshot()` is committed-only, and its name says so.** Materializing the overlay into an array on every in-body read costs an allocation per read and destroys D-S2-3's stable identity, which `ScaleBinding`'s reference comparison depends on. So the store carries one asymmetry, stated in the doc comment rather than discovered: inside a transaction body, `get`/`has`/`size`/`childrenOf` see your writes and `snapshot()` does not.

Rejected: writing through to the store immediately and keeping inverses for rollback (Yjs's variant). Yjs can afford it because a CRDT has no validation to fail; we do, and it would buy us a rollback engine this slice has not budgeted.

Rejected: adopting `immer` or `mutative` to get drafts and inverse patches for free. `plans/04` §1.1 already rejects `immer`, and the reason holds under inspection: their delta is JSON Patch over a tree, ours is `{ store, id, field, from, to }` over normalized stores — the shape `apply`'s `'stale-from'` and the sync story need (D-S2-7, D-S2-11). We would carry the dependency and still write our own changeset.

### D-S2-22 — The default resolver is the span rollup

A group whose dates do not follow its children is not a group, so the rollup ships in S2. The seam it needs already exists and is the resolve hook: a parent's span following its child **is** a cascade — same changeset, one undo step, one frame — which is the hook's entire job description (D-S2-6, I7).

```ts
// data/span-rollup.ts — a plain function, exported
export function rollUpDerivedSpans(
  entries: readonly Entry[],
  proposed: ReadonlyMap<EntryId, EntryEdit>,
  kinds: ReadonlySet<EntryKind>,
): readonly FieldPatch[];
```

`spanRollupResolver` is that function bound to the dataset's kind set, and it is `#resolveProposal`'s default. What this buys:

- **No second mechanism.** A standalone rollup pass beside the hook would be a second cascade path, which is #1's R4, and undo atomicity would have to be re-solved for it.
- **No `if (kind === …)` in the store.** The check lives inside a seam, which is what `plans/01` §2.5 requires of every kind-dependent behaviour.
- **One implementation, two callers.** `plans/03` §S3 already specifies the scheduling engine's *"parent/`group` rollup as a second pass"*; S3's engine calls this exported function rather than reimplementing it, so the two cannot drift.
- **A real cascade to demonstrate.** S2 can show the I7 promise with a shipped feature instead of a test fixture, which is what D-S2-6's injected-resolver test was standing in for.

**Which kinds derive a span** is `DatasetOptions.derivedSpanKinds?: readonly EntryKind[]`, default `['group']`. `plans/01` §2.5 says the kind set is open, so a consumer's `'phase'` opts in here. It is an option a consumer can fill, so it is not the I11 shape §0 Q1 rejects.

**What the rollup may overwrite:** it never overwrites a field **proposed in the same transaction**, and always overwrites a **stored** one. So `update('p1', { start: X })` wins for that transaction, and the next child move rolls it away. This is the reading of `plans/01` §7's *"policy never overwrites a user-proposed field"* that a rollup can satisfy; a per-entry "manual span" opt-out is a pin flag by another name and belongs to the plugin (ADR 0002).

**Ordering and edges:** the walk is bottom-up, so nested groups compose in one pass. `parentId` cycles are already rejected before the rollup runs (D-S2-10), so it needs no cycle guard. A childless group keeps the Reference-date zero-length span. The rollup runs at construction and therefore on `fromJSON` (D-S2-12).

The rollup's rows land in the same changeset as the edit that caused them, tagged with that changeset's origin — so the harness log shows parent rows the consumer never typed, and one undo removes them with the edit. That is the cascade S2.5 §5 promises a reader will be able to watch.

---

## 3. Public surface

Net change to `api/index.ts`. Everything here is new unless the row says otherwise.

| Export | Kind | Decision |
|---|---|---|
| `DatasetOptions.history` | option | D-S2-13 |
| `DatasetOptions.derivedSpanKinds` | option | D-S2-22 |
| `Dataset.entries` — now `EntryStoreView` (`snapshot`/`get`/`has`/`size`) + `add`/`update`/`remove` | **changed** | D-S2-2, D-S2-21 |
| `EntryInput.start` / `EntryInput.end` — now optional | **changed** | D-S2-10, D-S2-22 |
| `Dataset.transaction(fn)` — returns the body's own return value, never a `ChangeSet` | method | D-S2-8 |
| `Dataset.undo()` / `redo()` / `canUndo` / `canRedo` | methods + getters | D-S2-14 |
| `Dataset.on('change')` / `off` | methods | D-S2-5 |
| `Dataset.toJSON()` / `Dataset.fromJSON(doc)` | method + static | D-S2-12 |
| `Dataset.apply(changeSet)` | method | D-S2-11 |
| `ChangeSet`, `ChangeSetId`, `StoreName`, `EntityAdded`, `EntityRemoved`, `FieldUpdated`, `ChangeOrigin` | types | D-S2-7 |
| `EntryEdit`, `EntryField` | types | D-S2-2 |
| `DatasetDocument` (the `toJSON` shape) | type | D-S2-12 |
| `ApplyReport`, `Rejection`, `RejectionReason` | types | D-S2-11 |
| `DatasetEventMap` | type | D-S2-5 |
| `DuplicateEntryIdError`, `ParentCycleError`, `MutationDuringNotificationError`, `UnsupportedSchemaError` | errors | D-S2-10 |
| `changeSetId` | brand helper | D-S2-7 |

Not added, deliberately: `DatasetOptions.plugins`, `declareStore`, `ProposalResolver` and friends (D-S2-6/7); `hierarchy.autoGroup` (Q3); a `transaction` origin option, an `apply` history option, and a per-entry manual-span opt-out (§9).

`api-extractor`'s committed report is what holds this table honest from here on (D-S2-19).

---

## 4. Foot-guns and their automatic answers

| Foot-gun | Automatic answer |
|---|---|
| Someone writes to a store outside a transaction | `no-store-mutation-outside-transaction` (3.6), plus the `TxToken` parameter only `data/transaction.ts` can mint — `typecheck` catches it before lint does |
| Someone adds a second reactivity path (`gantt.setEntries`, a `dataset.version` poll) | There is one subscription and one fan-out (D-S2-20); a second one is a review finding against #1's R4, and `GanttShellOptions` has no entries key to tempt anyone |
| A second file imports `alien-signals` | B7 allowlists exactly `src/data/reactivity.ts` |
| A second file calls `requestAnimationFrame` | B10 allowlists exactly `src/view/frame-scheduler.ts` |
| `toJSON` gains a derived field (`rowCount`, a cached span) | B9 bans `Row`/`Item`/`GeometryFrame` references and `layout/`/`view/` imports inside `src/data/serialization/**` |
| A new public type ships with nothing behind it | B8 (`no-not-implemented`) plus the `api-report` diff, which makes every surface addition a reviewed line |
| `toJSON` starts emitting keys in `Object.keys` order after a refactor | `[S2-A2]` compares strings, not objects (D-S2-12) |
| Undo restores the user's edit but not the engine's cascade | `[S2-A1]` runs with an injected non-identity resolver as well as without it (D-S2-6) |
| The changeset log in the harness is written by re-reading the dataset instead of reading the changeset | `[S2-A4]` asserts `from` **and** `to` per field; a re-read cannot produce `from` |
| A mutation inside a `change` handler half-applies | `MutationDuringNotificationError` throws before anything is written (D-S2-9) |
| A new `Entry` field ships without a comparison rule, so no-op edits on it churn a frame and an undo entry | The comparator map is `satisfies Record<EntryField, FieldComparator>` — adding a field to `Entry` fails `typecheck` until it is given one (D-S2-7) |
| A `kind === 'group'` literal appears in `data/` or `layout/` | `no-kind-literal` (`no-restricted-syntax`), scoped to the DOM-free layers: the kind set is data (`derivedSpanKinds`) read by a seam. Enforces a CLAUDE.md hard rule that has no guard today — see §7 |
| `.slice` gets bumped in the same PR as the gate | The gate script never writes `.slice`; the bump is its own reviewed commit (D-S1.11-10, unchanged) |

---

## 5. Acceptance ids

`plans/03` §S2's four boxes get ids, tagged the way S1's are (D-S1.11-1: fixed-string existence check, then the escaped pattern in each declared runner).

| Id | Box | Runner |
|---|---|---|
| `[S2-A1]` | random mutation sequences + undo-all restores byte-identical `toJSON()` | `vitest` |
| `[S2-A2]` | `fromJSON(toJSON(d))` round-trips byte-stable | `vitest` |
| `[S2-A3]` | a 500-entry bulk update in one transaction produces one changeset, one layout pass, one frame | `vitest` |
| `[S2-A4]` | the changeset log in the harness shows `from`/`to` per field for every edit | `e2e` |

`plans/00` §4's S2 → S3 condition has three clauses — *"Undo round-trips are exact (property test); JSON round-trip is byte-stable; changesets carry `from` and `to`"* — discharged by `[S2-A1]`, `[S2-A2]` and `[S2-A4]` respectively. The gate's labels say so (D-S1.11-9), and `human: []` (D-S1.11-10).

---

## 6. Step map

Seven steps, in order. Each is its own reviewable PR against a green `main`. The visible result lands at S2.4 — the earliest it can, because mutation is not visible before there is something to mutate.

| Step | Plan | Ends with |
|---|---|---|
| S2.1 | [`s2.1-stores-and-reactivity.md`](./s2.1-stores-and-reactivity.md) | `data/` holds entries; `Dataset.entries` is a store view; nothing renders differently |
| S2.2 | [`s2.2-transactions-and-changesets.md`](./s2.2-transactions-and-changesets.md) | one transaction → the resolve hook → one changeset → one `change` event |
| S2.3 | [`s2.3-mutation-api.md`](./s2.3-mutation-api.md) | `dataset.entries.add/update/remove`, typed, validating; a group's dates follow its children |
| S2.4 | [`s2.4-live-binding.md`](./s2.4-live-binding.md) | **an edit in the console moves a bar on screen** (#33 closed) |
| S2.5 | [`s2.5-undo-redo.md`](./s2.5-undo-redo.md) | undo and redo buttons in the playground; `[S2-A1]` |
| S2.6 | [`s2.6-serialization.md`](./s2.6-serialization.md) | export/import JSON in the playground; `[S2-A2]` |
| S2.7 | [`s2.7-close-the-gate.md`](./s2.7-close-the-gate.md) | `pnpm gate` prints `S2 → S3` with five ✔ |

---

## 7. Spec edits implied — landed **with** the step that makes each true

Not batched into S2.7. A spec that describes what shipped two steps ago is the defect S1.11 spent a whole step closing.

| Document | Edit | Step |
|---|---|---|
| `plans/01` §1 | the `DATA --> TIME` arrow, and the enforcement note beside it | S2.1 |
| `plans/01` §1.1 | `data/`'s directory shape gains `reactivity.ts`, `event-bus.ts`, `serialization/` | S2.1 |
| `plans/01` §6 | `ChangeSet` refined to the discriminated union and the per-field equality rule (D-S2-7); `DatasetData`'s reserved plugin stores marked S3 | S2.2 |
| `plans/01` §2.2 | `Dataset.entries` is an `EntryStoreView`, not an array (D-S2-2) | S2.1 |
| `plans/01` §11 | I7's row cites `[S2-A1]`; I2's cites `no-module-level-state` as shipped | S2.7 |
| `plans/02` §2 | `transaction()` returns the body's value (D-S2-8); `derivedSpanKinds` and `history` on `DatasetOptions`; `EntryInput.start`/`end` optional for a deriving kind, which is what makes §2's own `{ id: 'p1', name: 'Sitework', kind: 'group' }` example typecheck for the first time | S2.2, S2.3, S2.5 |
| `plans/02` §3 | `change` fires and is the only Dataset event S2 ships | S2.2 |
| `plans/02` §6 | the `schema: 1` document shape, key order, and the `readers` migration seam; "never silently drops fields" version-gated, with the `meta`-is-yours rule; `apply`'s history and `'stale-from'`/`meta` rules (D-S2-11, D-S2-12) | S2.6 |
| `plans/02` §7 | the four new typed errors | S2.3, S2.6 |
| `plans/03` §S2 | the four boxes get ids and are ticked; "invalidate incrementally" corrected to D-S2-16's falsifiable form; the stale *"replaces `GanttShellOptions.entries`"* clause corrected (that key never existed — the live half of the sentence is D-S2-20); `dataset.dependencies.*` struck from S2's mutation API, per §0 Q2 | S2.7 |
| `plans/00` §4 | the S2 → S3 row cites the three checks that discharge it | S2.7 |
| `plans/04` §2 | `fast-check` and `api-extractor` move from planned to shipped | S2.5, S2.7 |
| `docs/01` | the eight rows of D-S2-18; B3's non-existent allowlist path; I11 moves to enforced | S2.7 |
| `docs/02` §5 | the S2 row reconciled to what actually landed | S2.7 |
| `docs/03` | `.dependency-cruiser.cjs`'s `data-boundary` change | S2.1 |
| `docs/04` §4 | the new guards; §5 gains the `api-report` job | S2.7 |
| `CONTEXT.md` | new entries **Store**, **Write set**, **History**, **Origin**, **Snapshot**, **Document**, **Span rollup**; **Transaction** gains the nesting rule and the read-your-own-writes rule; **ChangeSet** gains the net-effect rule, the re-entrancy rule and the per-field equality rule; **Kind** gains `derivedSpanKinds` | each step |
| `README.md` | the mutation example from `plans/02` §2, now real | S2.4 |

---

## 8. Tests

Per-step detail is in the step files. The shape:

- **`src/data/**/*.test.ts`** — pure, Node, no DOM. The store, transactions, changesets, history and serialization are all plain data and functions; anything here that needs a DOM is a layering bug.
- **Property tests (`fast-check`, first use — `plans/04` §2 budgets it at S2)** — `[S2-A1]` over random mutation sequences, run twice: once with the identity resolver and once with an injected resolver that cascades, so I7's engine half is proven before an engine exists.
- **`src/view/gantt-shell.test.ts`, `src/api/gantt.test.ts`** — the live binding and the frame scheduler; the ~14 call sites of D-S2-15's migration.
- **`e2e/data.spec.ts`** — `[S2-A4]` against `harness/data.html`.
- **`test/guards/`** — the new lint fixtures, the extended matrix coverage, the `S2` entry in `slice-gate.test.ts`.

---

## 9. Deferred, with the caller that brings it back

| Deferred | Comes back when | Where |
|---|---|---|
| `DatasetOptions.plugins` / `setResolver` / `declareStore` / `ProposalResolverConflictError` | the first plugin claims the hook | S3, #15/#16 |
| `plugin:${id}/${name}` arm of `StoreName`; the plugin section of `toJSON()` | the first plugin store exists | S3, #16 |
| `scheduleDiagnostics` on `DatasetEventMap` | an engine produces diagnostics | S3 |
| `hierarchy: { autoGroup: true }` | the tree UI gives promotion a visible meaning | S5, `plans/02` §2 |
| A `transaction(fn, { origin })` option | `interaction/` needs to tag a gesture's transaction | S4 |
| A way to ask "did this transaction commit anything?" at the call site | a caller appears that cannot use `on('change')`; it comes back as its own named member, never as an overloaded return (D-S2-8) | whenever one does |
| An `apply(changeSet, { history })` option | a caller wants a remote delta on the undo stack (D-S2-11) | whenever one does |
| A per-entry manual-span opt-out, exempting one group from the rollup | it is a pin flag by another name, and pins are plugin-owned (ADR 0002, D-S2-22) | S3 |
| Row-level layout incrementality inside `computeFrame` | the S7 spike measures a windowed pass as a real cost | S7, D-S2-16 |
| A `Duration`-typed `EntryEdit` (moving by `days(2)` rather than by absolute dates) | a caller authors a relative edit; `plans/s1.11` §9 already records the neighbouring gap (`addDays`/`startOf` are not re-exported from `api/`) | S4 |
| `schema: 2` and the migration path | the document shape changes | whenever it does; the `readers` map is the seam (D-S2-12) |
