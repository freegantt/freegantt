# #470 — one rule for a derived cell: the Rollup owns it, or the consumer owns the Field

**Reported:** 2026-09-21. **Status:** planned, not built. Labels: `enhancement`, `api change`.

## What the issue is

A Field may declare `writeToChildren`. That declaration makes a rolling-up parent's cell writable:
the value splits onto the children, and the Rollup reads the parent's cell back off them. It is a
third mode, between "the Rollup owns this cell" and "the consumer owns this Field", and no consumer
asked for it.

Two more facts sit beside it:

- A consumer **cannot** turn a core Field's rollup off. `CORE_FIELD_OVERRIDABLE_KEYS` is
  `['editable']` (`src/data/fields/field-registry.ts:146`), so `{ key: 'start', rollUp: 'none' }`
  throws `IllegalCoreFieldOverrideError`. That one list is the only thing that makes dates special in
  the Field system — `core-fields.ts` declares `start` with `rollUp: 'min'` and `end` with
  `rollUp: 'max'`, as ordinary declarations (D-S4-4).
- The parent-move rule reads **structure**, not the resolver. `entriesMovedBy`
  (`src/view/capability.ts:184`) and `moveWritesSomething` (`:205`) branch on `entry.hasChildren`.
  That agrees with "this row's dates derive" only because date rollup cannot be turned off.

## Why `writeToChildren` exists, from the record

1. ADR 0013 refused a parent's cell, and rejected distribution **as a default**: *"A distribution
   rule is a per-Field policy with no defensible default… Refusal is honest until a consumer names
   the policy."*
2. The build wired the derived arm into `entries.update()`, and the refusal also caught two of the
   library's own writes. The first fix told a consumer write from a library write by **call nesting**
   (`TransactionData.openTransactions === 1`).
3. `dataset.transaction()` is public, so a consumer reached that lever in one call: the same write
   threw standalone and landed silently inside a transaction body (Q7,
   `plans/field-redesign/BUILD-LOG.md`).
4. The amendment of 2026-09-11 fixed that correctly — permission reads off the thing written, never
   off the shape of the call — and in the same breath shipped `distribute`, framed as "the consumer
   naming the policy" from step 1.
5. Nobody had named one. Its first user is a harness "Set cost 500" button, written afterwards to
   exercise the key (BUILD-LOG J29, Task 2).

**The permission rule from step 4 stays. The policy seam that rode along on it goes.**

## The decision

**Core writes downward only where the arithmetic has exactly one answer.**

| Tree-shaped write | Inverse | Core |
|---|---|---|
| Move a parent bar (min/max under translation) | unique | writes the descendants |
| Resize a parent bar (stretch an envelope) | not unique | refused, no handle painted |
| Split a total across children | not unique | refused. The consumer owns the Field instead |

A consumer who wants to own a parent's value declares `rollUp: 'none'` (or no `rollUp`). The parent's
cell is then an ordinary cell: they write it when they choose, including from an `EditExtender` on
every child change, which joins the user's transaction and stays one undo step. **Two modes, not
three.**

## Steps

Each step ends green (`pnpm verify:full`), and each is one commit.

**1 — delete `writeToChildren` from the library.**
`src/model/field.ts`, `src/model/write-verdict.ts`, `src/data/write-rule.ts`,
`src/data/entry-store.ts`, `src/view/capability.ts`.

- Remove `Field.writeToChildren` (all three declaration shapes) and the `FieldWriteToChildren` type.
- `WriteTarget` collapses to `'entry' | 'refused'`. `resolveWriteTarget` returns `'refused'` for a
  rolling-up Field on a row with children, `'entry'` otherwise. `EditRequest.writeTarget` keeps its
  name and answers the narrowed type — three readers, one verdict, unchanged (I14).
- Remove `#splitDerivedWrites` and its call from `#updateFrom`. A write to a rolling-up parent's cell
  throws `DerivedFieldNotWritableError` from every door again.
- Remove the capability path that re-opens a parent cell for a Field that declares a policy.
- `pnpm api-report`.

**2 — the harness writes the split itself, in app code.**
`harness/data.ts`, `e2e/data.spec.ts`.

The "Set cost 500" button stays, and stops leaning on a Field key. It writes the leaves in one
transaction, weighted by leaf count, with the remainder on the last row — the same policy, in the
place that owns it. This is the step that proves the removal leaves a consumer able: the button reads
`entry.descendants()` and `dataset.transaction()`, both public, and the changeset stays one undo
step. A `leafCount` compute Field already ships (#466), so the weights need no new walk.

**3 — a consumer may turn a core Field's rollup off.**
`src/data/fields/field-registry.ts`.

- Add `rollUp` to `CORE_FIELD_OVERRIDABLE_KEYS`.
- `#mergeCoreFieldOverride` (`:243`) hard-codes the merge of `editable` alone. It must carry `rollUp`
  the same way.
- That path skips the `UnknownAggregatorError` check `#register` runs (`:233`). The override runs the
  same validation, so `{ key: 'start', rollUp: 'notAnAggregator' }` is refused at construction.
- `{ key: 'start', rollUp: 'none' }` then means: parents in this Dataset keep the dates they are
  given.

**4 — the parent-move rule reads the resolver, not the structure.**
`src/view/capability.ts`.

- A parent bar drag keeps translating the dated descendants below it (ADR 0013, unchanged).
- It **also** writes the grabbed row's own dates when that row writes its own dates — the same
  `canWrite(entry, 'start')` / `canWrite(entry, 'end')` pair the leaf rule already asks.
- `moveWritesSomething` follows from the same predicate.
- So the gesture keeps one meaning at every setting: move the bar you grabbed, and what it covers. A
  consumer writes no gesture code in either mode.

**5 — docs and spec.** See the list below.

## Tests

| Step | Test | What it pins |
|---|---|---|
| 1 | `src/data/entry-store.mutation.test.ts` | A rolling-up parent's cell is refused from `update()`, inside a transaction, and from a cascade — one error, every door |
| 1 | `src/data/edit-request.test.ts` | `writeTarget` answers `'refused'` on a rolling-up parent and `'entry'` on a leaf, and has no third value |
| 2 | `e2e/data.spec.ts` | The Set cost button splits by leaf count, the parent's cell reads back the number asked for, and one undo restores every row |
| 3 | `src/data/fields/field-registry.test.ts` | `{ key: 'start', rollUp: 'none' }` is legal and merges onto core's declaration; an unknown aggregator name is refused; a second override of the same key still throws `DuplicateFieldKeyError` |
| 3 | `src/data/rollup.test.ts` | With `start`/`end` opted out, a parent keeps its authored dates and the Rollup writes neither |
| 4 | `src/view/capability.test.ts` | A parent whose dates derive: the move writes descendants only. A parent that owns its dates: the move writes the parent **and** its descendants. A leaf: unchanged |
| 4 | `src/view/gesture-pipeline.test.ts` | The drag preview and the commit agree in both modes |

## Docs and spec

- **ADR 0013** — keep the amendment's permission rule ("a Field that rolls up is read-only on a
  parent, from every direction; grouping is not permission"). Reverse its `distribute` half, and
  record why: the *Considered options* sentence is the standing answer again, and the rule in *The
  decision* above states when core writes downward at all.
- **ADR 0015** — the core-Field override list grows by one key. State that `rollUp` is overridable
  and why (uniformity: a core Field and a consumer Field take one code path).
- **`plans/01` §6 and §8** — the two modes, and the sentence about a stored Field rolling up.
- **`plans/02`** — `writeToChildren` leaves the Field surface; `WriteTarget` narrows.
- **`CONTEXT.md`** — retire the write-to-children term; keep **Rollup**, **Aggregator**, **Field**.
- **#469** — shrinks to one ruling: `editable` does not reach a cascade. Its write-target half
  disappears, because no door can split any more.
- **`etc/freegantt.api.md`** — regenerated.

## Limits, recorded on purpose

- `rollUp` sits on the Field, so the switch is Dataset-wide. "This one summary row is manual" is
  per-row state, and per-row state is plugin-owned in this design (ADR 0002's pin flag is the
  precedent). Out of scope here.
- A parent that owns its dates may disagree with its children's envelope. That is the consumer's
  declaration, and it needs no diagnostic.
- **Undo needs no new knob.** `transaction<T>(body: () => T): T` takes no options, and
  `ChangeOrigin` is `'user' | 'undo' | 'redo'` — a write cannot be kept off the undo stack. It does
  not have to be: an `EditExtender`'s writes join the user's transaction, so a consumer who keeps a
  parent's value current on every child change still spends one undo step per user action. Writing
  from an event handler is not the alternative — `mutation-during-notification` throws.
- `start`/`end` stay date-shaped in `view/`: a bar is a span on a time axis, so the code that paints
  time knows which two Fields a bar is drawn from. `data/` keeps treating every Field the same, and
  `view/`'s permission question still goes through the one resolver (I14).

## Acceptance

`writeToChildren` is gone from the public surface and from `src/`. `{ key: 'start', rollUp: 'none' }`
is legal, and a parent then keeps the dates it is given. A parent bar drag translates descendants in
both modes, and writes the parent's own dates only when the parent owns them. The harness shows the
cost split in app code, with no tree walk the library could have done. ADR 0013 records the reversal
and keeps its permission rule. `verify:full PASS`, reported from the last line of the run.
