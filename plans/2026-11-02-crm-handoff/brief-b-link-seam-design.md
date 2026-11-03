# Brief B: design the link-emitter seam (#136) and re-split S7

Read `common-rules.md` (same folder) first. Slice name for your progress file: `b-link-seam-design`.

**This is a planning task. You write no code in `src/` or `harness/`.**

## Target

- New plan folder `plans/s7-dependencies-and-scheduling/` with a `README.md`.
- Read first: issue #136 (`gh issue view 136`), #111, #135, `plans/03-slices.md` § S7, `plans/01-domain-architecture.md` §4 and §7, `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md`, `src/layout/frame.ts` (`FrameLink`, `links`), `src/view/plugin-ports.ts`, `src/api/plugin-context.ts`, `src/api/dataset-plugin.ts`, ADRs 0002, 0008, 0019, 0031, 0032, 0037.
- Read handoff items B, C and D. They are consumer input to this design.

## Change

1. **The link-emitter seam.** Write the open question from #136 plainly: a Gantt-side plugin reads a Dataset-side plugin's store. Give two to four options. For each one: the call site (written out, real arguments), the layer and import rules it touches, how `layout/` stays free of plugin types, and how a non-dependency plugin ("related to" arrows) uses it. Give one recommendation and why.
2. **Re-split S7** into slices across `entryDependencies()` and `scheduling()`. Each slice ends with something visible in `harness/`. Fold in handoff C and D:
   - the host seeds and replaces the `Dependency` store
   - async `beforeLinkCreate`
   - link ports on capabilities, keyboard select and delete, a link label from the entries' label Field, links that stay drawn when one end is off-screen
   - calendar as input: workdays plus holiday dates, optional per-entry calendar from a consumer-named Field key. One calendar object feeds both `scheduling()` and `timeShading()`. Check `src/extensions/features/time-shading.ts` and its `TimeCover` builders and say which shape works for both.
   - constraints stored by the plugin like pins
   - phase 2: float, critical flag, `drivingPath(entry)`
3. **List every decision the owner must make**, numbered, each with options and your pick. Mark which ones need an ADR. Do not write an ADR.
4. Note any gap you find in the S7 text of `plans/03-slices.md`. Do not edit `plans/03-slices.md`; the coordinator edits it after the owner rules.

## Constraints

- No CRM concept enters the design. Every hook must serve any consumer.
- Respect the one-way rule: `scheduling()` requires `entryDependencies()`, never the reverse.
- Keep the README under about 400 lines. Use Simplified Technical English.

## Ownership

You own `plans/s7-dependencies-and-scheduling/` only.

## Observable acceptance

- The README exists with: the seam options and pick, the S7 slice list, the numbered owner decisions.
- A draft PR holds it.
- `worker_done` lists the owner decisions in one short line each.
