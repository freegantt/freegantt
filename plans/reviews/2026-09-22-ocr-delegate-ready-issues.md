# OCR delegate review — ready issues, 2026-09-22

Host review of each lane commit that is ready to work. OCR selected the files
(`ocr delegate preview`) and the rules (`ocr delegate rule`). The host read
each diff and opened the code behind the claims. No file was edited.

Each review is one commit against its parent. Ruled issues with no commit
(#342, #424, #434, #262, #317, #281) have no diff, so this report skips them.

## Work these first

1. **#400.** `prepack` builds the library. `prepare` does not. A github install
   still lands with no `dist/`.
2. **#472 / #242.** Commit `2c145dde` does not type-check. `toInstant` now
   requires `operation`, and six call sites still omit it.
3. **#335.** The empty-menu arrow-key test never reaches the handler.
4. **#95.** Two commits record different script-time numbers for the same run.
5. **#101.** `fifteenMinute` and `sixHour` use a tick increment above 1. That
   is the open gridline shift in #489.

#414, #429, and #407 have no defect in this pass. #406 has one stale word.

## #400 — `e0a18972` in `400-pack-install`

| | |
|---|---|
| Reviewable | 3 of 3 reviewed (`package.json`, `scripts/check-lib-build.mjs`, `scripts/check-pack-install.mjs`) |
| Excluded | `plans/03-slices.md`, `plans/s6-scale-and-sync/README.md` (Markdown) |
| Coverage | 3/3 |

**High.** `package.json` `prepare` is still `node scripts/setup-hooks.mjs`.
`prepack` runs `vite build`. npm does not run `prepack` for a git dependency
(`pacote/lib/dir.js`, handoff §3 item 2). The commit message says a github
install produces `dist/`. It does not. `check-pack-install.mjs` proves a
packed tarball, not a git install.

**Medium.** `scripts/check-pack-install.mjs` pipes stdout and stderr on
`pnpm pack` and `pnpm add`. A failed build throws `Command failed` and does
not print the vite log. Print `error.stderr` in the catch before the work
directory is removed.

## #406 — `961b0e91` in `406-scale-10k`

| | |
|---|---|
| Reviewable | 3 of 3 reviewed (`harness/large-dataset.html`, `harness/large-dataset.ts`, `scripts/slice-gate.mjs`) |
| Excluded | `e2e/large-dataset.spec.ts`, `fixtures/seeded-dataset.ts`, `src/layout/frame.test.ts` (tests), `plans/03-slices.md` (Markdown) |
| Coverage | 3/3 |

**Low.** `harness/large-dataset.html` still says `zoom: 'preset'`. The fixture
sets `new TimeScaleModel({ fit: 'preset' })`. This commit rewrote that
sentence and left the old option name.

The count change itself is consistent. The generator tests that still pass
`count: 5000` pin the generator, not this fixture.

## #414 — `81e80c20` in `406-scale-10k`

| | |
|---|---|
| Reviewable | 2 of 2 reviewed (`src/layout/frame-memory.ts`, `src/layout/frame.ts`) |
| Excluded | `src/layout/frame-memory.test.ts`, `src/layout/frame.test.ts` (tests) |
| Coverage | 2/2 |

No defect. `FrameMemory` rebuilds `#entryById` only when the `entries` array
changes identity. `EntryStore.#all` is one array per dataset revision
(`src/data/entry-store.ts`, D-S2-3), and a scroll does not bump that revision.
`FrameLayout.computeFrame` syncs that same array before `placeFrame` reads it.

## #95 — `284907ca` in `406-scale-10k`

| | |
|---|---|
| Reviewable | 0 |
| Excluded | `plans/s6-scale-and-sync/README.md` (Markdown) |
| Coverage | no reviewable file |

OCR skipped the only file. The host read it anyway.

**Medium.** The new table cites commit `81e80c20` and records 4.24 ms of
script per frame unthrottled, and 18.85 ms at 4x. The `81e80c20` message
records 4.43 ms and 20.66 ms for the same command after the change. Pick one
pair and say which run it is, before anyone treats a number as the record.

Hover and the bulk edit stay unmeasured. The commit already says that.

## #429 — `dda983c4` in `429-docs-truth`

| | |
|---|---|
| Reviewable | 1 of 1 reviewed (`harness/hierarchy.ts`) |
| Excluded | `docs/07-row-source-updates.md` (Markdown) |
| Coverage | 1/1 |

No defect. A source switch builds a fresh row source and clears the filter.
A filter or sort change spreads `gantt.rowSource` and writes one key.
`filter: undefined` matches the setter's own example in `src/api/gantt.ts`.
The select values are `tree`, `grouped`, and `flat`.

## #407 — `aa05cbf2` in `429-docs-truth`

| | |
|---|---|
| Reviewable | 0 |
| Excluded | `plans/handoff/2026-09-15-crm-filament-labor.md` (Markdown) |
| Coverage | no reviewable file |

OCR skipped the only file. The host checked the four names the commit says
moved: `capabilities` replaced `interactions`, selection is
`selectedEntryIds`, the default `filterPolicy` is `keepAncestors`, and
`gridResizable` exists. Those four match the code at this commit.

## #335 — `cc18c602` in `335-coverage-presets`

| | |
|---|---|
| Reviewable | 0 |
| Excluded | three `*.test.ts` files (OCR default) |
| Coverage | no reviewable file |

OCR skipped every file. The host read the tests, because the commit is only
tests.

**Medium.** `context-menu.test.ts` dispatches `ArrowDown` on `document`.
`onDomEvent` listens on `document`, then returns unless
`shell.dom.owns(event.target)` (`src/view/plugin-ports.ts`). The target is
`document`, so the handler does not run. `expect(() => …).not.toThrow()`
passes without the empty-menu path. Dispatch the key on the open menu, or
on an item inside it.

The `when: false` test and the row-hover tooltip test do reach the handlers.
`menu-view.test.ts` calls the functions directly.

## #101 — `661995a3` in `335-coverage-presets`

| | |
|---|---|
| Reviewable | 4 of 4 reviewed (`harness/timeline-toolbar.ts`, `harness/zoom.ts`, `src/time/index.ts`, `src/time/presets.ts`) |
| Excluded | `etc/freegantt.api.md` (Markdown), `src/time/presets.test.ts` (test) |
| Coverage | 4/4 |

**Medium.** `fifteenMinutePreset` uses `tickIncrement: 15`. `sixHourPreset`
uses `tickIncrement: 6`. #489 says a tick increment above 1 moves the
gridlines when the user pans. These two presets are new doors onto that bug.
Decide whether they ship before #489, or ship with that limit written down.

The four presets stay out of `ZOOM_PRESETS`. `formatHour` prints minutes, so
a one-minute tick reads as a clock time. `dayLetterAndWeek` uses
`weekday: 'narrow'` on the day band.

## #472 and #242 — `2c145dde` in `472-time-helpers`

One WIP commit holds both issues. The gate did not run. The tree does not
type-check.

| | |
|---|---|
| Reviewable | 8 of 8 reviewed (`harness/gantt-toolbar.ts`, `src/api/index.ts`, `src/model/errors.ts`, `src/model/index.ts`, `src/time/index.ts`, `src/time/input.ts`, `src/time/instant-fault.ts`, `src/time/instant.ts`) |
| Excluded | `docs/architecture/files.md`, `etc/freegantt.api.md`, `plans/02-public-api.md` (Markdown), `src/time/instant.test.ts` (test) |
| Coverage | 8/8 |

**High.** `toInstant` and `toEndInstant` now require `operation`. These calls
still omit it, so `tsc` fails:

- `src/time/zoned-time.ts` lines 69 and 70
- `src/api/gantt.ts` lines 414, 421, 428, 928, and 934

`src/time/input.test.ts` is not in this commit. Its message assertions still
expect the old text. Update them after the call sites compile. Then split
this commit into one for #472 and one for #242.

`overlap` itself is sound. It returns `undefined` when the two spans share
no instant, including a touch at one boundary. The toolbar calls
`diffMs(visible.end, visible.start)`, and `diffMs(a, b)` is `a - b`, so the
hour total is positive.
