# Grill — the toolbar's input seam (#222)

Written 2026-09-06 for a fresh agent. You start cold and work from this file.

> **Read first.** `CLAUDE.md` (hard rules), `CONTEXT.md` (glossary), `plans/02-public-api.md`
> (the API rules), and **#222's decision comment of 2026-09-06**, which is settled input and is not
> yours to reopen.

## What is already decided — do not reopen any of it

The repo owner settled the toolbar's shape on 2026-09-06. Four answers:

1. **A first-party plugin**, `toolbar()`, beside `tooltips()` / `contextMenu()` / `inlineEditing()`.
   D-S5-19's reasoning carries: a read-only Gantt should carry no toolbar code.
2. **Renders into a library-owned slot** inside `.fg-container`.
3. **A consumer declares an ordered list**, and the plugin resolves labels and enablement from the
   command registry. Consumers can register their own Commands — `CommandId` accepts consumer ids,
   through `gantt.commands.register(...)` and `ctx.commands.register(...)`.
4. **Pickers do not become Commands.** A Command performs one named, argument-free action through
   `commands.run(id)`. Preset, snap and theme controls write live `Gantt` properties instead.
   Adding command arguments to fit one feature would weaken the registry.

The declaration that came with it:

```ts
type ToolbarControl =
  | { command: CommandId; label?: string }
  | { input: ToolbarInputId; label?: string; choices?: readonly ToolbarInputChoice[] }
  | { separator: true };

interface ToolbarChoiceInput {
  id: ToolbarInputId;
  label: string;
  choices: readonly { id: string; label: string }[];
  presentation?: 'select' | 'radio' | 'segmented';
  value(): string;
  setValue(id: string): void;
  subscribe(refresh: () => void): Disposer;
}
```

`ToolbarControl` is deliberately **not** `ToolbarItem` — `Item` already means derived timeline
geometry in this glossary, and one word may not carry two concepts (#7).

## Your job

The decision names three things it deliberately did not settle, and one it settled in a way that
deserves a second look before code exists. **Grill these five questions. Produce answers with
reasons, not options.**

### Q1 — the text input the decision deferred

The record says text input "stays out of decision; needs a real use case to settle commit,
validation, and refusal behavior", and that an opaque input id keeps the addition local.

Test that claim rather than accept it. A text input needs commit timing (per keystroke, on blur, on
Enter), validation, and a refusal path. **The library already answers all three for the Cell
editor** — `src/extensions/features/inline-editing.ts`, D-S5-19, D-S5-47, and #234's just-settled
refusal reporting. So either the toolbar reuses that answer, or the library grows a second one.

Ask: does `ToolbarChoiceInput`'s shape (`value()` / `setValue()` / `subscribe()`) extend to a text
input without breaking, or does deferring text input bake in a choice-only assumption that a later
author must undo? **If it bakes one in, say so now** — that is cheaper than discovering it later.

### Q2 — `subscribe(refresh)` against the reactivity the library already has

`ToolbarChoiceInput` gives each provider its own `subscribe(refresh: () => void): Disposer`.

`data/` already has a reactivity façade over `alien-signals` (`plans/04` §1 — one of exactly two
runtime dependencies, confined to one file), and the Gantt already emits `navigationChange`. The
decision itself notes snap and theme "need specific change events so external assignments refresh
the toolbar".

Ask: is `subscribe` a third notification mechanism beside the event map and the signals façade? If
it is, what stops the fourth? If a provider must hand-roll change detection for `gantt.snap` because
no event exists, is the right fix an event on the Gantt rather than a callback on the provider?
**Name the smaller surface.**

### Q3 — a missing provider: typed error, or silent omission?

The record says both — "the toolbar reports a typed configuration error for a missing provider" and
"the toolbar omits the control until the provider exists". Those are different behaviours and the
record does not say which wins when.

Ask: which, and why. Consider the plugin-lifetime case specifically, since registration follows the
existing stacked-registration rules: a consumer declares `{ input: 'snap' }`, then uninstalls the
plugin that provided it. The control was legal at declaration time and is not now. Throwing on a
live uninstall is hostile; silently emptying the toolbar is a mystery. **There may be a third answer.**

Cross-check against how the library already handles the same shape: `freegantt.discardCellEdit` is
registered as an inert command on a Gantt with no `inlineEditing()` precisely so
`commands.run(id)` does not throw (`src/view/core-commands.ts`, #231 F3). Does that precedent apply
here, and if not, why not?

### Q4 — the second-guess on pickers, stated fairly

The decision is settled and you are **not** overturning it. But record honestly what it costs, so
the next reader does not relitigate it from scratch.

A consumer who wants "set preset to `weekAndMonth`" on a **keyboard chord** cannot have it: chords
bind to Commands, Commands take no arguments, and preset is an input. So the toolbar can change the
preset and a keybinding cannot. D-S5-26 says a pointer affordance and its command land together,
one implementation and two entry points — and this is a pointer affordance with no command behind it.

Ask: is that gap real, is it acceptable, and is there a shape that closes it **without**
parameterised commands? One candidate to evaluate rather than assume: a fixed-action command per
choice (`freegantt.setPresetWeekAndMonth`), which keeps `run(id)` argument-free but multiplies ids.
Say whether that is better or worse than the gap.

### Q5 — the slot, against #224

The toolbar renders into a library-owned slot inside `.fg-container`. **#224 is separately proposing
that a popup layer arbitrate** between the tooltip and the context menu (recommendation on the table,
not yet ruled).

Ask: are these one concern or two? Both add a library-owned layer to `.fg-container`. Check
`src/view/styles.ts` and the existing overlay/row-layer split (#158, #168 — "Overlay and RowLayer are
one shape declared twice" was already a finding once). **If the toolbar slot and the popup layer
want to be one seam, say so before either is built.** This is the question most likely to save real
rework, so spend your time here.

## Ground rules for your answers

- **Call site first.** For every name you propose, write the invocation a consumer types and read it
  aloud. Publish that, not the signature.
- **One write shape, one knob.** If you find two ways to say one thing, that is a finding.
- **Deletion test.** For each piece of surface you keep, say what comes back if you delete it. If
  nothing comes back, it has not earned its place.
- **Vendor Gantt product names never appear** in specs, docs, or code.
- ASD-STE100: one meaning per word, active voice, ≤25-word sentences.

## What to produce

A written answer to Q1–Q5, each with its reasoning and the evidence (`file:line`) behind it. Where
you recommend a change to the settled declaration, state it as a recommendation to the repo owner
with the cost of *not* doing it — do not treat the settled parts as yours to change.

**Do not write code.** No source file changes. This is a design pass.

Post the result as a comment on #222 and say plainly which of Q1–Q5 you could not settle and why.

## Context budget

Keep your context under 300k tokens. Report usage in your final report. When you pass 200k, stop at
the next clean point and write what you have rather than starting new work.
