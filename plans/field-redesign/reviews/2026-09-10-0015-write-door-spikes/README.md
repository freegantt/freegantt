# ADR 0015 spikes — what the write door refuses

**Ruled in part since this page was written.** **19** and **23** closed on 2026-09-10. **18 is held** — the author refused a three-way boolean. Read [0015](../../0015-write-door/README.md). This page is the evidence, never the answer.

**Next ADR that still has decisions to make.** [0015](../../0015-write-door/README.md) has three open numbers: **19, 23, 18**. Answer 19 first, then 23. 18 is the posture of an absent `editable`. This review probes the options before the build.

**Score.** A clean, friendly public API. An option that is smaller inside and larger outside lost.

Throwaway code lives on four branches. This file is the verdict. Open a branch when you need the tests. Do not close the decisions in the ADR files. A spike reports. The author rules.

| Branch | Question | Tests | Commit |
|---|---|---|---|
| [`spike/0015-beforechange-override`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-beforechange-override) | **19** — probe `beforeChange` first, then keep-override vs `readOnlyFields` | 38 passed | `c43fbcc` |
| [`spike/0015-core-key-declaration`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-core-key-declaration) | **23** — throw vs warn, against both 19 answers | 37 passed | `5f6910c` |
| [`spike/0015-absent-editable`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-absent-editable) | **18** — copy view / split absent / second word. Name the shorthand double-write | 37 passed | `11086b8` |
| [`spike/0015-lock-doors`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-lock-doors) | **19 remainder** — which doors the keep-override lock covers | 33 passed | `4ec17e1` |

Parent re-ran the first three suites on 2026-09-10: **112 passed** (38 + 37 + 37). Parent re-ran lock-doors on 2026-09-10: **33 passed**.

---

## Verdict in one page

**Decision 19: keep the override. Publish what it locks.** `fields: [{ key: 'start', editable: false }]` then `update('t1', { start })` throws `FieldNotEditableError`. That constructor call won against `beforeChange` and `readOnlyFields`. It is **not** “this Dataset cannot write `start`.”

**Published sentence (lock-doors winner):** `editable: false` refuses a later **change** of the value (`update`, bar-drag commit, cascade onto an existing entry). Create, ingest, and history replay still write. Claim I14 with the word **change**. A child add that would widen a locked parent throws the **whole** add.

The rec is not false on the call it named. `commitEntryEdits` goes through `entries.update()`, so the handler sees a drag. A plugin already vetoes there (`lockEntries`). An app author can write the same hook. They must write it on every Dataset to lock `start`. That is a hook for a Field fact, not for the default. Longer call, `MutationCancelledError`, whole ChangeSet, grid stays open. Smaller inside, larger outside. Lost.

`readOnlyFields` is a second name for `editable` and splits I14. Do not take it.

**Decision 23: if 19 keeps the override, 23 is answered for the lock row only.** `{ key: 'start', editable: false }` constructs and merges. `{ key: 'start' }` is still a silent no-op. `{ key: 'start', column }` still throws `IllegalCoreFieldOverrideError`. Do not throw at construction for the lock row. Do not warn at construction for the lock row. Do not let “already answered” close the other two shapes.

**If 19 accepts the loss, 23 is live** and the two postures assume opposite authors of `fields`. Handwritten code wants throw. A schema mapper wants warn. One answer cannot satisfy both without a filter the library does not ship. `DuplicateFieldKeyError`'s English is false for a lock (*"declared twice / give it a different key"*). `CoreFieldCannotBeDeclaredError` (*"start already names a core field. Remove this declaration."*) is the true sentence. Warn matches 0011's value door and boots a generated `fields` array, and spends the lock: `update('t1', { start })` still writes.

**Decision 18: absent means the API may write.** Split keeps `update({ parentId })` and `update({ kind })` true. Copy throws on all three. The remainder on `parentId`/`segments` is `editable: true` with no column. The remainder on `kind` would open the Kind cell — do not call that “no grid job.” Split leaves grid no / API yes on `owner` and on `kind`, so it cannot claim I14 for absent Fields. A second word on `Field` lost on the remainder call: `fields: [{ key: 'owner', editable: false, acceptsUpdate: true }]` is a lie under the closed ruling.

The shorthand double-write is named: **`FieldNamedAtTopAndInPropsError`**. `update('t1', { cost: 7, props: { cost: 8 } })` throws. Message: `entries.update: "cost" is named at the top and inside props. Name it once — at the top, or inside props.`

The 0015 README's "may shrink" sentence for 18's `kind` row is spent. 0013 kept authored `kind`. Argue 18 against a **three-row** table, and unbundle it: `parentId` and `segments` have no column; `kind` has one.

---

## 19. What replaces `{ key: 'start', editable: false }` at the data door?

**Rec does not close at no cost. Keep the override.** Branch `spike/0015-beforechange-override`. Notes: `plans/field-redesign/0015-write-door/spikes/beforechange-override/NOTES.md`.

The probe ran `beforeChange` first, as asked. Then it scored keep-override and `readOnlyFields`.

| Option | Call a person reads | Result |
|---|---|---|
| **beforeChange (rec)** | `dataset.on('beforeChange', ({ changeSet }) => fieldRowsOf(changeSet).some((row) => row.field === 'start') ? false : undefined)` then `update('t1', { start })` throws | Covers `update` and a bar-drag commit. Misses `add`. App author meets a hook. Wrong error. Grid stays open |
| **Keep override** | `fields: [{ key: 'start', editable: false }]` then `update('t1', { start })` throws `FieldNotEditableError` | **Winner of the constructor call.** One declaration. Grid and `update()` agree after the ruling. Same array as `cost` at construction. Not a Dataset-wide lock — see lock-doors |
| **`readOnlyFields`** | `readOnlyFields: ['start']` then `update('t1', { start })` throws | Lost. Second name for `editable`. I14 splits on purpose |

Rules to learn on the rec: **4** (walk `updated`; walk `added` too; return `false` or `refuse`; whole ChangeSet). Keep-override: **1**.

### Lesson for the build

Do not delete `CORE_FIELD_OVERRIDABLE_KEYS` in order to "use the door that already exists." The door covers the rec's named call and does not cover `add`. `fieldRowsOf` returns `updated` rows. `start` on an add sits on `changeSet.added[].entity`.

`refuse` must be returned. `refuse(reason)` returns `false`. `emit` vetoes only when `result === false` (`event-bus.ts:105`). A block body `{ refuse('…'); }` returns `undefined`; the ChangeSet commits. The words sit on a discarded `RefusalNote`. No report. The first-wave spike pinned only the path that **returns** `refuse(...)`. It did not pin the silent-commit path.

`lockEntries` locks **entries by id**, not a Field. A plugin already uses this door. It is not the `#142` call.

JSON does not pick a winner. `authored` drops core keys. Both the override and the hook are restated in code on `fromJSON`.

The silent window is real and narrow. Keeping `editable`-only still lets `{ key: 'progress', editable: false }` become a core override when a later release promotes `progress`. That is the deletion's reason. Score it as a known cost of the call that already exists, not as a reason to move an app-author declaration onto an event.

If the author still picks the rec, 23 becomes live and `add({ start })` still needs its own walk.

### What the lock covers — ingest vs mutate

**Keep-override won the constructor call. It did not name the leftover doors.** Second readers scored `add`, undo/replay, and the Document as holes in “one declaration / grid and API agree.” Branch [`spike/0015-lock-doors`](https://github.com/Pawel-IT/FreeGantt/tree/spike/0015-lock-doors). Notes: `plans/field-redesign/0015-write-door/spikes/lock-doors/NOTES.md`. Parent re-ran: **33 passed**.

Three published rules. Score the call a person reads aloud, and whether a later release can close or open `add` without a break.

| Option | Call a person reads | Later break | Result |
|---|---|---|---|
| **A — update only** | `update({ start })` throws. `add({ start })` writes. Create is an unstated leftover | Closing `add` later breaks every Dataset that locked `start` and still created dated entries | Honest name for the first spike. Do not ship the leftover unnamed |
| **B — every write** | `add({ start: 1 })` throws. A Gantt whose `start` is locked cannot mint dates. Constructor ingest of dates throws, so a dated Gantt cannot boot | Opening `add` later breaks apps that omitted dates and relied on the throw | Lost on the call, not on internals |
| **C — ingest vs mutate** | `add({ start })` writes. `update({ start })` throws. “Set on create, refuse a later change.” | Closing `add` later would contradict the sentence. Do not do that | **Winner.** One sentence. No later surprise |

**Publish C.** `editable: false` refuses a later change (`update`, bar-drag commit, cascade onto an existing entry). Create, ingest, and history replay still write.

Child add is not root `add`. HEAD `hierarchy.test.ts:45-58` puts parent `start` into `updated` — that is a **change** of the parent. C throws the **whole** add. The child is absent. Parent `start` does not move. Do not write the child and skip the widen (stale rollup).

Undo/replay go through `commitChangeSet`, not `entries.update()` (`history.ts:45-54`, `replay.ts:17-24`). Restore is not a user change. A `start` row on replay writes. Name that in the same sentence.

JSON still drops a core override. `authored` and `encodeDeclaredField` drop core keys. `cost.editable` round-trips. `start.editable` does not. `fromJSON` is ingest and must pass `fields` again. The harness comment at `harness/data.ts:39-40` is false for `{ key: 'end', editable: false }`. Do not paper over it in the harness. Core must serialize a core override, or the comment must change when 0015 lands.

I14: claim it with **change**, not write. `field.ts:125` already says “may this value change.” The table word at `plans/01:926` says write. Unbundle. A leaves public `add({ start })` unasked, so it cannot claim “write.” B asks every door and loses on “cannot mint dates.”

`plans/02:477` already publishes `{ key: 'end', editable: false }` as legal. Keep-override plus C does not retire that sentence. It names what the sentence does.

**18 collision, mentioned not spiked.** If `parentId` ever carried `editable: false`, C would let `add({ parentId })` set it and refuse `update({ parentId })`. That is the add-vs-update split 18 already named. This remainder locks `start`.

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

The closed ruling names `update` only. **`add({ start })` still writes** a locked Field on the keep-override fork. Lock-doors names that write as create, not as a hole. It is not 23.

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

**Split lost on a call, not only on the type.** Grid says no and `update()` says yes for the same Field: `owner` (`split-absent.test.ts`) and `kind` (`core-fields.ts:93-98` has a column; absent `editable` is `NOT_WRITABLE` at the grid and `update({ kind })` writes). `parentId` has no column — unbundle it. Compatibility (“today’s writes keep working”) is one score. I14 (“one `canWrite`”) is the other. Split cannot claim I14 for absent Fields. An app author still does not meet a hook, a brand, or a new Field key to reparent.

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

- `src/data/hierarchy.ts` is **58** lines. It writes `{ kind: 'group' }` on promotion (`:55`). It does not call `entries.update({ parentId })`.
- The live app-author reparent calls are `harness/main.ts:181` and **`harness/hierarchy.ts:254`**.

Promotion is not `entries.update()`. If 18 copies the view rule, the public `update({ kind })` throws and autoGroup still writes `kind` internally.

The other traps the three spikes opened:

1. **`update()` does not read `editable`.** `entry-store.ts:357-359` is the exists arm only. `capability.ts:120` is the one place in `src/` that reads `Field.editable`. The comment on `field.ts:125-133` already claims I14. The comment is the claim 18 must decide, not evidence.
2. **`fieldRowsOf` does not see `add`.** The rec's walk covers `update` and a bar-drag commit. It does not cover `add` unless the handler also walks `added`.
3. **A core override never reaches the Document.** `authored` and `encodeDeclaredField` both drop core keys. `fromJSON` without re-passing `fields` loses the lock.
4. **`{ key: 'start' }` with no extra key is a no-op that passes.** Decision 23 names only the lock row.
5. **`DuplicateFieldKeyError`'s comment is false at HEAD.** A core-key-alone declaration is not `IllegalCoreFieldOverrideError`.
6. **The closed ruling names `update` only.** `add({ start })` writes a locked Field. Lock-doors publishes that as create. A child add that would widen a locked parent is a **change** of the parent (`hierarchy.test.ts:45-58`) and throws the whole add.
7. **`capability.ts:119` does not ask for children.** A childless `'group'` is already `DERIVED` at the grid. `entries.update()` does not consult `editable` *or* derived today. Inherited from 0013.
8. **After `meta` dies, `Object.keys({ props: { cost } })` is `['props']`.** Exempt the namespace. Still walk inside.
9. **`kind` has a column; `parentId` and `segments` do not.** Do not score the three-row table as one object.
10. **Check `compute` before `editable`.** Copy-the-view-rule must not tell the consumer to set `editable: true` on `duration`.
11. **`field.ts:125` says change; I14’s table says write.** Claim I14 under the lock with **change**.
12. **The harness Document comment is false for a core key.** `harness/data.ts:39-40` says the lock rides in the Document. `authored` drops core keys. Live call is `{ key: 'end', editable: false }` at `:45`.

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
- Harness workarounds. No spike needed the harness. The lock-doors notes name `harness/data.ts:39-40` as a live lie; they do not patch it.

---

## How to re-run

Root `vitest.workspace.ts` does not include `plans/`. Each spike owns a tiny workspace file. Use the local binary, from a worktree that has `node_modules` (do not symlink it):

```
./node_modules/.bin/vitest run --config vitest.config.ts --workspace plans/field-redesign/0015-write-door/spikes/<name>/vitest.workspace.ts plans/field-redesign/0015-write-door/spikes/<name>
```

Names: `beforechange-override`, `core-key-declaration`, `absent-editable`, `lock-doors`.

Parent re-ran the first three on 2026-09-10 after the agents landed: **112 passed** (38 + 37 + 37). Parent re-ran `lock-doors` on 2026-09-10: **33 passed**.
