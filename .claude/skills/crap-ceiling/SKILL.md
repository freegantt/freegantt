---
name: crap-ceiling
description: >-
  Lowers a production function that failed check-crap without chopping it into
  one-line helpers. Use when check-crap FAILED, a function is over the CRAP or
  complexity ceiling, or an agent is about to extract-method a function only to
  drop its score. Also use to judge a helper an earlier score fix left behind.
---

# CRAP ceiling

A score under the ceiling is not proof the code got better. Nested functions
score alone and do not add to the parent. So a one-line sibling drops the
parent legally, and hides nothing but the metric. This skill stops that.

## The rules

1. Read `metric` and `threshold` from `crap.json`. Never assume the number.
2. Fix one file at a time. Run `pnpm check-crap` after each file. Do not sweep.
3. Cover before you split, when coverage alone can clear the ceiling.
4. Extract only a **phase**, a **mode**, or a **rule**. Never a key, a field, or a line.
5. Every helper you keep passes the call-site test and the deletion test.
6. Do not edit `crap.json`. A new `threshold` or `metric` is a user decision.

## 1. Read the breach

`CRAP = complexity² × (1 − coverage)³ + complexity`. At full coverage, CRAP
equals complexity. The breach line shows both numbers. Pick the move:

| Line shows                                       | Move                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| complexity ≤ `threshold`                         | Coverage alone clears it. Go to step 2. Do not split.              |
| complexity > `threshold`, or metric `complexity` | No test can clear it. Go to step 3. Then cover what is still over. |

Preview a function's complexity before and after an edit, with no coverage
run. The command lists every function over the number you pass:

```bash
node scripts/check-crap.mjs --metric complexity --threshold <n>
```

## 2. Cover at the interface

Write tests that drive the function the way a caller does. Assert on what the
caller can see. Do not reach into a private helper to move a score. Do not
write tests for a helper you plan to delete.

Run `pnpm check-crap`. If the function is under the ceiling, stop.

## 3. Extract a phase, a mode, or a rule

Name the job in one sentence. It must be one of these:

- **Phase**: a step in a pipeline. The parent reads as an ordered list.
  `parentRowsToApply(rows)`, then `fieldRowsToApply(rows)`, then
  `cascadeDeletions(ids)`.
- **Mode**: one of two walks. `if (source.tree) return treeRows(...)`, else
  `return flatRows(...)`.
- **Rule**: one decision that many call sites use. The `??` chain lives in one
  function. The keys stay at the call site.

Then test the helper:

1. **Call-site test**: write the call with real arguments. Read it aloud. Keep
   the name only if the sentence is true. Use the `naming` skill.
2. **Deletion test**: delete the helper in your head. Does the complexity come
   back in many callers, or as a whole phase? Keep it. Does it come back in
   one place only, as one `??`, `try`, or map read? Inline it.

Run `pnpm check-crap`. If the parent is still over, the seam is wrong. Fold
more branches into the same rule or phase. Do not add another one-liner.

Count before you extract. A closure inside the parent also scores alone. So a
listener body in a constructor costs the constructor nothing.

## 4. Rejected shapes

Each rejected shape has a target. Do the target.

### One helper per key

The same merge — this input, then the default, then a fallback — split once per
field. The score drops. A reader who wants the merge order opens six functions.

```ts
// Rejected: one helper per key, each restating the merge in its own comment.
function columnHeader(input, field) {
  return input.header ?? field.column?.header ?? String(field.key);
}
function columnAlign(input, field) {
  return input.align ?? field.column?.align ?? 'start';
}

// Target: one rule, one comment. The keys stay at the call site.
function columnChoice<T>(fromGantt: T | undefined, fromField: T | undefined, fallback: T): T {
  return fromGantt ?? fromField ?? fallback;
}
header: columnChoice(input.header, defaults?.header, String(field.key)),
align: columnChoice(input.align, defaults?.align, 'start'),
```

Keep a separate helper only for a key with a different decision. Flex versus
width is a different decision. Another `??` is not.

### One wrapper per table

A table from key to value is already the rule. A function per table adds a name
and a score, not a job. Read the table at the call site. If the read needs a
guard, that guard is one rule that every table shares.

```ts
// Rejected: one wrapper per table.
function gridCellDirectionOf(key: string): 1 | -1 | undefined {
  return Object.hasOwn(GRID_CELL_DIRECTION, key) ? GRID_CELL_DIRECTION[key as CellKey] : undefined;
}
function adjacentBarDirectionOf(key: string): 1 | -1 | undefined {
  /* same, other table */
}

// Target: one guarded read. Every table uses it.
function valueForKey<K extends string, V>(table: Readonly<Record<K, V>>, key: string): V | undefined {
  return Object.hasOwn(table, key) ? table[key as K] : undefined;
}
const direction = valueForKey(GRID_CELL_DIRECTION, event.key);
```

Do not drop the guard to save the helper. `table[key as K]` without it lies
about the type.

### Pass-through

A helper with one caller, whose body is one `try`, one `??`, or one call. It
fails the deletion test. Put the body back at the call site.

### A rest-bag for a constructor

A method such as `wireTheRest()` or `hydrateStartState()` that exists only to
make a constructor shorter. Construction order is the story. A list of true
calls is better than a fake phase.

- Keep an extract whose body is a real blob, such as a default backend.
- Inline an attach whose body is one listener or one call, plus its teardown.
- A helper that builds a value returns it. The constructor writes the field
  and registers the teardown, so the order stays visible.

### Extract to hide a bad name

The parent reads badly because a name is false. Rename it. Do not wrap it in a
new helper. `#onHorizontal()` steps a cell or toggles a row, so it became
`#stepCellOrToggleRow()`.

## 5. Done

- Every function in the breach sits at or under `threshold`.
- Every new helper passed both tests in step 3.
- `crap.json` has no change.
