# S9 — The first consumer's public surface

**Slice:** S9 (`plans/03` §S9) · **Position:** see the box below — **S9 runs next, ahead of the rest of S6** · **Status:** not started. `.slice` still reads `S6`.
**Form:** the tracker form S4, S5 and S6 use — this file holds the shared context and the row-by-row state; each row names the issue that carries its work.
**Governed by:** `plans/00` D2/D9, `plans/01` §11 (invariants I1–I14), `plans/04` §5 (the gate).
**Builds on:** S4's row sources and `CustomRow`, S5's renderer points and plugin runtime, S6's `#411` cell-vocabulary split.

> ## The number is a name, not a position
>
> **S9 runs next. It comes before any further S6 work**, and only S6 work that serves S9 continues past it (author's ruling, 2026-09-15; `plans/s6-scale-and-sync/README.md` §4 Q3).
>
> S0–S7 are in slice order. S9 is not: it was given a high number to park it, then promoted. **There is no S8.** Do not read "S9" as "after S7" — read this box.
>
> Whoever starts R1 flips `.slice` to `S9` and mints the `[S9-A1]`–`[S9-A4]` gate rows (`scripts/slice-gate.mjs` has no entry past `S5 → S6` today, so S6's own §5.4 item lands first or beside it).

---

## 1. What this slice is

Four issues, all **new public surface**, all raised by the first real consumer's brief (`plans/handoff/2026-09-15-crm-filament-labor.md`) or alongside it. S6 held them out because S6's posture is "no new public feature". They now have a home.

S6 keeps what it always was: scale validation, hardening, linked instances, and the package audit. **#400 (packaging) stays in S6** — it blocks the consumer from installing anything at all, so it is not held out and it is not here.

## 2. The four acceptance rows

| # | Row | State | Carried by |
|---|---|---|---|
| **R1** | A row paints one value per tick, and a click on a tick reports it | Not started. **Design settled** — see §3. This is the consumer's **blocking** ask. | **#401** |
| **R2** | A `Segment` carries consumer data, reaching the renderer that paints it | Not started, no design. The consumer can ship without it; it reads badly in their code until it lands (brief §3). | **#402** |
| **R3** | Non-working-time shading ships as a first-party plugin, not a harness demo | Not started. `harness/plugins/weekend-shading.ts` is the S5 dogfood copy the consumer would otherwise maintain (brief §6). | **#404** |
| **R4** | A gesture creates a `Segment` — **only if still wanted after R1** | Not started, and **re-scoped by R1's design**. See §4. | **#408** |

Order: **R1, then R2, then R3.** That is the brief's own priority (§9), minus packaging, which is S6's R5. R4 is last and may be dropped.

## 3. R1 — the design is settled

**Read it here: <https://github.com/Pawel-IT/FreeGantt/issues/401#issuecomment-5689299551>.** That comment is the spec for this row. It answers all seven questions in the issue body plus the click event. The decisions, so this file states what it commits to:

- **A Timeline cell is one Row by one Tick.** #411 already split the vocabulary in `src/` and `CONTEXT.md`, so `cell` always says which pane. Nothing here renames anything.
- **New geometry, not a widened `Item`.** `FrameTimelineCell`, `GeometryFrame.timelineCells`, `TimelineCellId`. Every reader of `bars` is untouched, and move/resize on a Timeline cell is unreachable rather than switched off.
- **The producer is asked once per visible row**, and core hands it the tick set as `readonly TimeSpan[]` — time, never pixels (I12). About 30 calls per scroll frame. No memo; reassigning `gantt.timelineCells` is the refresh door.
- **Themable three ways:** `--fg-timeline-cell-*` tokens, then `data-variant`, then a fifth renderer point `'timelineCell'`. Levels 1 and 2 cover the consumer's four states with no JS.
- **Its own CSS hooks**, never `meter()`'s `.fg-meter-*`.
- **`timelineCellClick`** fires on every primary click in the timeline pane, carries `{ rowId, entryIds, start, end, itemId?, segmentId?, cell? }`, has no `before*` pair (it mutates nothing), does not consume the click (D-S3-10's clear is unchanged), and works with no producer installed.
- **Known gap, stated not hidden:** there is no keyboard path to a Timeline cell. The recommendation is to join the row's existing roving focus (`view/roving-focus.ts`) with Enter firing the event, which needs `TargetKind` to gain `'timelineCell'`. Settle it inside R1; do not ship R1 without an answer in writing.

### R1 acceptance

- [ ] A row with no Entry paints one cell per visible tick, aligned to the finest header band's boundaries, from one `gantt.timelineCells` producer.
- [ ] The producer is called once per visible row per frame recompute, and never on hover, selection or drag preview.
- [ ] The producer receives `readonly TimeSpan[]` and no pixel of any kind.
- [ ] `undefined` in the returned array paints nothing, so a sparse row and a dense row take one code path.
- [ ] Each painted cell carries an `aria-label` that core prefixes with the formatted tick date; the graphic is `aria-hidden`.
- [ ] A Timeline cell resolves no move and no resize capability, because it is not in `bars`.
- [ ] `--fg-timeline-cell-*` and `data-variant` restyle all four consumer states with no JS; `timelineCellRenderer` overrides the whole cell.
- [ ] `timelineCellClick` fires with no `timelineCells` producer installed, and a bare click still clears the selection.
- [ ] The keyboard answer is decided and written down, whether it is roving focus or a pointer to the Grid date editor.
- [ ] Harness page, e2e for paint/label/theming/keyboard/click, api report updated, `CONTEXT.md` extended.
- [ ] `verify:full PASS`, reported from the last line of the run.

## 4. R4 — why #408 shrank

#408's own Q1 says a create gesture collides head-on with D-S3-10 ("a click on empty timeline clears the selection"), and that nothing else should be designed before that is settled.

R1's `timelineCellClick` has no such collision. It does not consume the click: the selection still clears, the event also fires, and the app writes through `dataset.entries.update()` from its own dialog. So the consumer's create path ships with R1.

What is left of #408 is one question: **does the library also want to mint the Segment itself?** Answer it after a consumer has lived with the dialog. #408's Q4 stays live either way — `EntryEdit.segments` replaces the whole array, so an additive segment door is owed to whoever writes the create path, library or app.

## 5. What this slice is not

No `Dependency`, no `schedule()`, no link geometry — that is S7, unchanged. No packaging work: #400 is S6's R5 and blocks everything, including this. No per-bucket rollup — R1's producer is keyed by row, so a "Whole Team" row is just a row the consumer answers for, and core needs nothing (issue #401 §12).

## 6. Where to start

1. **#401**, against the design comment linked in §3. Flip `.slice` to `S9` and mint the gate rows first.
2. Then **#402**, which has no design yet and needs one before code.
3. Then **#404**.
4. **#408** only if §4's remaining question comes back "yes".
