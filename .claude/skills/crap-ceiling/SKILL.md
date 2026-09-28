---
name: crap-ceiling
description: >-
  Lowers a production function that failed check-crap without chopping it into
  one-line helpers. Use when check-crap FAILED, a function is over the CRAP or
  complexity ceiling, crap.json's threshold is breached, cyclomatic complexity
  is too high, or an agent is about to extract-method a function to drop its
  score. Read the threshold from crap.json — never assume the number.
---

# CRAP ceiling

A function failed `check-crap`. The score sits over the ceiling. The ceiling is
`threshold` in `crap.json`. Read that file first. Do not hard-code the number.
The number can move.

The metric in the same file is either `crap` (complexity mixed with that
function's own coverage) or `complexity` (McCabe only). Nested functions score
on their own. They do not add to the parent. That is why a sibling helper can
drop the parent legally — and why a one-line sibling is a cheap cheat.

A score under the ceiling is not proof the code got deeper. Extract a **phase**,
a **mode**, or a **rule**. Do not extract a key, a field, or a line.

Use the `naming` skill for every new name. Use `codebase-design`'s deletion
test on every helper you add.

## 1. Read the breach

1. Open `crap.json`. Note `metric` and `threshold`.
2. Read each failing line from `check-crap`. It names the function, the score,
   and — on metric `crap` — complexity and coverage.
3. Pick the cause:

| Cause         | What the line shows                                                             | First move                                                |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Uncovered     | High complexity, low coverage, score falls under the ceiling once coverage is 1 | Pin the function at its existing interface. Do not split. |
| Over-branched | Coverage is already high, or metric is `complexity`                             | The body has too many paths. Extract a job.               |
| Both          | High complexity and low coverage                                                | Cover first. Split only what is still over after.         |

Do not edit `crap.json` to silence a breach. Changing `threshold` or `metric` is
a product decision, not a fix.

## 2. Cover at the interface

On metric `crap`, coverage is a legal way under the ceiling. Write tests that
drive the function the way a caller does. Assert on what the caller can see.

A test that exists only to move a score, and that reaches into a private helper
to do it, is score-shaped. Delete it if the public seam already pins the
behaviour.

Re-run `check-crap` after the tests. Stop if the function is under the ceiling.
The job is done.

## 3. Extract the job

The body still sits over the ceiling. Name the job in one sentence. The job is
one of three kinds:

**Phase** — a step in a pipeline. The caller already had to hold the order.
`parentRowsToApply(rows)` then `fieldRowsToApply(rows)` then
`cascadeDeletions(ids)`.

**Mode** — one of two walks. `if (source.tree) return treeRows(...)` else
`return flatRows(...)`.

**Rule** — one decision used many times. `choice(fromHere, fromThere, fallback)`
called for header, align, and the rest. The `??` chain lives in one function.
The keys stay at the call site.

Write the call site. Read it as English. Keep the helper only if the sentence
is true. Then run the **deletion test**: delete the helper in your head. If the
complexity vanishes, it was a pass-through. If it reappears across callers, or
as a whole phase you no longer see, it earns its keep.

Re-run `check-crap`. If the parent is still over the ceiling, the seam is
wrong. Fold more branches into the same rule or the same phase. Do not add a
fifth one-line helper.

## 4. What not to do

Each anti-pattern has a target beside it. Do the target.

### Extract the keys, not the rule

The same merge — this input, then the default, then a fallback — split once per
field. The metric drops. The story does not. A reader who wants the default
opens six functions.

```ts
// Rejected: one helper per field.
function headerOf(input, field) {
  return input.header ?? field.header ?? field.key;
}
function alignOf(input, field) {
  return input.align ?? field.align ?? 'start';
}

// Target: one helper for the rule. Call it per field.
function choice<T>(fromInput: T | undefined, fromField: T | undefined, fallback: T): T {
  return fromInput ?? fromField ?? fallback;
}
header: choice(input.header, field.header, field.key),
align: choice(input.align, field.align, 'start'),
```

Keep a second helper only when that field has a different decision (flex versus
width, not another `??`).

### Wrap a table in a function

A map from key to step is already the rule. A function that only reads it adds
a name and a score, not a job.

```ts
// Rejected
function directionOf(key: string): 1 | -1 | undefined {
  return DIRECTION[key as 'ArrowRight' | 'ArrowLeft'];
}

// Target: read the table at the call site.
const direction = DIRECTION[event.key as 'ArrowRight' | 'ArrowLeft'];
if (direction !== undefined) step(direction);
```

A table of moves (Home, End, Page, arrows) _is_ a rule. Keep the table. Drop
the wrapper.

### Extract a pass-through

A helper whose body is one `try`, one `??`, or one call to another function.
Deleting it does not spread complexity. It was a score cut.

```ts
// Rejected
function valueFrom(field, parent, context, fold) {
  try {
    return fold(parent, context);
  } catch (cause) {
    throw new FoldFailedError(field.key, parent.id, cause);
  }
}

// Target: the try sits at the one call site that needs it.
```

### Group leftovers so a constructor scores under the ceiling

A method named `hydrateStartState`, `wireTheRest`, or `attachEverything` that
only exists so the constructor is shorter. Construction order is the story. A
list of true calls is better than a fake phase.

Keep an extract whose body is a real blob (a default backend, a plugin
runtime). Inline the extract whose body is one listener plus teardown. Do not
replace either with a rest-bag.

### Copy the rule into every new comment

Four helpers that each restate "this input wins, then the default, then the
fallback" are four comments for one rule. One comment on the rule helper is
enough. Comments still answer the question the next call answers. They do not
narrate the split.

### Raise the ceiling or switch the metric

`crap.json` is a ratchet. Do not raise `threshold` to make a function pass. Do
not set `"metric": "complexity"` to hide an uncovered function. The back-off is
for a broken coverage run, not for a hard body.

## 5. Done

The failing functions sit at or under `threshold`. New helpers pass the
deletion test and the naming test. `crap.json` did not change unless the user
asked to move the ratchet.

Load `naming` before you keep a new name. Load `codebase-design` when the seam
itself is the question.
