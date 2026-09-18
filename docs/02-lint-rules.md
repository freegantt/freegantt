# FreeGantt — Lint Rule Specifications

Twenty-three rules enforce the spec (S2.7 correction — the original count of nineteen predates §3.3a and drifted as rules landed). **Eleven are configuration of ESLint builtins** (`no-restricted-syntax`, `no-restricted-properties`, `no-restricted-globals`, `no-restricted-imports`) scoped by directory — zero maintenance, no plugin code. **Twelve need real AST logic** and live in a local flat-config plugin. Prefer the builtin vehicle whenever it expresses the rule honestly: every custom rule is code we own, test, and debug.

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
| B3 | `no-random` | `no-restricted-properties` (`Math.random`, `crypto.randomUUID`) | Nondeterminism in pure layers | tests only — no production id minter uses randomness: `model/ids.ts`'s `changeSetId` takes a per-instance counter (S2.7 correction; the plan's original `src/data/id.ts` allowlist entry named a path that was never written) | I4 |
| B4 | `no-scroll-outside-scroll-attachment` (shipped as a custom rule — `scrollLeft`/`scrollTop`/`scrollTo` need AST-level filename exemption, past what `no-restricted-properties` alone expresses) | `eslint/rules/no-scroll-outside-scroll-attachment.cjs` | Direct scroll manipulation | `src/view/scroll-attachment.ts` | I12 |
| B5 | `no-inner-html` | `no-restricted-properties` (`innerHTML`, `outerHTML`, `insertAdjacentHTML`) + `no-restricted-syntax` on `document.write` | HTML injection paths | `src/render/dom/raw-html.ts` (the opt-in flag path) | I13 |
| B6 | `no-dom-in-pure` | `no-restricted-globals` (`document`, `window`, `navigator`, `location`, `self`, `HTMLElement`, `Node`, `Element`, `requestAnimationFrame`, `getComputedStyle`) | DOM access below the line | — (pure dirs only, no exceptions) | I1, D4 |
| B7 | `no-external-runtime-import` | `no-restricted-imports` (`alien-signals`, `temporal-polyfill`, `temporal-polyfill/*`) | Any runtime dep import | `src/data/reactivity.ts` (`alien-signals`), `src/time/zone.ts` (`temporal-polyfill`) — S2.7 correction: the plan's original text named only `alien-signals`/`reactivity.ts`; the shipped rule confines both façades | `plans/04` §1 |
| B8 | `no-not-implemented` | `no-restricted-syntax` on `ThrowStatement > NewExpression[callee.name='Error'] > Literal[value=/not.implemented|TODO|unsupported/i]` | Dishonest public surface | tests | I11 |
| B9 | `no-derived-in-json` | `eslint/rules/no-derived-in-json.cjs` — bans `Row`/`Bar`/`GeometryFrame` type references and `layout/`/`view/` imports | Derived types in serialization | — (`src/data/serialization/**` only) | authored/derived |
| B10 | `raf-single-owner` | `no-restricted-globals` (`requestAnimationFrame`, `cancelAnimationFrame`) | Multiple rAF pipelines | `src/view/frame-scheduler.ts` | `01` §3 |
| B11 | `no-restricted-imports` layer mirror | `no-restricted-imports` with per-directory `patterns` | Layer violations (fast editor feedback) | — | I1 (backstop for `03` §1) |

### dependency-cruiser removable leaves (not ESLint rules)

These live in `.dependency-cruiser.cjs` and are proved by `scripts/guard-red-test.mjs` (D-S2-23, S4):

| Rule | Module | Allowed importers | Invariant |
|---|---|---|---|
| `rollup-is-removable` | `src/data/rollup.ts` | `build-commit-change-set.ts`, `transaction.ts` | D-S4-7 — delete the file and parents keep caller-assigned values |
| ~~`autogroup-is-removable`~~ **RETIRED 2026-09-11** | ~~`src/data/hierarchy.ts`~~ | — | [ADR 0013](adr/0013-what-decides-that-a-row-derives-its-values.md) deleted `data/hierarchy.ts` itself, so the rule's guarded file no longer exists. `autoGroup` is gone, not merely unreachable. |
| `layout-boundary` | `src/layout/**` | may import `time/`, `model/` only | I1 — `layout/` never imports `data/` |

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

**Allowlist — exactly the four seams, one file each (planned paths, see the note below — three of
these files were never created):**

| Path | Seam |
|---|---|
| `src/scheduling/policy/default-policy.ts` | schedule semantics per kind |
| `src/layout/bars/produce-bars.ts` | item production per kind |
| `src/render/dom/renderer-registry.ts` | appearance per kind |
| `src/interaction/capabilities.ts` | affordances per kind |

**Message:** `kind is dispatched through a registry, never compared inline. Register behavior at the seam for this layer. (plans/01 §2.5)`

**Note:** the rule does *not* flag `entry.kind ?? 'span'` or passing `kind` to a registry lookup — only branching on its value.

**Never shipped, and its premise is now superseded.** The four seams above landed by S6 with no stored `kind` to dispatch on, and only `src/layout/bars/produce-bars.ts` exists at the path this table names: [ADR 0013](adr/0013-what-decides-that-a-row-derives-its-values.md) deleted `Entry.kind` outright, so derivation and look follow structure and registered Variants ([ADR 0018](adr/0018-a-variant-is-a-rule-not-an-id-list.md), [ADR 0022](adr/0022-core-ships-variants-and-a-variant-answers-about-itself.md)) instead of a kind comparison at any seam. This section stays as a historical record of the rule that was planned but never built.

---

### 3.3a `freegantt/no-kind-literal` — syntactic · `01` §2.5 · shipped S2.7

**Narrower cousin of §3.3, landed early.** D-S2-22's span rollup is the first kind-dependent
behaviour in `data/`, before any of §3.3's four seam files exist (S3–S6). Rather than ship §3.3's
seam-allowlist shape against seams that don't exist yet, S2.7 lands the part that is checkable today:
no file may compare a kind string literal against `.kind` at all, in `src/data/**` or `src/layout/**`
(tests exempt — fixture setup legitimately writes `{ kind: 'group' }`).

**Flags:** `BinaryExpression` (`===`/`!==`/`==`/`!=`) where one side is a `*.kind` member expression
and the other a string literal, and `switch (*.kind)` with a literal `case`.

**Allowed:** `entry.kind ?? 'span'` (reading the stored default, not branching on behavior) and, by
the same reasoning, a comparison against `'span'` specifically — treated as a shape/omission decision
(e.g. "is this the default, so can be omitted from a serialized document"), not the "different
behavior per kind" chain the rule targets. A comparison against any other kind value still trips it.

**Message:** `kind is dispatched through a lookup, never compared inline. Register behavior at the seam for this layer. (plans/01 §2.5)`

**Resolved, not by folding into §3.3.** [ADR 0013](adr/0013-what-decides-that-a-row-derives-its-values.md) deleted `Entry.kind` itself, so §3.3's seam-allowlist rule was never built — there is no stored `kind` left to compare at any seam. This rule stays registered as a general backstop against inline `.kind` dispatch in `data/` and `layout/`, but its original target (`entry.kind ?? 'span'`) no longer exists in the model.

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

### 3.6 `freegantt/no-store-mutation-outside-transaction` — type-aware · `01` §6 · shipped S2.7

**Flags:** calls to store mutator methods (`add`, `update`, `remove`, `set`, `clear`) on a receiver whose type implements the internal `MutableStore` interface, outside `src/data/entry-store.ts` and `src/data/transaction.test.ts` — corrected from the plan's original `transaction.ts`/`history.ts` guess: neither of those calls the gated methods by name in the shipped code, `entry-store.ts` is the actual internal caller (via its own `TxToken`-gated methods), and the test file legitimately drives the gate directly.

**Belt and braces:** the mutators additionally take a `TxToken` parameter that only `transaction.ts` can construct (private constructor + non-exported type), so `typecheck` catches it too. The lint rule exists for the clearer message and because the token can be threaded around by a determined caller.

**Message:** `Every mutation goes through dataset.transaction(): one scheduling pass, one changeset. (plans/01 §6, D10)`

---

### 3.7 `freegantt/model-is-types-only` — syntactic · `01` §1

**Flags:** in `src/model/**` (tests exempt), any value-producing declaration — function/class/variable — except an allowlist of id/brand helpers (`brand`, `unbrand`, `entryId`, `dependencyId`, `rowId`, `barId`, `changeSetId`) which must additionally be one-line, dependency-free identity casts, plus the BarId readers `entryIdOfBar` and `partIndexOfBar` (D-S4-25), plus the span predicate `spansTime` (ADR 0012, Q5), which must also state its whole answer in one return. Any `import` that is not `import type` is flagged.

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

### 3.10 `freegantt/no-flow-layout-rows` — syntactic · I9 · `AUTO-PARTIAL`

**Flags:** in `src/view/**` and `src/render/dom/**` (S1.8, D-S1.8-8 — the issue's original scope, `src/view/grid/**`/`src/view/timeline/**`, never existed) — reads of `offsetHeight`/`clientHeight` and calls to `getBoundingClientRect()`.

**Exempt:** `pane-layout.ts` and `pane-size-attachment.ts`, by filename. Both legitimately read `clientWidth`/`clientHeight` to measure the *pane's own box* (CONTEXT.md's "Pane size") — a different concept from *row* height. Banning that would break the synchronous first measurement `PaneLayout.measureTimelinePane()` needs.

**Residue:** this rule does not catch an assignment to `style.height` that is not sourced from a `frame.rows[i].height` expression — too fragile to express syntactically, the same AUTO-PARTIAL shape as `no-time-to-pixel-math` (§3.9). Mitigated the same way: the layer graph makes a laundered value useless (only `layout/` legitimately owns row height), so the residue is small and review-visible.

**Message:** `Both panes position rows absolutely from frame.rows. Neither measures nor computes a height. (plans/01 §4, I9)`

---

### 3.11 `freegantt/no-inline-style-outside-geometry` — syntactic · S1.10 (`plans/s1.10-theming-and-a11y/README.md` D-S1.10-6)

**Flags:** in `src/render/**` and `src/view/**` — any `node.style.<prop> = …` assignment where `<prop>` is not `transform`, `width`, or `height`.

**Allowed:** `transform`/`width`/`height` — the three properties that carry a live per-frame or per-instance number (row/bar position, grid width, header spacer height). Everything structural (`display`, `overflow`, `position`, `flexDirection`, `cursor`, colors, …) moves to the base stylesheet `ensureBaseStyles` injects (`src/view/styles.ts`).

**Scope:** expected to widen to `src/interaction/**` once gesture previews need the same per-frame allowance (§3.3) — not a gap today, just not yet applicable.

**Message:** `Structure moves to the base stylesheet; inline styles are for live per-frame/per-instance geometry only (transform/width/height). (plans/s1.10-theming-and-a11y/README.md D-S1.10-6)`

### 3.12 `freegantt/editable-has-one-reader` — syntactic · I14 · ADR 0015

**Flags:** in `src/**/*.ts` outside `src/data/fields/field-registry.ts` and outside test files — any read of an `editable` member: `field.editable`, `field['editable']`, and `const { editable } = field`.

**Allowed:** the declaration itself (`{ key: 'start', editable: 'anywhere' }` is a Property, not a read), and `field-registry.ts`, where `editableOf` resolves the boolean aliases and the absent-key default. Every other caller asks a named threshold from `src/data/write-rule.ts`: `isUserEditable(field)` for the grid — the cell editor, a bar handle, a bar move — and `isApiEditable(field)` for `entries.update()`.

**Why:** this is the check that would have caught #256. `view/capability.ts` read `field.editable === true` while `entries.update()` read nothing at all, so one key had two answers: the grid hid a handle over a write that still landed. A second reader of the raw key is how that split comes back.

**Message:** `` `Field.editable` is read in `data/fields/field-registry.ts` only (I14, ADR 0015). Ask `isUserEditable(field)` for the grid, or `isApiEditable(field)` for `entries.update()` — one key, two thresholds. ``

---

## 4. Message discipline

Every custom-rule message follows one shape: **what is wrong · what to do instead · the spec citation**. This matters more than usual here, because the primary consumer of these messages is often an agent editing the file, and a message ending in `(plans/01 §5)` sends it to the governing text instead of to a workaround.

## 5. Phasing

Rules land with the code they can govern. Rows below match the matrix statuses.

| Slice | Rules active |
|---|---|
| S0 | B1, B2, B5, B6, B11, 3.1 |
| S1 | + B4, 3.2, 3.10, 3.11 |
| S2.7 | + B7, B8, B9, B10, 3.3a, 3.4, 3.6, 3.7, 3.8 (S2.7 correction: the plan drafted these against S0/S2, before the code they govern existed to write fixtures against — `no-store-mutation-outside-transaction` needs `data/transaction.ts`, `require-invariant-header` needs its five listed files, and so on; all landed together at slice-close instead) |
| S4 | dependency-cruiser: `rollup-is-removable`, `autogroup-is-removable`, `layout-boundary` (proved by `scripts/guard-red-test.mjs`) |
| S3 | (no new ESLint rules — I6 is a test) |
| ADR 0015 | + 3.12 `editable-has-one-reader` (I14's lint half; the thresholds themselves stay tests) |

**Not yet shipped (S2.7 correction — the table above previously claimed these landed at S0, before the
code they govern existed):** B3 (no production id minter needs it — `01-invariant-guard-matrix.md`'s
I4 row), 3.3 (its four seam files don't exist before S3–S6), 3.5 `no-recursion-in-scheduling` (I3,
`scheduling/` is an empty stub until S7), 3.9 `no-allocation-in-hot-path` (I5, `interaction/` doesn't
exist before S3).

A rule scheduled for a later slice still exists in `eslint.config.js` from S0, pointed at its (empty) target directory: it costs nothing and it fires the moment the first violating file appears.
