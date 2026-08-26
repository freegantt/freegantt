# S1.9 implementation — handoff

Picking up mid-implementation of `plans/s1.9-presets-and-zoom/README.md`. That file is the settled
spec — read it in full before touching anything; this note is only "what's done, what's left, how
to keep going."

**Branch:** `s1.9-implementation` (off `main`), pushed to `origin`. Every commit so far passes the
full `pnpm verify` + `pnpm test:e2e` pre-push gate (it runs automatically on every `git push` via
`.githooks` — do not bypass it).

## Working method (keep doing this)

1. Pick the next unchecked `- [ ]` box in `plans/s1.9-presets-and-zoom/README.md` §8 TODO.
2. Read the relevant §3 API subsection and §2 decision (D-S1.9-N) it implements — the TODO items
   are deliberately terse; the decisions have the actual contract and rejected alternatives.
3. Implement, add/extend tests per §6, run `pnpm typecheck && pnpm lint && pnpm boundaries` plus the
   targeted `pnpm vitest run --project pure <path>` (or `--project dom` for `api/gantt.test.ts` /
   `view/gantt-shell.test.ts`) before committing.
4. Flip the box to `- [x]` in the same commit as the code.
5. `git add` **specific files only** — not `-A`. A stray untracked file
   (`plans/2026-08-25-s1.8-review.md`, an old S1.8 review doc) got swept into an earlier commit this
   way; harmless in that case, but check `git status --short` before staging regardless.
6. Commit, then `git push` — the pre-push hook runs the full gate and will block on any failure.
   Fix forward; don't `--no-verify`.

## Done so far (commits on `s1.9-implementation`, oldest first)

1. **Types and errors** — `UnknownPresetError` (`code: 'unknown-preset'`), `EntryNotFoundError`
   (`code: 'entry-not-found'`) added to `src/model/errors.ts`, re-exported from `src/model/index.ts`
   and `src/api/index.ts`.
2. **`time/presets.ts`** (new file) — the five single-band presets moved out of `src/time/scale.ts`
   unchanged (`hourPreset`…`yearPreset`), three new two-band presets added (`dayAndWeekPreset`,
   `weekAndMonthPreset`, `monthAndYearPreset`), plus `ShippedPresetId`, `presets`, `PresetRef`,
   `resolvePreset`. `scale.ts` keeps the engine + `pxPerMsForPreset`, gained `TimeScale.pxPerMs`.
   `time/index.ts` barrel updated. Added `time/presets.test.ts` and a DST-transition test for `'w'`/
   `'M'` stepping in `time/zone.test.ts` (`[S1-A5]`).
3. **`TimeScaleModel` zoom** — `TimeScaleZoom` type (`'fitViewport' | 'preset' | {pxPerMs}`),
   `TimeScaleIntent.zoom`, live `preset`/`range`/`zoom` setters (each a no-op + no invalidation when
   unchanged), `#resolvePxPerMs` three-way branch replacing the old hardcoded fit-to-width formula.
   `preset` now takes a `PresetRef` and resolves through `resolvePreset` (throws
   `UnknownPresetError`). Extended `time-scale-model.test.ts`; the *pre-existing* assertions pass
   unmodified (that's the "free at the default" proof D-S1.9-2 requires).
4. **`Viewport.zoomTo`/`zoomBy`/`reveal`** — `#scrollHandle` field retained from `bind()`; `zoomTo`
   reads the anchored instant before writing, then writes `scale.zoom` and pushes the new
   `contentWidth` itself (synchronously, via `#scrollHandle.setContentSize`) before panning, all
   inside one `batch()` — never touches `range.start` (D-F′). `zoomBy` delegates by scaling
   `timeScale.pxPerMs`. `reveal(target: Rect)` is nearest-edge on both axes. Extended
   `viewport.test.ts` with notification-count tests, an anchor-fixed-under-pointer test, a
   `zoomBy(2)` / `zoomBy(0.5)` round-trip test, a fast-check property test, and `reveal` tests. One
   property-test subtlety worth knowing: the anchor-stays-fixed invariant only holds when the
   resulting scroll position is strictly inside `(0, max.x)` — when zooming out clamps the pan to a
   scroll bound, there is no reachable position that keeps the anchor under the pointer, so the test
   skips the assertion on the two clamped boundary cases. This is a straightforward mechanical
   consequence of `ScrollModel`'s existing clamp-at-write (D-S1.5-2), not a bug and not something
   flagged in the spec's own foot-gun table — worth a mention if anyone re-derives this test.

## Remaining TODO (in the order the spec's §8 lays out, top to bottom)

- [ ] **`layout/frame-layout.ts`** — `FrameLayout.rowTop(index): number` (§3.5). Trivial: delegate to
  the existing private `RowHeightIndex`'s `topAt(index)` — something like
  `rowTop(index: number): number { return this.#heights?.topAt(index) ?? 0; }` (guard needed since
  `#heights` is `undefined` until `computeFrame` has run at least once — the doc comment in §3.5
  says this is fine, `reveal` is the only caller and it only runs after construction). Extend
  `frame-layout.test.ts` per §6: `rowTop(index)` matches `topAt(index)` for the same index a
  `computeFrame` call would report.

- [ ] **`view/gantt-shell.ts` / `api/gantt.ts`** — the big remaining piece, §3.6:
  - `GanttShell`: `preset`/`range`/`zoom`/`overscan` get/set (delegate straight to `#viewport`),
    `zoomTo`/`zoomBy`/`reveal` methods. `reveal(entryId)` needs to: find the entry via
    `this.#options.dataset.entries.findIndex(e => e.id === entryId)` (throw `EntryNotFoundError` if
    `-1`), ask `this.#layout.rowTop(index)` for `y`, ask `this.#viewport.timeScale` for `x`/`width`
    the same way `computeFrame` does (`scale.xForInstant(entry.start)` /
    `scale.xForInstant(entry.end) - x`), build a `Rect` with `height: this.#rowHeight`, and call
    `this.#viewport.reveal(rect)`.
  - `GanttShellOptions` / `GanttOptions` gain `preset?`, `range?`, `zoom?`, `overscan?` — **but only
    to build the private default TimeScaleModel/Viewport** when `options.scale` is omitted
    (D-S1.9-9). When a caller supplies **both** `scale` and any of `preset`/`range`/`zoom`, skip
    building intent from the construction-time keys and emit one dev-mode warning (check how
    existing dev-mode warnings are emitted elsewhere in the codebase — grep for
    `console.warn`/`import.meta.env.DEV` — to match the existing style; `plans/02` §7 has the
    canonical list this warning joins). `overscan` has no such ambiguity (`Viewport` is
    never shared, D-S1.7-10) and can always apply directly.
  - `Gantt`: same surface, delegating straight to `#shell`, plus `GanttOptions` gaining the four
    keys (forwarded to `GanttShellOptions` the same way `gridWidth` already is).
  - Update `view/index.ts` and `api/index.ts` barrels to export the new types
    (`TimeScaleZoom`, `PresetRef`, `ShippedPresetId`, `presets`, `resolvePreset`, the three new
    preset constants, `Overscan`) per §4's "Public surface" list.
  - Tests: extend `api/gantt.test.ts` (`dom` project) per §6 — bar DOM identity (`item.id`) unchanged
    across `gantt.preset = 'weekAndMonth'` (I8, `[S1-A3]`), `gantt.reveal(id)` moves
    `scrollLeft`/`scrollTop` correctly, unknown id throws `EntryNotFoundError`, shared
    `scale`/`scroll` + `zoomBy` on one Gantt observed on the other's live DOM (U7). Also check
    whether `gantt-shell.test.ts` needs matching non-DOM-identity-focused coverage for the new
    accessors — look at how `gridWidth` is tested there as the template.

- [ ] **Harness review** — re-read `harness/main.ts` and `harness/scroll-sync.ts` against
  `CLAUDE.md`'s harness rule now that `preset`/`zoom`/`reveal` exist on the public API. The rule:
  `harness/` is reviewed on every commit whether or not it changed; anything hand-rolled there that
  the library now computes is an API gap to record against S1.9 and fix in `src/`, not to quietly
  tidy in the harness. (CLAUDE.md cites two past examples of what this catches: a hardcoded
  `rowHeight: 32` restating a default, and a hand-built `TimeScaleModel` standing in for
  `range: 'fitDataset'`.)

- [ ] **Spec doc edits landed with this step** (§7 of the README — these are edits to *other* repo
  docs, not to the S1.9 README itself, and per the checklist should land in the same PR):
  - `plans/01-domain-architecture.md` §5.1 — fix the `TimeScale` code block (stale since S1.7 to the
    old `ticks()` shape) and add `pxPerMs`.
  - `plans/01-domain-architecture.md` §8.2 — add a paragraph on `Viewport.zoomTo`/`zoomBy`/`reveal`
    and D-F′, next to the existing `Viewport` paragraph.
  - `plans/02-public-api.md` §7 — move "unknown preset id" from the dev-mode-warning list into
    "Errors are typed and actionable" (`UnknownPresetError`); add the D-S1.9-9 `scale` +
    constructor-`preset`/`range`/`zoom` case to the warning list.
  - `plans/s1.7-windowed-frame/README.md` §9 and `plans/s1.8-pane-layout/README.md` §9 — tick the
    `reveal`/`overscan` carried-item rows as landed here.
  - `CONTEXT.md` — new glossary entries: **Range**, **Zoom**, **Anchored zoom**, **Preset reference**;
    edit **ViewPreset** ("one or more header bands") and **Reveal** (mark the x half landed).
  - `plans/temp_todo_for_s1-close.md` §5 — no edit needed per the spec, just noting it's superseded.

- [ ] **`pnpm verify` green; `pnpm test:e2e` green** — should already be true after every commit
  given the pre-push hook, but re-run once explicitly after the `view/`/`api/` work lands since
  that's the step touching the most surface area.

- [ ] **e2e** — new `e2e/zoom.spec.ts` per §6: a wheel-zoom-equivalent `zoomBy` call against the live
  harness keeps the pointer's instant visually fixed; a preset switch redraws header bands with no
  flash/remount (no new element created for an existing bar). Look at `e2e/pane-resize.spec.ts` or
  `e2e/scroll-sync.spec.ts` for the harness-driving pattern (they already exercise the live harness
  via Playwright).

- [ ] **Acceptance checklist** (§8 bottom) — U1–U7, `[S1-A3]`, `[S1-A5]` are mostly closed by the
  test work above; do a final pass matching each bullet to the test that actually covers it before
  checking it off, per the spec's own cross-references.

## Things to double check before calling S1.9 done

- `layout/index.ts` and `view/index.ts` barrels: I added `TimeScaleZoom`/`PresetRef`/`ShippedPresetId`
  to `layout/index.ts` already; `view/index.ts` still needs the equivalent pass once `GanttShell`
  actually uses them.
- `api/index.ts` still only re-exports the five old single-band presets plus `instant` from
  `time/index.js` (see the block starting `export { dayPreset, hourPreset, ... }`). It needs the
  three new preset constants, `presets`, `resolvePreset`, `PresetRef`, `ShippedPresetId`,
  `TimeScaleZoom`, and `Overscan` added — §4's "Public surface" list is the authoritative checklist.
- Don't forget `Overscan` is already exported as a type from `layout/index.ts` — it just isn't
  re-exported from `api/index.ts` yet (§4 flags this explicitly: "already public from `layout/`'s
  barrel, not yet re-exported from `api/`").
- `S1.9's own README §9` ("Deferred") lists what's explicitly *not* in scope — don't accidentally
  implement `reveal(id, {align: 'center'})`, `zoom: 'preset'` as a shipped default, or a
  snap-to-tick gesture. Those belong to S1.11/S4 per that table.
