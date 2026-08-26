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
5. `git add` **specific files only** — not `-A`. Check `git status --short` before staging.
6. Commit, then `git push` — the pre-push hook runs the full gate and will block on any failure.
   Fix forward; don't `--no-verify`.

## Done so far (commits on `s1.9-implementation`, oldest first)

1. **Types and errors** — `UnknownPresetError`, `EntryNotFoundError` added to `src/model/errors.ts`,
   re-exported from `src/model/index.ts` and `src/api/index.ts`.
2. **`time/presets.ts`** (new file) — five single-band presets moved unchanged, three new two-band
   presets added, plus `ShippedPresetId`, `presets`, `PresetRef`, `resolvePreset`. `scale.ts` gained
   `TimeScale.pxPerMs`.
3. **`TimeScaleModel` zoom** — `TimeScaleZoom` type, `TimeScaleIntent.zoom`, live `preset`/`range`/
   `zoom` setters, `#resolvePxPerMs` three-way branch. `preset` resolves through `resolvePreset`
   (throws `UnknownPresetError`).
4. **`Viewport.zoomTo`/`zoomBy`/`reveal`** — anchored zoom inside one `batch()`, never touches
   `range.start` (D-F′); `reveal(target: Rect)` is nearest-edge on both axes.
5. **`FrameLayout.rowTop(index)`** (§3.5) — one-line delegate to the row-height index's `topAt`,
   guarded for the unconstructed case. Test: `rowTop(index)` matches `computeFrame`'s reported
   `row.top` for the same index.
6. **`view/gantt-shell.ts` / `src/api/gantt.ts` public surface** (§3.6) — the big remaining piece is
   now done:
   - `Viewport` gained `preset`/`range`/`zoom` get/set (delegating to `TimeScaleModel`) — it only had
     `zoomTo`/`zoomBy`/`reveal`/`#scrollHandle`/`preset` (read-only) before this step; `preset`
     gained a setter too, alongside new `range`/`zoom` accessors, so `GanttShell` has one thing
     to delegate to for all four keys.
   - `GanttShell` gained `preset`/`range`/`zoom`/`overscan` get/set (straight to `#viewport`),
     `zoomTo`/`zoomBy` (straight to `#viewport`), and `reveal(entryId)`: finds the entry's row via
     `dataset.entries.findIndex`, asks `#layout.rowTop(index)` for `y` and `#viewport.timeScale` for
     `x`/`width` the same way `computeFrame` does, builds a `Rect`, hands it to `#viewport.reveal`.
     Throws `EntryNotFoundError` for an unknown id.
   - `GanttShellOptions`/`GanttOptions` gained `preset?`/`range?`/`zoom?`/`overscan?`. They build the
     *private* default `TimeScaleModel`/`Viewport` only when `options.scale` is omitted (D-S1.9-9).
     When a caller passes both `scale` and any of `preset`/`range`/`zoom`, the shared scale wins and
     one dev-mode warning fires — gated on `(import.meta as {env?:{DEV?:boolean}}).env?.DEV` (no
     `vite/client` types in `tsconfig.json`, so a plain `import.meta.env.DEV` access doesn't
     typecheck; this cast is the workaround, not a new dev-warning convention — there was no prior
     `console.warn`/dev-mode-warning code in `src/` to match against, since `plans/02` §7's
     dev-warning list was previously aspirational only).
   - `view/index.ts` and `api/index.ts` barrels updated: `TimeScaleZoom`, `PresetRef`,
     `ShippedPresetId`, `Overscan`, the three multi-band preset constants, `presets`, `resolvePreset`
     re-exported. (`layout/index.ts` already had `TimeScaleZoom`/`PresetRef`/`ShippedPresetId`/
     `Overscan` from earlier steps.)
   - Tests: `api/gantt.test.ts` — preset switch keeps bar DOM identity (I8, `[S1-A3]`), `overscan`
     live, `reveal` moves the bound `ScrollModel` (see note below on why it's not
     `element.scrollLeft`), unknown id throws `EntryNotFoundError`, shared `scale`+`scroll` +
     `zoomBy` on one `Gantt` observed on a second `Gantt`'s live DOM (U7), and the scale+preset
     dev-mode warning (asserted via a `console.warn` spy). `view/gantt-shell.test.ts` — matching
     non-DOM-identity coverage: the four accessors round-trip through `#viewport`, `zoomTo`/`zoomBy`
     move `scale.scale.pxPerMs`, `reveal` moves the bound `ScrollModel` and throws for an unknown id.
   - **One test-writing trap hit and fixed, worth knowing**: `DEFAULT_OVERSCAN.horizontalPx` (in
     `layout/frame.ts`) is `128`. A test that sets `overscan = { horizontalPx: 128 }` looks like a
     normal "change the value" assertion but is actually a no-op — `sameOverscan` resolves both the
     unset default and `128` to the same number, so the live setter's "notify iff changed" (D-S1.5-4)
     correctly does nothing. Use a value that isn't `128` (e.g. `256`) when testing that the setter
     *does* propagate.

## Remaining TODO (in the order the spec's §8 lays out, top to bottom)

- [ ] **Harness review** — re-read `harness/main.ts` and `harness/scroll-sync.ts` against
  `CLAUDE.md`'s harness rule now that `preset`/`zoom`/`reveal`/`overscan` exist on the public API.
  The rule: `harness/` is reviewed on every commit whether or not it changed; anything hand-rolled
  there that the library now computes is an API gap to record against S1.9 and fix in `src/`, not to
  quietly tidy in the harness. This has **not been done yet** for this step — do it before the docs
  pass below, since a harness gap might change what those docs need to say. (CLAUDE.md cites two
  past examples of what this catches: a hardcoded `rowHeight: 32` restating a default, and a
  hand-built `TimeScaleModel` standing in for `range: 'fitDataset'`.)

- [ ] **Spec doc edits landed with this step** (§7 of the README — these are edits to *other* repo
  docs, not to the S1.9 README itself, and per the checklist should land in the same PR):
  - `plans/01-domain-architecture.md` §5.1 — fix the `TimeScale` code block (stale since S1.7 to the
    old `ticks()` shape) and add `pxPerMs`.
  - `plans/01-domain-architecture.md` §8.2 — add a paragraph on `Viewport.zoomTo`/`zoomBy`/`reveal`
    and D-F′, next to the existing `Viewport` paragraph.
  - `plans/02-public-api.md` §7 — move "unknown preset id" from the dev-mode-warning list into
    "Errors are typed and actionable" (`UnknownPresetError`); add the D-S1.9-9 `scale` +
    constructor-`preset`/`range`/`zoom` case to the warning list (this step's actual warning text
    lives in `src/view/gantt-shell.ts`'s constructor — match wording, don't invent new copy).
  - `plans/s1.7-windowed-frame/README.md` §9 and `plans/s1.8-pane-layout/README.md` §9 — tick the
    `reveal`/`overscan` carried-item rows as landed here.
  - `CONTEXT.md` — new glossary entries: **Range**, **Zoom**, **Anchored zoom**, **Preset reference**;
    edit **ViewPreset** ("one or more header bands") and **Reveal** (mark the x half landed).
  - `plans/temp_todo_for_s1-close.md` §5 — no edit needed per the spec, just noting it's superseded.

- [ ] **`pnpm verify` green; `pnpm test:e2e` green** — true as of the last push (both commits on this
  branch went through the full pre-push gate), but re-run once explicitly after the harness-review
  and doc-edit steps above in case either touches `src/` or `harness/`.

- [ ] **e2e** — new `e2e/zoom.spec.ts` per §6: a wheel-zoom-equivalent `zoomBy` call against the live
  harness keeps the pointer's instant visually fixed; a preset switch redraws header bands with no
  flash/remount (no new element created for an existing bar). Look at `e2e/pane-resize.spec.ts` or
  `e2e/scroll-sync.spec.ts` for the harness-driving pattern (they already exercise the live harness
  via Playwright). **Not started.**

- [ ] **Acceptance checklist** (§8 bottom) — U1–U7, `[S1-A3]`, `[S1-A5]`. Most of the unit/dom-level
  coverage exists now (see "Done so far" above and the already-checked `time/`, `layout/viewport/`
  boxes), but the checklist itself is still unticked pending the e2e spec above (U1–U3's e2e half)
  and a final pass matching each bullet to the test that actually covers it, per the spec's own
  cross-references. Don't tick U1–U3/`[S1-A3]` until `e2e/zoom.spec.ts` exists.

### Review, Verify, and Fix Issues from 1.8 Review
Confirm these findings before fixing them.
- [ ] `plans/2026-08-25-s1.8-review.md`

## Things to double check before calling S1.9 done

- `S1.9's own README §9` ("Deferred") lists what's explicitly *not* in scope — don't accidentally
  implement `reveal(id, {align: 'center'})`, `zoom: 'preset'` as a shipped default, or a
  snap-to-tick gesture. Those belong to S1.11/S4 per that table.
- The public surface (§4) should now be fully landed — `api/index.ts` re-exports everything the
  section lists. Worth a final diff against §4's list once the doc edits above are done, since
  that's the authoritative checklist and nothing should be re-derived from memory against it.
