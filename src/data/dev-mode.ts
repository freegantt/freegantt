// data/ — one home for the Vite/dev-mode flag (C15). `model/` stays types-only.

/**
 * True while **this repository** runs its own dev server or test suite. False in every build a
 * consumer installs.
 *
 * ## Read this before you gate anything on it
 *
 * `import.meta.env.DEV` is not a runtime question. Vite replaces it with a literal when the code
 * that reads it is built. The code that reads it here is *this library*, so the value is fixed when
 * this repo builds `dist/`. A consumer's own dev server never re-evaluates it. Their `vite dev` and
 * their production build both receive `false`.
 *
 * So the rule is one sentence: **never gate anything a consumer needs to see.**
 *
 * A diagnostic behind this flag is not "a warning in development". It is a warning that has been
 * deleted from the product, in a way that reads as deliberate and tests green — this repo's own
 * tests run with `DEV === true`, so the gated branch is the only branch they exercise.
 *
 * ## What it is legitimately for
 *
 * Making *our own* development stricter, at a cost we do not want to charge a consumer. The two
 * current callers are both this shape, and both would still be correct if they never ran anywhere
 * else:
 *
 * - `transaction.ts` deep-freezes a ChangeSet, so our tests catch a mutation of one. Freezing is not
 *   free, and a consumer gains no diagnostic from paying for it.
 * - `build-commit-change-set.ts` asserts an extension hook did not overwrite the body. It guards a
 *   library-internal invariant while we develop against it.
 *
 * The test is "would a consumer want this?" If yes, it must not be here. If it only sharpens our own
 * feedback loop, it belongs.
 *
 * ## It has bitten three times
 *
 * Each time, a consumer-facing report was gated and no consumer ever received one:
 * `'scale-options-ignored'` and the corrected-rollup report (both D-S5-41), and `'variant-claimed-twice'`
 * (J33, 2026-09-11, caught in review before it shipped). Each was written as "warn in dev mode",
 * which is the phrase to distrust — it describes an intent this flag cannot carry.
 *
 * The replacement is always the same: raise it through `raiseError` at `severity: 'warning'`, in
 * every build. When the concern is cost rather than noise, avoid the cost by not asking the question
 * — `produce-items.ts` stops its claim scan at the first match when no report sink is wired, instead
 * of gating the report itself. See `docs/00-guardrails-overview.md` §5.1.
 */
export function isDevMode(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
}
