# Build log — the seven foot-gun rows under #463

Decisions the coordinator and the implementers made on their own while they closed the seven rows under #463.

## PR 1 — #478, #480, #479

No decision left open. The three issues settled every row's wording.

**Worktree location.** `scripts/create-worktree.sh` puts a worktree at `.worktrees/<issue>-<slug>/`. A stale-worktree sweep from another agent deleted that `.worktrees/` checkout, branch included. PRs 1 and 2 ran in the coordinator's own worktree as a stop-gap. PR #484 then moved the script to `orca worktree create`, so PR 3 onward each run in their own Orca-managed worktree, as the workflow always intended.

## PR 2 — #477

No decision left open. The issue's plan settled the wording, the sites, and the plan-row edit.

**`pr-wait` raced the `ready_for_review` transition.** `open-pr --ready` queued a gate run, but
concurrency (keyed on the branch) cancelled it against the draft-push run's tail end (`docs/04`
§5.2, #415's known shape). No live run remained, so `pr-wait` timed out twice. The documented fix
applied: push a commit so `synchronize` fires, then run `pr-wait` again. This note is that commit.

## PR 3 — #474

**`InvalidPresetError` shape.** A second validator needs a second message. The constructor takes `(presetId, reason)`, and each validator writes its own sentence. The two width fields go, because one code covers one meaning: this preset object is inconsistent.

No other decision left open. The issue's ruling settled the constructor shape, the two rules (unit and increment), and the empty-`headers` pass-through. `harness/main.ts` builds no custom `ViewPreset`, so this guard needed no harness review beyond confirming that.

## PR 4 — #475

**`ZOOM_PRESETS` precedent does not hold at the `api/index.ts` layer.** The issue and the handoff both say the new lists go public "the same way `ZOOM_PRESETS` already is." `ZOOM_PRESETS` is public only through `layout/index.ts` — `api/index.ts:423` says named preset constants stay internal, and `ZOOM_PRESETS` is not re-exported there. The issue's own "export the key lists publicly" answer is unambiguous, so `BAR_FLAG_KEYS`/`LINK_FLAG_KEYS` went public through both `layout/index.ts` and `api/index.ts` anyway; only the cited precedent was wrong, not the decision. Flagged for the coordinator, not treated as a blocker.

**Derived-type shape.** `BarFlags`/`LinkFlags` derive as `Partial<Record<(typeof KEYS)[number], boolean>>`, inline at the type alias, rather than a named mapped-type helper — two call sites don't earn a shared helper, and `etc/freegantt.api.md` prints the resolved `Partial<Record<...>>` shape either way (see the api-report diff in the PR body).

**Doc block columns.** `docs/05-consumer-api.md`'s new `### data-flag` table uses `Selector | Set by` — two columns, since every row today says the same thing (S7 scheduling plugin) and a `Part | Role` table (the existing Parts-list shape) would repeat `.fg-bar`/`.fg-link` as a redundant column.

**Test file and failure message.** `src/render/dom/flag-selectors.test.ts`, beside `dom-contract.test.ts`, copies its `import.meta.url` root resolution. Each assertion carries a custom message: `add a ".fg-bar[data-flag~="<key>"]" row to the data-flag table in docs/05-consumer-api.md` — names the exact row and file, not just a mismatch.

**`.fg-link` does not render yet.** `GeometryFrame.links` (`FrameLink[]`) exists in `layout/frame.ts` but nothing in `render/dom` reads it — no `.fg-link` element paints today, unlike `.fg-bar`'s flag mechanism, which is real even though nothing sets a flag true yet. The issue's "`.fg-link[data-flag~="cycle"]` are live" is stronger than the code supports; the doc row and the guard still stand, since both describe the design S7's plugin will complete, the same way the `.fg-bar` rows already describe a mechanism nothing sets true yet.

Neither of the two findings above blocked the PR; both are recorded here for the coordinator to weigh.
