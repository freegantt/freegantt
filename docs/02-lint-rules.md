# FreeGantt — Lint Rule Specifications

Nineteen rules enforce the spec. **Ten are configuration of ESLint builtins** (`no-restricted-syntax`, `no-restricted-properties`, `no-restricted-globals`, `no-restricted-imports`) scoped by directory — zero maintenance, no plugin code. **Nine need real AST logic** and live in a local flat-config plugin. Prefer the builtin vehicle whenever it expresses the rule honestly: every custom rule is code we own, test, and debug.

---

## 1. Where the plugin lives

```
eslint/
  plugin.js            // the 9 custom rules, exported as { rules: { … } }
  rules/<rule-id>.js
  rules/<rule-id>.test.js   // RuleTester: ≥2 valid, ≥2 invalid per rule (mandatory, see 04 §4)
eslint.config.js       // flat config: layered overrides per directory
```

Flat config, plugin inlined by object (no publishing, no `eslint-plugin-` package):

```js
// eslint.config.js
import freegantt from './eslint/plugin.js';

const PURE = ['src/model/**', 'src/time/**', 'src/data/**', 'src/scheduling/**', 'src/layout/**'];

export default [
  { plugins: { freegantt } },
  { files: ['src/**/*.ts'], languageOptions: { parserOptions: { projectService: true } },
    rules: { /* §2 + §3 baselines */ } },
  { files: PURE, rules: { 'no-restricted-globals': ['error', ...DOM_GLOBALS] } },
  // …per-directory relaxations, each with a spec citation in a comment
];
```

Type-aware rules require `projectService: true`; that is also what makes `typescript-eslint`'s recommended-type-checked set available, which we take wholesale as the baseline.

## 2. Rules expressed as builtin configuration

Each row is a `files`-scoped override. The `allowlist` column names the only paths where the construct is legal.

| # | Rule | Vehicle | Flags | Allowlist | Invariant |
|---|---|---|---|---|---|
| B1 | `no-magic-time-constants` | `no-restricted-syntax` on `Literal[value=86400000]`, `3600000`, `604800000`, `60000`, `1000` *(in binary expressions only)* | Numeric time constants used as durations | `src/time/**` | I10 |
| B2 | `no-date-outside-time` | `no-restricted-globals` (`Date`) + `no-restricted-properties` (`Date.now`, `Date.parse`, `Date.UTC`, `performance.now` for wall-clock use) | Any `Date` construction or read | `src/time/**` (the sanctioned `Intl`/`Date` boundary) | I10, determinism |
| B3 | `no-random` | `no-restricted-properties` (`Math.random`, `crypto.randomUUID`) | Nondeterminism in pure layers | `src/data/id.ts` (id minting only), tests | I4 |
| B4 | `no-scroll-outside-scroll-model` (shipped as a custom rule — `scrollLeft`/`scrollTop`/`scrollTo` need AST-level filename exemption, past what `no-restricted-properties` alone expresses) | `eslint/rules/no-scroll-outside-scroll-model.cjs` | Direct scroll manipulation | `src/view/scroll-attachment.ts` | I12 |
| B5 | `no-inner-html` | `no-restricted-properties` (`innerHTML`, `outerHTML`, `insertAdjacentHTML`) + `no-restricted-syntax` on `document.write` | HTML injection paths | `src/render/dom/raw-html.ts` (the opt-in flag path) | I13 |
| B6 | `no-dom-in-pure` | `no-restricted-globals` (`document`, `window`, `navigator`, `location`, `self`, `HTMLElement`, `Node`, `Element`, `requestAnimationFrame`, `getComputedStyle`) | DOM access below the line | — (pure dirs only, no exceptions) | I1, D4 |
| B7 | `no-external-runtime-import` | `no-restricted-imports` (`alien-signals`, plus a `patterns: ['*']` deny with a node-builtin/relative allow) | Any runtime dep import | `src/data/reactivity.ts` | `plans/04` §1 |
| B8 | `no-not-implemented` | `no-restricted-syntax` on `ThrowStatement > NewExpression[callee.name='Error'] > Literal[value=/not.implemented|TODO|unsupported/i]` | Dishonest public surface | tests | I11 |
| B9 | `no-derived-in-json` | `no-restricted-imports` of `layout/`+`view/` types, and `no-restricted-syntax` on `TSTypeReference[typeName.name=/^(Row\|Item\|GeometryFrame)$/]` | Derived types in serialization | — (`src/data/serialization/**` only) | authored/derived |
| B10 | `raf-single-owner` | `no-restricted-globals` (`requestAnimationFrame`, `cancelAnimationFrame`) | Multiple rAF pipelines | `src/view/frame-scheduler.ts` | `01` §3 |
| B11 | `no-restricted-imports` layer mirror | `no-restricted-imports` with per-directory `patterns` | Layer violations (fast editor feedback) | — | I1 (backstop for `03` §1) |

*(B11 duplicates dependency-cruiser deliberately: `depcruise` is the authority and understands the whole graph; the ESLint mirror gives the red squiggle in-editor and inside the Claude Code PostToolUse hook, where a full graph crawl would be too slow.)*

---

## 3. Custom rules

Every custom rule spec below is complete enough to implement without re-reading `plans/`. All report messages end with the governing spec citation, so a failure teaches the rule rather than just blocking.

### 3.1 `freegantt/no-instant-arithmetic` — type-aware · I10

**Flags:** binary `+ - * / %` and compound assignment where either operand's type is (or resolves through an alias to) the `Instant` brand, or `Duration`. Comparison operators (`< > <= >= === !==`) are **allowed** — ordering instants is legitimate and unambiguous.

**Also flags:** `Number(instant)`, `+instant`, `instant++`.

**Allowlist:** `src/time/**`.

**Why type-aware:** the whole point of the brand is that `entry.end - 1` and `someNumber - 1` look identical syntactically. Uses `parserServices.getTypeAtLocation` and checks for the `__brand: 'Instant'` property on the resolved type.

**Message:** `Arithmetic on Instant/Duration outside time/. Use time/ helpers (add, diff, startOf); inclusive ends go through formatEndInclusive. (plans/01 §5)`

**Subsumes** the "no inline `end - 1`" review rule from `CLAUDE.md`.

**Fixtures:** valid — `a < b`, `time/add.ts` doing math, `plainNumber - 1`. invalid — `entry.end - 1`, `start + DAY`, `end -= 1`, `+instant`.

---

### 3.2 `freegantt/no-time-to-pixel-math` — type-aware · I12 (partial)

**Flags:** any binary arithmetic where one operand is `Instant`/`Duration`-typed **and** the other is an identifier/property matching `/px|width|left|right|x|scale|zoom/i`, outside `src/time/**`. Also flags a variable declaration whose initializer divides two `Instant`s (the px-per-ms idiom).

**Allowlist:** `src/time/scale.ts`.

**Known residue** (documented in `01-invariant-guard-matrix.md` §3): a conversion laundered through an untyped intermediate. Accepted.

**Message:** `Time→pixel conversion outside TimeScale. Gantt instances bind to a TimeScale; nothing else may know px-per-ms. (plans/01 §8.2, D9)`

---

### 3.3 `freegantt/no-kind-conditional` — syntactic · `01` §2.5

**Flags:** comparisons (`===`, `!==`, `switch` discriminant, `case`) where one side is a member expression whose property is `kind` and the other is a string literal; and `switch` statements whose discriminant is `*.kind`.

**Allowlist — exactly the four seams, one file each:**

| Path | Seam |
|---|---|
| `src/scheduling/policy/default-policy.ts` | schedule semantics per kind |
| `src/layout/item-emitters.ts` | item emission per kind |
| `src/render/dom/renderer-registry.ts` | appearance per kind |
| `src/interaction/capabilities.ts` | affordances per kind |

**Message:** `kind is dispatched through a registry, never compared inline. Register behavior at the seam for this layer. (plans/01 §2.5)`

**Note:** the rule does *not* flag `entry.kind ?? 'span'` or passing `kind` to a registry lookup — only branching on its value.

---

### 3.4 `freegantt/no-module-level-state` — syntactic · I2

**Flags, at module scope in `src/**`:**
- `let` / `var` declarations
- `const` whose initializer is a `NewExpression` (`new Map()`, `new WeakMap()`, a class instance), an array/object literal that is **not** `Object.freeze`d or `as const`, or a call expression other than an allowlisted pure factory (`Symbol`, `Object.freeze`, `defineRegistry`)
- exported bindings mutated anywhere in the file

**Allowed:** frozen lookup tables, `as const` literals, primitive constants, type-only declarations, class/function declarations.

**Message:** `Module-level mutable state makes two Gantt instances share it. Own it on the instance. (plans/01 §6, I2)`

**Fixtures:** invalid — `let cache = new Map()`, `export const registry = new Map()`, `const presets = { … }` unfrozen. valid — `const PRESETS = Object.freeze({…})`, `const SNAP = 14`, `export type X = …`.

---

### 3.5 `freegantt/no-recursion-in-scheduling` — syntactic (call graph) · I3

**Two passes over `src/scheduling/**`:**
1. **Self-recursion:** a function whose body calls its own binding name (direct, or via `arguments.callee`-style aliasing).
2. **Mutual recursion within the module:** build a per-file call graph of module-scope functions; report any cycle, naming the participants in the message.

**Cross-file mutual recursion** is out of reach for a lint rule; the 5,000-link chain fixture (`test:node`) covers it empirically — a real recursive propagation path blows the stack there.

**Message:** `scheduling/ propagates via an explicit worklist; chain depth is unbounded by design. Cycle: a → b → a. (plans/01 §7, I3)`

---

### 3.6 `freegantt/no-store-mutation-outside-transaction` — type-aware · `01` §6 · `PLANNED (S2)`

**Flags:** calls to store mutator methods (`add`, `update`, `remove`, `set`, `clear`) on a receiver whose type implements the internal `MutableStore` interface, outside `src/data/transaction.ts` and `src/data/undo.ts`.

**Belt and braces:** the mutators additionally take a `TxToken` parameter that only `transaction.ts` can construct (private constructor + non-exported type), so `typecheck` catches it too. The lint rule exists for the clearer message and because the token can be threaded around by a determined caller.

**Message:** `Every mutation goes through dataset.transaction(): one scheduling pass, one changeset. (plans/01 §6, D10)`

---

### 3.7 `freegantt/model-is-types-only` — syntactic · `01` §1

**Flags:** in `src/model/**`, any value-producing declaration — function/class/variable — except an allowlist of id/brand helpers (`brand`, `unbrand`, `entryId`, `dependencyId`, `rowId`, `itemId`, `changeSetId`) which must additionally be one-line, dependency-free identity casts. Any `import` that is not `import type` is flagged.

**Message:** `model/ is types only: zero runtime beyond id/brand helpers, zero dependencies. (plans/01 §1)`

---

### 3.8 `freegantt/require-invariant-header` — syntactic · `plans/04` §3.1

**Flags:** a file listed in the rule's `headers` option whose first block comment does not contain the required invariant sentence.

**Configured headers:**

| File | Required text (substring match) |
|---|---|
| `src/scheduling/propagate.ts` | `contains no recursive call; chain depth is unbounded by design` |
| `src/render/dom/reconciler.ts` | `attribute/class/style/text diffing and keyed child recycling only` |
| `src/scheduling/schedule.ts` | `never mutates its input` |
| `src/data/reactivity.ts` | `the only file that sees the reactive dependency` |
| `src/render/dom/apply-state.ts` | `@hot-path` |

**Why a rule and not a convention:** these headers are the in-repo statement of the invariant that a reader meets *before* the code (`plans/04` §3.1 step 3). A file that loses its header loses the explanation, and the next author doesn't know the rule exists.

---

### 3.9 `freegantt/no-allocation-in-hot-path` — syntactic · I5 (partial)

**Scope:** files whose leading comment contains `@hot-path`, and functions annotated `/** @hot-path */`.

**Flags:** `NewExpression`, array/object literals, spread, template literals, `.map/.filter/.slice/.concat/Object.keys/Object.entries/JSON.*`, string concatenation with `+`, and closure creation (arrow/function expressions) inside the annotated scope.

**Allowed:** class toggles, `style.transform` assignment, numeric locals, `for` loops over pre-existing arrays.

**Message:** `Hot path is class toggles and transforms only: zero allocation, no frame rebuild. (plans/01 §3, I5)`

---

### 3.10 `freegantt/no-flow-layout-rows` — syntactic · I9 · `PLANNED (S1)`

**Flags:** in `src/view/grid/**` and `src/view/timeline/**` — reads of `offsetHeight`/`clientHeight`/`getBoundingClientRect` and any assignment to `style.height` that is not sourced from a `frame.rows[i].height` expression.

**Message:** `Both panes position rows absolutely from frame.rows. Neither measures nor computes a height. (plans/01 §4, I9)`

---

## 4. Message discipline

Every custom-rule message follows one shape: **what is wrong · what to do instead · the spec citation**. This matters more than usual here, because the primary consumer of these messages is often an agent editing the file, and a message ending in `(plans/01 §5)` sends it to the governing text instead of to a workaround.

## 5. Phasing

Rules land with the code they can govern. Rows below match the matrix statuses.

| Slice | Rules active |
|---|---|
| S0 | B1, B2, B3, B5, B6, B7, B8, B10, B11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9 |
| S1 | + B4, 3.10 |
| S2 | + B9, 3.6 |
| S4 | (no new rules — I6/I14 are tests) |

A rule scheduled for a later slice still exists in `eslint.config.js` from S0, pointed at its (empty) target directory: it costs nothing and it fires the moment the first violating file appears.
