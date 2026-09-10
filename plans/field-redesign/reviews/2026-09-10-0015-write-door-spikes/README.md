# ADR 0015 spikes — what the write door refuses

**Next ADR that still has decisions to make.** [0015](../../0015-write-door/README.md) has three open numbers: **19, 23, 18**. Answer 19 first, then 23. 18 is the posture of an absent `editable`. This review probes the options before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on three branches. This file is the verdict. Open a branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0015-beforechange-override`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-beforechange-override) | **19** — probe `beforeChange` first, then keep-override vs `readOnlyFields` | 38 passed | `c43fbcc` |
| [`spike/0015-core-key-declaration`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-core-key-declaration) | **23** — throw vs warn, against both 19 answers | 37 passed | `5f6910c` |
| [`spike/0015-absent-editable`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-absent-editable) | **18** — copy view / split absent / second word. Name the shorthand double-write | 37 passed | `11086b8` |

Parent re-ran the three suites on 2026-09-10 after the agents landed: **112 passed** (38 + 37 + 37).

---

## Verdict in one page

**Decision 19: `beforeChange` covers the lock on `update` and on a bar-drag commit. It does not close at no cost. The override should stay.**

The rec is not false on the call it named. `commitEntryEdits` goes through `entries.update()`, so the handler sees a drag. A plugin already vetoes there (`lockEntries`). An app author can write the same hook.

The remainder sentence is also true: they must write `beforeChange` on every Dataset to lock `start`. That is a hook for a Field fact, not for the default. The call they already write is `fields: [{ key: 'start', editable: false }]`, then `update('t1', { start })` throws `FieldNotEditableError`. After the closed ruling, that sentence is true at both doors. The rec's call is longer, uses `MutationCancelledError`, refuses the whole ChangeSet, misses `add` unless the handler also walks `added`, and leaves the grid open. Smaller inside, larger outside. That lost on 0012, 0011 and 0013.

`readOnlyFields` is a second name for `editable` and splits I14. Do not take it.

**Decision 23: if 19 keeps the override, 23 is already answered.** Construction succeeds. The declaration is a legal `editable` merge. `update('t1', { start })` throws `FieldNotEditableError`. Do not throw at construction. Do not warn at construction for that lock row.

**If 19 accepts the loss, 23 is live** and the two postures assume opposite authors of `fields`. Handwritten code wants throw. A schema mapper wants warn. One answer cannot satisfy both without a filter the library does not ship. `DuplicateFieldKeyError`'s English is false for a lock (*"declared twice / give it a different key"*). `CoreFieldCannotBeDeclaredError` (*"start already names a core field. Remove this declaration."*) is the true sentence. Warn matches 0011's value door and boots a generated `fields` array, and spends the lock: `update('t1', { start })` still writes.

**Decision 18: absent means the API may write.** Split keeps `update({ parentId })` and `update({ kind })` true. Copy does not, unless a consumer stamps `editable: true` on Fields that have no grid job. A second word on `Field` lost on the remainder call: `fields: [{ key: 'owner', editable: false, acceptsUpdate: true }]` is a lie under the closed ruling.

The shorthand double-write is named: **`FieldNamedAtTopAndInPropsError`**. `update('t1', { cost: 7, props: { cost: 8 } })` throws. Message: `entries.update: "cost" is named at the top and inside props. Name it once — at the top, or inside props.`

The 0015 README's "may shrink" sentence for 18's `kind` row is spent. 0013 kept authored `kind`. Argue 18 against a **three-row** table, and unbundle it: `parentId` and `segments` have no column; `kind` has one.

---

## 19. What replaces `{ key: 'start', editable: false }` at the data door?

**Rec does not close at no cost. Keep the override.** Branch `spike/0015-beforechange-override`. Notes: `plans/field-redesign/0015-write-door/spikes/beforechange-override/NOTES.md`.

The probe ran `beforeChange` first, as asked. Then it scored keep-override and `readOnlyFields`.

| Option | Call a person reads | Result |
|---|---|---|
| **beforeChange (rec)** | `dataset.on('beforeChange', ({ changeSet }) => fieldRowsOf(changeSet).some((row) => row.field === 'start') ? false : undefined)` then `update('t1', { start })` throws | Covers `update` and a bar-drag commit. Misses `add`. App author meets a hook. Wrong error. Grid stays open |
| **Keep override** | `fields: [{ key: 'start', editable: false }]` then `update('t1', { start })` throws `FieldNotEditableError` | **Winner.** One declaration. Grid and API agree after the ruling. Same array as `cost` |
| **`readOnlyFields`** | `readOnlyFields: ['start']` then `update('t1', { start })` throws | Lost. Second name for `editable`. I14 splits on purpose |

Rules to learn on the rec: **4** (walk `updated`; walk `added` too; return `false` or `refuse`; whole ChangeSet). Keep-override: **1**.

### Lesson for the build

Do not delete `CORE_FIELD_OVERRIDABLE_KEYS` in order to "use the door that already exists." The door covers the rec's named call and does not cover `add`. `fieldRowsOf` returns `updated` rows. `start` on an add sits on `changeSet.added[].entity`.

`refuse` must be returned. `refuse(reason)` returns `false`. A handler that calls it and returns nothing does not veto. The words are noted. The ChangeSet still commits.

`lockEntries` locks **entries by id**, not a Field. A plugin already uses this door. It is not the `#142` call.

JSON does not pick a winner. `authored` drops core keys. Both the override and the hook are restated in code on `fromJSON`.

The silent window is real and narrow. Keeping `editable`-only still lets `{ key: 'progress', editable: false }` become a core override when a later release promotes `progress`. That is the deletion's reason. Score it as a known cost of the call that already exists, not as a reason to move an app-author declaration onto an event.

If the author still picks the rec, 23 becomes live and `add({ start })` still needs its own walk.

---

## 23. Does a consumer declaration on a core key throw?

**Answered by 19 if the override stays. Live only if 19 accepts the loss.** Branch `spike/0015-core-key-declaration`. Notes: `plans/field-redesign/0015-write-door/spikes/core-key-declaration/NOTES.md`.

The **value** case stays a warning. `update('t1', { props: { start: 1 } })` warns, ignores, core wins. Do not reopen 0011.

| Fork | Call a person reads | Result |
|---|---|---|
| **19 keeps the override** | `fields: [{ key: 'start', editable: false }]` constructs. `update('t1', { start })` throws `FieldNotEditableError` | **23 is already answered.** Do not throw. Do not warn. `{ key: 'start', source }` still throws `IllegalCoreFieldOverrideError` |
| **19 accepts the loss + throw** (`DuplicateFieldKeyError`) | `fields: [{ key: 'start', editable: false }]` throws "declared twice" | False English. The consumer typed one lock, not two keys |
| **19 accepts the loss + throw** (`CoreFieldCannotBeDeclaredError`) | `fields: [{ key: 'start', editable: false }]` throws "start already names a core field. Remove this declaration." | True for handwritten `fields`. A generated schema **breaks the page at boot**. Bare `{ key: 'start' }` throws too |
| **19 accepts the loss + warn** | `fields: [{ key: 'start', editable: false }]` then `update('t1', { start })` writes | True for a generated `fields` array and for matching 0011. The typed lock is a lie |

Throw does not close the declaration/value split (throw vs 0011's warn). Warn closes that split and spends the lock.

### Lesson for the build

Decision 23 names only the lock row. HEAD also has `{ key: 'start' }` (a no-op that **passes**, `illegalCoreOverrideKey`, test `:77`) and `{ key: 'start', column }` (`IllegalCoreFieldOverrideError`). 19's deletion sends all three to one `DuplicateFieldKeyError` at `:189`. Score the three shapes. Do not treat them as one object.

`DuplicateFieldKeyError`'s comment says a core-key-alone declaration is `IllegalCoreFieldOverrideError`. That comment is **false** at HEAD.

The closed ruling names `update` only. **`add({ start })` still writes** a locked Field on the keep-override fork. That is a leftover door, not 23.

Ask which author `fields` is for before you pick throw vs warn on the accept-loss fork. The 19 call-site winner makes that fork unnecessary.

---

## 18. Does an absent `editable` also refuse `entries.update()`?

**Absent means the API may write.** Branch `spike/0015-absent-editable`. Notes: `plans/field-redesign/0015-write-door/spikes/absent-editable/NOTES.md`.

No numbered rec. The spike assumed 19 keeps the override. That matches 19's call-site winner. The throw for explicit `false` is closed either way.

| Option | Call a person reads | Result |
|---|---|---|
| **Copy the view rule** | `update('t1', { parentId: 'p' })` is true today and throws | Lost. Remainder: `editable: true` on `parentId`, a Field with **no column**. Two jobs |
| **Split absent from `false`** | `update('t1', { parentId: 'p' })` stays true. `editable: false` throws `FieldNotEditableError` | **Winner.** Today's writes keep working. Price: `boolean \| undefined` carries three meanings at the API and two at the grid |
| **Second word (`acceptsUpdate`)** | `fields: [{ key: 'owner', editable: false, acceptsUpdate: true }]` | Lost. The sentence is a lie under the closed ruling. Glossary has one Writability |

**Copy lost on these calls:**

- `update('t1', { parentId: 'p' })` — live at `harness/main.ts:181` and `harness/hierarchy.ts:254`. Not a grid question.
- `update('t1', { segments })` — #212. No column.
- `update('t1', { kind: 'milestone' })` — still a real call. Kind *has* a column, so this row is the one copy could defend as I14. Unbundle it from `parentId`.
- `update('t1', { owner: 'Sam' })` — write door closed by default.
- `add({ parentId })` vs `update({ parentId })` — add stays, update throws.
- `promoteToGroup` vs `update({ kind })` — public throws, autoGroup still writes `{ kind: 'group' }` internally (`src/data/hierarchy.ts:55`). Two paths.

Copy is smaller inside and larger outside. That shape lost on 0011, 0012 and 0013.

**Split lost on the type, not on a call.** An app author does not meet a hook, a brand, or a new Field key to reparent.

**Second word lost on the remainder call.** `editable: true, acceptsUpdate: false` opens a cell whose write throws — the Duration-cell trap. Extra Field key, extra error `FieldDoesNotAcceptUpdateError`. *One config tree per job* has no room for it.

`update({ parentId })` stayed true under split and under the second word. It died under copy. `update({ kind })` the same.

### The three-row table is three jobs

| Call | Column? | Is `update(...)` a grid question? |
|---|---|---|
| `update({ parentId })` | **No.** `core-fields.ts:100-103` | No. Reparent is hierarchy |
| `update({ segments })` | **No.** | No. Segment writes are #212 |
| `update({ kind })` | **Yes.** | Closer. Copying the view rule would close a visible Field's API to match the cell. That is I14 for this one Field. It is not I14 for `parentId` |

Do not add `followChildren`. 0013 said 21 does not gate 26.

### Double-write error name

**`FieldNamedAtTopAndInPropsError`.** Call: `update('t1', { cost: 7, props: { cost: 8 } })`. Read aloud: cost is a Field named at the top and in props. That is the 0011 sentence. It does not collide with `DuplicateFieldKeyError` (two declarations). Do not reopen whether shorthand wins.

---

## HEAD trap that the ADR under-named

Start here. The plan cites `hierarchy.ts:254`. That path is wrong.

- `src/data/hierarchy.ts` is 59 lines. It writes `{ kind: 'group' }` on promotion (`:55`). It does not call `entries.update({ parentId })`.
- The live app-author reparent calls are `harness/main.ts:181` and **`harness/hierarchy.ts:254`**.

Promotion is not `entries.update()`. If 18 copies the view rule, the public `update({ kind })` throws and autoGroup still writes `kind` internally.

The other traps the three spikes opened:

1. **`update()` does not read `editable`.** `entry-store.ts:357-359` is the exists arm only. `capability.ts:120` is the one place in `src/` that reads `Field.editable`. The comment on `field.ts:125-133` already claims I14. The comment is the claim 18 must decide, not evidence.
2. **`fieldRowsOf` does not see `add`.** The rec's walk covers `update` and a bar-drag commit. It does not cover `add` unless the handler also walks `added`.
3. **A core override never reaches the Document.** `authored` and `encodeDeclaredField` both drop core keys. `fromJSON` without re-passing `fields` loses the lock.
4. **`{ key: 'start' }` with no extra key is a no-op that passes.** Decision 23 names only the lock row.
5. **`DuplicateFieldKeyError`'s comment is false at HEAD.** A core-key-alone declaration is not `IllegalCoreFieldOverrideError`.
6. **The closed ruling names `update` only.** `add({ start })` still writes a locked Field on the keep-override fork.
7. **`capability.ts:119` does not ask for children.** A childless `'group'` is already `DERIVED` at the grid. `entries.update()` does not consult `editable` *or* derived today. Inherited from 0013.
8. **After `meta` dies, `Object.keys({ props: { cost } })` is `['props']`.** Exempt the namespace. Still walk inside.
9. **`kind` has a column; `parentId` and `segments` do not.** Do not score the three-row table as one object.
10. **Check `compute` before `editable`.** Copy-the-view-rule must not tell the consumer to set `editable: true` on `duration`.

---

## What the spikes did not re-open

- **0012.** Dates iff Segments. `durationOf` returns `Duration | undefined`. Skip dateless rows in `fitDataset`.
- **0011.** Decisions 1, 11, 22. Author has not ruled. Declared-key shorthand won the call site. Consumer values in these stores live in `props`. The value ruling (`props: { start }` is a warning) stays.
- **0013.** Decision 26. Call-site winner: a row derives when it has children. `kind` stays authored. Derived writes still throw `DerivedFieldNotWritableError`. Closed 5 and 6 stay closed.
- **#267.** Out of scope.
- **0014** decisions 9, 12, 13, 16. 16 waits on 22's ruling.
- **The `editable: false` ruling.** `FieldNotEditableError` at `update()`. Modelled. Not reopened.
- **`interactions.edit` as the replacement.** `refuted.md` item 6. View-level. `data/` may not import it.
- The combined 0011+0012 spike. Author-requested elsewhere.
- Unifying the proposed-Field predicate in `src/`.
- Implementing 0015 in `src/`. No production wiring of `update()` to `editable`. No production deletion of `CORE_FIELD_OVERRIDABLE_KEYS`.
- Adding `followChildren` to 18's table.
- Harness workarounds. No spike needed the harness.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. Use the local binary, from a worktree that has `node_modules` (do not symlink it):

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0015-write-door/spikes/<name>/vitest.workspace.ts plans/field-redesign/0015-write-door/spikes/<name>
```

Names: `beforechange-override`, `core-key-declaration`, `absent-editable`.

Parent re-ran on 2026-09-10 after the agents landed: **112 passed** (38 + 37 + 37).
