# #470 — one rule for a derived cell: the Rollup owns it, or the consumer owns the Field

**Reported:** 2026-09-21. **Status:** shipped in #482, merged 2026-09-22. Labels: `enhancement`, `api change`.

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
   threw standalone and landed silently inside a transaction body (Q7, carried in
   [ADR 0013's appendix](../../../docs/adr/0013-what-decides-that-a-row-derives-its-values.md)).
4. The amendment of 2026-09-11 fixed that correctly — permission reads off the thing written, never
   off the shape of the call — and in the same breath shipped `distribute`, framed as "the consumer
   naming the policy" from step 1.
5. Nobody had named one. Its first user is a harness "Set cost 500" button, written afterwards to
   exercise the key (field redesign, J29, Task 2).

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

- Remove `Field.writeToChildren` (all three declaration shapes), `FieldType.writeToChildren`
  (`field.ts:234` — `mergeField` spreads the bundle in), and the `FieldWriteToChildren` type.
- `WriteTarget` collapses to `'entry' | 'refused'`. `resolveWriteTarget` returns `'refused'` for a
  rolling-up Field on a row with children, `'entry'` otherwise. `EditRequest.writeTarget` keeps its
  name and answers the narrowed type — three readers, one verdict, unchanged (I14).
- `write-verdict.ts:17-25` records #466's ruling that the three-value answer ships because "a
  published surface cannot narrow later". This step narrows it. Rewrite that comment to say why the
  third value left, and add one line to `plans/issues/closed/466-tree-questions-on-a-pass.md`.
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
- `#mergeCoreFieldOverride` (`:243`) hard-codes the merge of `editable` alone. The comment above the
  list (`:89-92`) claims "the next key added here is the whole change", and today that is false. Make
  it true: the merge iterates `CORE_FIELD_OVERRIDABLE_KEYS`, and no key is named twice. `field.ts:137`
  ("the one key that merge accepts") reads "the keys".
- That path skips the `UnknownAggregatorError` check `#register` runs (`:233`). The override runs the
  same validation, so `{ key: 'start', rollUp: 'notAnAggregator' }` is refused at construction.
- `{ key: 'start', rollUp: 'none' }` then means: parents in this Dataset keep the dates they are
  given. Promotion and demotion follow with no code change — `rollup.ts:157` reads
  `rollingUpFields()`, so an opted-out Field is neither dropped when a row gains a child nor cleared
  when it loses its last one. The test pins both.
- The harness shows it: one page declares `start`/`end` as `rollUp: 'none'`, so a parent bar there
  moves, resizes, and keeps its own dates (step 4 gives it the gesture). A slice ends with something
  visible in `harness/`.

**4 — the parent-move rule reads the resolver, not the structure.**
`src/view/capability.ts`.

- A parent bar drag keeps translating the dated descendants below it (ADR 0013, unchanged).
- It **also** writes the grabbed row's own dates when that row owns them. Two questions, in order,
  and neither substitutes for the other:
  1. *Does this row own the Field?* `resolveWriteTarget(entry.hasChildren, field) === 'entry'`. This
     reads the Field and structure only. It sits **above** `canWrite`, because `canWrite` puts the
     consumer's `capabilities.edit` and the variant's `edit` first (`capability.ts:160-168`): a
     consumer who answers `edit: true` would make a deriving parent's cell look writable, and the
     commit would throw `DerivedFieldNotWritableError`. Today `entry.hasChildren` at `:184` shields
     that. This step replaces the shield with the resolver — it does not remove it.
  2. *May it write the Field?* `canWrite(entry, field).ok` — the same pair the leaf rule asks.
- The descendant walk (`:189`) skips a row on the same first question, not on `hasChildren`: an
  intermediate row that derives is passed over; one that owns its dates moves with the rest. A row
  the walk does not skip is then held to `mayTranslateTheDatesItHolds` as today.
- **The parent's own cell follows the leaf rule; the subtree follows the ADR 0013 translate rule;
  the gesture is one or both, never half of either.** Three rulings, 2026-09-21, follow from that:
  - *Resize.* An owning parent is an ordinary bar. The handle opens on an edge whose Field it owns and
    may write (`:121`, no code change), and the resize writes the parent alone. The subtree does not
    stretch: the decision table's "stretch an envelope — not unique" stays true for it.
  - *Mixed mode* (`start: 'none'`, `end: 'max'`). A move shifts a span, and half a span cannot
    shift. The parent writes its own dates only when both Fields answer `'entry'` and both may be
    written — the leaf rule at `:173`, unchanged. Otherwise the move refuses the whole gesture: the
    owned date would go stale, since nothing rolls an owned date back up. Resize still follows per
    edge — the handle for an owned date opens on its own.
  - *A locked descendant under an owning parent* refuses the whole gesture, as at `:195` today. The
    preview paints the whole subtree translated; a parent that moved without its child would land
    where the drag never showed.
- `moveWritesSomething` follows from the same predicates.
- So the gesture keeps one meaning at every setting: move the bar you grabbed, and what it covers. A
  consumer writes no gesture code in either mode.

**5 — docs and spec.** See the list below.

## Tests

| Step | Test | What it pins |
|---|---|---|
| 1 | `src/data/entry-store.mutation.test.ts` | A rolling-up parent's cell is refused from `update()`, inside a transaction, and from a second `update()` in the same transaction |
| 1 | `src/data/edit-request.test.ts` | `writeTarget` answers `'refused'` on a rolling-up parent and `'entry'` on a leaf, and has no third value |
| 2 | `e2e/data.spec.ts` | The Set cost button splits by leaf count, the parent's cell reads back the number asked for, and one undo restores every row |
| 3 | `src/data/fields/field-registry.test.ts` | `{ key: 'start', rollUp: 'none' }` is legal and merges onto core's declaration; an unknown aggregator name is refused; a second override of the same key still throws `DuplicateFieldKeyError` |
| 3 | `src/data/rollup.test.ts` | With `start`/`end` opted out, a parent keeps its authored dates and the Rollup writes neither. A dated leaf that gains a child keeps its dates; a parent that loses its last child keeps its dates |
| 4 | `src/view/capability.test.ts` | A parent whose dates derive: the move writes descendants only, and `capabilities: { edit: true }` does not change that. A parent that owns its dates: the move writes the parent **and** its descendants, and an intermediate owning parent moves too. A leaf: unchanged |
| 4 | `src/view/capability.test.ts` | Resize: an owning parent's handle opens and writes the parent alone; a deriving parent's handle stays closed. Mixed mode (`start: 'none'`, `end: 'max'`): the move refuses outright; the `start` handle still opens and the `end` handle stays closed (`:459`). A locked descendant under an owning parent refuses the move |
| 4 | `src/view/gesture-pipeline.test.ts` | The drag preview and the commit agree in both modes |
| 3, 4 | `e2e/` | The owning-parent harness page: drag the parent bar, the parent and its children shift; drag the end handle, only the parent's `end` changes; one undo restores every row |

## Docs and spec

- **ADR 0013** — keep the amendment's permission rule ("a Field that rolls up is read-only on a
  parent, from every direction; grouping is not permission"). Reverse its `distribute` half, and
  record why: the *Considered options* sentence is the standing answer again, and the rule in *The
  decision* above states when core writes downward at all. The parent-drag section (`:93-99`) says
  "the parent's `start`/`end` are not written" and `event.entries` is "each descendant" — both are
  true only in derived mode now. Amend with step 4's three rulings.
- **ADR 0017 and ADR 0020** — each carries a vocabulary note that says "read `distribute` as
  `writeToChildren`". Add one line: the key left the library in #470.
- **ADR 0015** — the core-Field override list grows by one key. State that `rollUp` is overridable
  and why (uniformity: a core Field and a consumer Field take one code path).
- **`plans/01` §6 and §8** — the two modes, and the sentence about a stored Field rolling up.
- **`plans/02`** — `writeToChildren` leaves the Field surface; `WriteTarget` narrows. The errors
  paragraph (`:865`) lists `WriteTarget`'s three values by name.
- **`CONTEXT.md`** — retire the write-to-children term; keep **Rollup**, **Aggregator**, **Field**.
- **#469** — closed on 2026-09-21, and not retitled: the title's premise needs `writeToChildren`,
  and step 1 deleted the key. No door can split any more. The one live ruling — `editable` does not
  reach a cascade — moved to [#473](https://github.com/freegantt/freegantt/issues/473) with its own
  evidence, because `editable` says nothing about rollup.
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
- The summary look stays structural. `variants.ts:305` picks it on `entry.hasChildren`, and an
  owning parent still has children, so it still paints as a parent. Look and ownership are two
  questions, and this issue moves only the second.

## Acceptance

`writeToChildren` is gone from the public surface and from `src/`. `{ key: 'start', rollUp: 'none' }`
is legal, and a parent then keeps the dates it is given. A parent bar drag translates descendants in
both modes, and writes the parent's own dates only when the parent owns them. A resize handle opens
on an owning parent and writes it alone. The harness shows the cost split in app code, with no tree
walk the library could have done, and one page shows an owning parent that moves and resizes. ADR 0013 records the reversal
and keeps its permission rule. `verify:full PASS`, reported from the last line of the run.
