# Branch review — #433 ThemeResolver (PR #452)

- **Branch:** `Pawel-IT/issue-433-theme-resolver`
- **Base:** `main` (the PR base resolves to `origin/main`, tip `3f15119a`)
- **Reviewed diff:** `git diff origin/main...HEAD` (merge-base `421bd9b9`). The local `main` ref is stale at `83444d5d`, so `main...HEAD` shows unrelated merged work; the two commits under review are `89effc09` and `02200a6f`.
- **Issue:** #433 — `theme: 'auto'` cannot key off a wrapping app's own dark-mode signal (Tailwind/Filament/next-themes `class="dark"` on `<html>`, Bootstrap `data-bs-theme`).
- **Reviewer:** pass 1 (this file). Pass 2 verifies each finding cold and records a verdict below.

## Verdict

The happy path is sound and well covered. Two real problems ship: **a failing `ThemeResolver` loops forever under the widened observer (F1)**, and **the widened observer is unscoped, so the Gantt's own hot-path class churn runs the consumer resolver on every mutation (F2)**. The public/glossary docs are also now stale (F3, F4), and the new harness page is missing from the build input and its loop test loads the wrong page (F5, F6).

## Findings

### F1 — A throwing or invalid resolver re-enters itself forever (high)

- **Files/lines:** `src/view/gantt-shell.ts:2144-2154` (`#resolveWithResolver`), `:2115-2129` (`#applyTheme`), `:2218-2225` (`#syncResolvedTheme`), `:2165-2172` (`#observeThemePin`).
- **Problem:** The same-value write guard at `:2121` only covers the resolver's *success* path. On failure, `#resolveWithResolver` calls `this.#container.removeAttribute('data-fg-theme')` (`:2151`), then `#applyTheme` sees `getAttribute() === null !== next` and always re-adds the fallback attribute (`:2122`). That remove+set pair is a genuine attribute change, so the widened observer (`:2169`) queues a fresh record every iteration; the next callback runs `#syncResolvedTheme` → `#applyTheme` → the same failing resolver → remove+set again. The `next === #reportedTheme` early return at `:2221` happens *after* the write that re-armed the loop, so it cannot break it.
- **Concrete failure:** `gantt.theme = () => { throw new Error('boom'); }` (or a resolver returning `'auto'`) against a real Chromium document. The observer microtask never drains; the page hangs. This is exactly the class of bug `02200a6f` fixed for the success path, but the fallback path was not covered. It is untested: `gantt-shell.test.ts`'s throwing/invalid tests never flush the MutationObserver, and `e2e/theme-resolver.spec.ts` only installs a well-behaved resolver.
- **Fix:** Make the failure path produce its answer without a DOM write that the observer treats as new. For example, compute the fallback from the container's parent (`resolveTheme` on `this.#container.parentElement ?? this.#container`) and let the existing `:2121` guard decide whether a write is needed; or track the last-written value and skip the fallback write when it is unchanged. Pin it with a browser test: flush the observer and assert the call count stays bounded with a failing resolver.

### F2 — The widened observer is unscoped, so unrelated churn runs the resolver (high, architecture)

- **Files/lines:** `src/view/gantt-shell.ts:1139-1140` (target is `ownerDocument`), `:2165-2172` (drops `attributeFilter` to `{ attributes: true, subtree: true }`).
- **Problem:** While a resolver is installed, the observer watches **every attribute under the whole document**, not the nodes that could move the resolver's answer. The Gantt's own hot path is class/attribute toggles on rows and bars for hover, selection, drag preview and pending states (`plans/01` §8). Each toggle wakes the callback, re-runs the consumer's resolver and does a full `resolveTheme` walk, even when the wrapping app's signal did not move.
- **Concrete failure:** On a 5,000-row Gantt with a resolver installed, hovering or selecting bars invokes the resolver on every `data-state`/class change. The cost is proportional to *all* attribute churn in the document, not to changes in the signal. The docblock at `:2156-2164` admits the cost but offers no bound.
- **Why this is an API gap:** The resolver is a pull function with no push seam. The consumer knows exactly when its signal changes (it just toggled `class="dark"`), but the library gives it no way to say so, so the library over-observes to compensate. A narrower seam would let the app name the node(s) or signal the change, and keep the default case free. Report, not redesign — but the branch should not ship this cost silently.
- **Fix (direction):** Either scope the observer (e.g. the container and its ancestors, or a consumer-declared element), or add a cheap notification the consumer can call when its own signal moves, so the wide watch is not the default.

### F3 — `Theme` now names two things, and the public docblock/type does not resolve the ambiguity (medium, naming/API)

- **Files/lines:** `src/view/gantt-shell.ts:182-192`, `src/api/gantt.ts:123-127`, `CONTEXT.md:535-536`.
- **Problem:** `Theme = 'auto' | 'light' | 'dark' | ThemeResolver` makes the type both *a stated value* and *a resolution strategy*. The call site `theme: () => document.documentElement.classList.contains('dark') ? 'dark' : 'light'` reads fine, and the bare function is the right shape per "call site first" (a one-field `{ resolve }` wrapper would be worse). But the glossary definition — "`Gantt.theme`'s own value — `'auto' | 'light' | 'dark'` … what a consumer states" — is now false, and any consumer that treats theme as data (persisting it, rendering a picker) must re-narrow. `harness/gantt-toolbar.ts:31-35`'s new private `ThemeChoice` is the first evidence of that cost.
- **Concrete failure:** `JSON.stringify(gantt.theme)` now serializes a function as `undefined`; a picker typed against `Theme` can be handed a resolver it cannot display. No core code breaks today (`.theme` is read only in `src/api` and `src/view`), but the public type invites it.
- **Fix:** Update `CONTEXT.md`'s **Theme** entry to say the union now includes a resolver, and either (a) keep the union but document the "value vs. strategy" split in the `Theme` docblock, or (b) keep `Theme` literal and introduce the union under its own name that the option accepts. Decide deliberately; do not leave the glossary contradicting the type.

### F4 — Consumer docs and glossary were not updated for the new public surface (medium, standards/spec)

- **Files/lines:** `docs/05-consumer-api.md:220`, `:237-253`; `CONTEXT.md:535-541`.
- **Problem:** `docs/05` still states `theme: 'auto' | 'light' | 'dark'` and its "Theme API" section still describes only three causes of `themeChange` (write, OS, ancestor pin). It says nothing about `ThemeResolver`, the widened observer, or `theme-resolver-failed`. `CONTEXT.md` has no **Theme resolver** entry. The naming skill requires the glossary entry to exist before the name (step 1), and this is a new public concept with its own returned type.
- **Concrete failure:** A consumer reading `docs/05` — the consumer API reference — cannot learn that `theme` accepts a function, how to write one, or that a bad one warns. The docs and the type disagree.
- **Fix:** Add the `ThemeResolver` paragraph to `docs/05` §"Theme API", extend the `theme` union sentence at `:220`, and add a **Theme resolver** entry to `CONTEXT.md` beside **Theme**/**Resolved theme** (cross-reference the pull-vs-push caveat from F2).

### F5 — The new harness page is not registered in the Vite build input (medium, standards)

- **Files/lines:** `vite.config.ts:4-7`, `:27-40`; `harness/theme-resolver.html` (new).
- **Problem:** `vite.config.ts` declares "Every harness page goes in the input map" and lists `index`, `scroll-sync`, `grid-scroll`, `bar-label-fit`, `zoom`, `large-dataset`, `data`, `editing`, `hierarchy`, `planner`, `plugins`, `mount-destroy`. The branch adds `harness/theme-resolver.html` (and its nav entry) but not the input entry.
- **Concrete failure:** `pnpm build` emits `dist-harness` without `theme-resolver.html`; the page exists only under the dev server the e2e run uses. (Pre-existing drift: `harness/dense-tile-grid.html` is also missing, so this is a habit the branch inherited, not invented.)
- **Fix:** Add `'theme-resolver': page('theme-resolver.html')` to the input map. Consider a guard test that every `harness/*.html` appears in the input map, since the drift is now two pages deep.

### F6 — The loop e2e test loads the wrong path (low, test correctness)

- **Files/lines:** `e2e/theme-resolver-loop.spec.ts:4`.
- **Problem:** It navigates to `/harness/zoom.html`. `vite.config.ts` sets `root: 'harness'`, so pages serve at `/zoom.html`; every other spec uses that form (`e2e/header-readability.spec.ts`). `/harness/zoom.html` does not exist. I confirmed with the dev server: it returns HTTP 200 but the body is `harness/index.html` (`<title>FreeGantt harness — generic demo</title>`) via Vite's SPA fallback.
- **Concrete failure:** The test passes only because `harness/main.ts:105` also sets `window.__gantt`, so the incidental page works. The comment "exposes `window.__gantt`" is true of the fallback page, not of the path it names. If `main.ts` ever stops exposing the global (or the fallback changes), this test fails for a reason unrelated to #433.
- **Fix:** Change the URL to `/zoom.html` (or `/`, deliberately). Add a comment only if the generic-demo page is the intended host.

### F7 — The new harness page repeats the flagged hand-tuned-token pattern (low, API gap in harness)

- **Files/lines:** `harness/theme-resolver.html:13-14`; `AGENTS.md` stop rule (#157).
- **Problem:** The page copies `--fg-row-height: 32px` (which restates `api/gantt.ts`'s default) and `--fg-grid-pane-width: 220px` (hand-tuned pane width standing in for `gridWidth: 'fitColumns'`) from the older page template. `AGENTS.md` names both as the exact API gaps the harness is meant to surface, not spread.
- **Concrete failure:** The demo pane width is a magic number instead of the published `gridWidth: 'fitColumns'` fit, so the page cannot demonstrate the library's own sizing and drifts from `main.ts`/`planner.ts`, which already use `fitColumns`.
- **Fix:** Pass `gridWidth: 'fitColumns'` in `harness/theme-resolver.ts` and drop `--fg-grid-pane-width`; drop `--fg-row-height` unless the page intends a non-default row height. (The same template appears in most older pages — fix the new one, and consider a follow-up sweep.)

### F8 — `typeof this.#theme === 'function'` is repeated in four methods (low, simplicity)

- **Files/lines:** `src/view/gantt-shell.ts:2116`, `:2168`, `:2189`, `:2219`.
- **Problem:** The resolver-vs-literal branch is duplicated across `#applyTheme`, `#observeThemePin`, `resolvedTheme` and `#syncResolvedTheme`. A third theme kind (or a change to how resolvers are detected) means four scattered edits — a repeated-switch smell.
- **Fix:** Extract one private predicate (e.g. `#isResolverTheme()`) or, better, resolve the observer config and the refresh decision in one place so the four sites read one story.

### F9 — `resolvedTheme` is a read with side effects (low, API)

- **Files/lines:** `src/view/gantt-shell.ts:2188-2191`; `:2199-2201`.
- **Problem:** The getter calls `#applyTheme()` (`:2189`), which writes `data-fg-theme` and can raise `theme-resolver-failed`. A getter that mutates the DOM and can emit error events surprises a reader; `checkResolvedTheme()` then runs the resolver twice (once in `#syncResolvedTheme`, once in the getter).
- **Concrete failure:** With a failing resolver, merely reading `gantt.resolvedTheme` is enough to enter the F1 write cycle — a read that hangs the page.
- **Fix:** Let the observer refresh the attribute and keep the getter a pure `resolveTheme` read. If a synchronous read after an unflushed DOM change must be live, document it loudly, or expose it as an explicit method like `checkResolvedTheme()` rather than hiding it in a getter.

### F10 — The first consumer resolver documents "no side effects" and then has one (low, docs/example)

- **Files/lines:** `harness/theme-resolver.ts:26-30`; `src/view/gantt-shell.ts:182-185`.
- **Problem:** `ThemeResolver`'s docblock says "Keep it cheap and free of side effects", but the harness resolver increments a counter and writes `resolverCalls.textContent` on every call — on the widened observer's every wake. The demo is the model consumers copy.
- **Fix:** Count calls from outside the resolver, or narrow the harness note to "this demo counts calls; a real resolver must stay cheap and side-effect free."

### F11 — The failure message promises a re-report the dedupe suppresses (low)

- **Files/lines:** `src/view/gantt-shell.ts:1896-1906`.
- **Problem:** The message says "Falling back … until 'theme' changes again", but the `WeakSet` is keyed on the resolver function, so reassigning the *same* failing function (a `theme` change) does not report again — only a new function instance does. The mechanism is otherwise sound (`BuiltInReportCode` and `error-code-drift.test.ts` are updated correctly, and the dedupe matches `#createBarRendererShadowedReport`'s shape).
- **Fix:** Reword to "until a different resolver is assigned", or key the dedupe on something that changes per assignment if re-reporting on every write is intended.

## Axes checked and found sound

- **Happy-path loop fix:** the `getAttribute !== next` guard is sufficient when the resolver returns a stable answer; one extra resolver call per self-write, then it settles. The re-entrancy the commit fixed is real and now pinned by `e2e/theme-resolver-loop.spec.ts` (modulo F6's path).
- **`#observeThemePin` narrowing:** re-`observe()` with `attributeFilter` on switch back to a literal restores the narrow watch; the "switching back to auto" test exercises it.
- **Constructor ordering:** the observer/target are built before `theme` is assigned (`:1141-1146`), and `#emit` suppresses events until `#constructed` (`:1315`), so #376 ("no event before `new Gantt()` returns") still holds for a resolver option.
- **`etc/freegantt.api.md` delta:** `Theme`, the new `ThemeResolver`, and `BuiltInReportCode: 'theme-resolver-failed'` are all reflected; `ThemeResolver` is exported from the package root via `src/api/index.ts:129-136`.
- **`harness/main.ts`:** reviewed although unchanged this branch — no theme-resolver compensation, no new API gap; it already uses `gridWidth: 'fitColumns'` (#157).
- **`harness/gantt-toolbar.ts` `ThemeChoice`:** a deliberate narrower UI model (three literal choices), not a workaround for a missing library feature. Acceptable; its only cost is recorded in F3.

## Pass 2 verification

A cold `reviewer-planner` sub-agent will open every cited file and return one verdict per id (`Confirmed`, `Mis-described`, `Wrong`, `Unproven`). Verdicts are recorded below on their return.

| Id  | Verdict | Note |
| --- | ------- | ---- |
| F1  | — | |
| F2  | — | |
| F3  | — | |
| F4  | — | |
| F5  | — | |
| F6  | — | |
| F7  | — | |
| F8  | — | |
| F9  | — | |
| F10 | — | |
| F11 | — | |
