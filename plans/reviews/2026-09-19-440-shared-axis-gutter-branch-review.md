# Branch review — issue #440, PR #455

Branch: `Pawel-IT/issue-440-shared-axis-gutter` (base `origin/main`, one commit `604d2533`).
Reviewer: opencode. Scope: `git diff origin/main...HEAD`, plus the governing docs. No code changed.

## Verdict

The fix is sound and the mechanism is placed correctly. A pane's width is a CSS fact, so the
divergence goes at the CSS source (reserve the gutter on every pane of a shared axis) instead of
trading a visible gap for unreachable content by tightening `max`. That reasoning holds.

The branch has one real debt and several smaller ones: it changes the **documented resolved value**
of `ScrollAxis` and the **documented notification contract** (D-S1.5-4) without recording that
change. The tests pass; the spec now describes code that no longer exists.

Findings below. Severities: **High**, **Medium**, **Low**, **Info**.

---

## Answers to the six questions asked

**1. `max` left alone — is the reasoning right?** Yes. With equal-width panes the loosest bound and
the tightest bound become the same number, so the fix does not need to touch `max`. Without the
gutter, the overflowing pane is narrower and therefore has the *larger* local maximum
(`content − (pane − scrollbar)`). Choosing the tightest bound would cap the shared position at the
wider pane's maximum, and the narrow pane's last scrollbar-width of content would never reach its
left edge. Leaving `max` loosest keeps D-S1.5-1's designed fallback (short chart pins, tall chart
continues; S1.5 README U3) and deletes nothing. Correct.

**2. `bind` now notifies already-bound panes.** The contract wording still holds literally, because
`bindingCount` is now part of the resolved value and a bind always changes it. But the behavior the
old test pinned ("a bind that changes nothing notifies nobody else", S1.5 README §9) is now
unreachable, and the resolved value the contract is measured against is no longer the one written
in D-S1.5-4 / `plans/01` §8.2 / `CONTEXT.md`. The loop-breaker half of the contract is intact
(`bindingCount` does not move on render or on a ResizeObserver tick), so this is safe. **It needs a
recorded refinement** — see F1. Test narrowing itself is legitimate.

**3. `bindingCount` name and place.** The name is right: `CONTEXT.md` defines *Binding* as a Gantt's
contribution to a shared pure model, so a count of bindings is `bindingCount` (greppable, one
meaning). The doc comment is slightly wrong — it counts bindings, not Gantts (a single Gantt could
bind one axis twice if the caller passed the same instance as both `x` and `y`). The placement on
public `ScrollAxisState` is a deliberate public-API expansion for a `view/`-only need. It is honest
data and low harm, but no app author asked for it, and `ScrollAxisState` is documented as
`{position, max}`. Treat publishing it as a decision to record, not a free field — see F4.

**4. `reserveScrollbarGutter` every `render()` — I5?** Yes. It is a boolean compare against a
closure cache, no allocation, and a `classList.toggle` only when the boolean flips. I5's target is
the `applyState` hot path (hover/selection/drag preview), which this change does not touch;
`render()` is the frame build. The one effect worth naming is that adding the class shrinks
`clientWidth`, which fires the pane-size ResizeObserver and costs one extra bounded render — the
same "bounded at one extra pass" shape the S1.5 README already documents.

**5. e2e cannot reproduce the defect.** The width-equality assertions are vacuous under headless
Chromium's overlay scrollbars (they take no width, so the widths are equal with or without the fix).
The test does still discriminate on the mechanism: `getComputedStyle(...).scrollbarGutter` is
`'stable'` on both panes, so reverting the class or the CSS rule fails the test. What is untested is
the *outcome* — that classic scrollbars are equalized — which is a well-established CSS behavior but
a real gap. Not false-green, but narrower than the test name suggests; see F5.

**6. Harness re-derivation.** None found. `harness/scroll-sync.ts` only builds two `Dataset`s, one
shared `TimeScaleModel`, one `ScrollAxis`, and CSS heights; it computes no geometry the library
already computes. `fit: 'preset'` is required and already explained in the file (the default
`'pane'` makes `max.x` zero). Slice/heights are fixture setup, not a workaround. Clean.

---

## Findings

### F1 — Resolved value and notification contract changed; spec not updated — **Medium**

`ScrollAxisState` gained `bindingCount`, and `sameScrollAxisState` now compares it
(`src/layout/viewport/scroll-axis.ts:75`, `:121-129`). That is what makes a late-binding second
Gantt notify its already-mounted partner so both reserve the gutter. The behavior is correct and the
new test pins it (`src/layout/viewport/scroll-axis.test.ts:180-193`).

But every normative description of the resolved value still says `{position, max}`:

- `plans/s1.5-scroll-model/README.md:74` (resolved value), `:80` (refinement), `:318` (test list,
  still names "a bind that changes nothing notifies nobody else"), `:329`.
- `plans/01-domain-architecture.md:710`, `:712`, `:718`.
- `CONTEXT.md:382`.
- `plans/s6-scale-and-sync/README.md:170`, `:172`.
- `docs/architecture/classes.md:53`.

Recommendation: update those to the three-field resolved value and add one sentence to D-S1.5-4
(and its copies) stating that a bind changes the resolved value, so it notifies every bound pane —
deliberately, because a new neighbour changes whether each pane is shared. `etc/freegantt.api.md`
was updated; the prose was not.

### F2 — `bindingCount` counts bindings, but the doc says Gantts — **Low**

`src/layout/viewport/scroll-axis.ts:42-45` says "How many Gantts this direction currently serves."
It counts bindings. One Gantt contributes one binding per direction in every normal case, so the
sentence is true by accident; a caller who passes the same `ScrollAxis` as both `x` and `y` makes
it false, and then `bindingCount > 1` applies the gutter to a Gantt that shares with nobody. Reword
to "bindings", or note the assumption.

### F3 — The gutter is reserved for y-only sharing, where it does nothing — **Low**

`src/view/scroll-attachment.ts:74` applies the class when *either* axis has more than one binding.
`scrollbar-gutter` reserves inline (vertical-scrollbar) space, which is exactly the fix for a shared
**x** axis. A shared **y** axis misaligns panes through the bottom horizontal scrollbar changing
`clientHeight`, which this property cannot fix. So `#yonly-a`/`#yonly-b` (private x, shared y,
`harness/scroll-sync.ts:65-76`) now both reserve a 15px gutter for no benefit, shrinking their
timeline by 15px. Either narrow the condition to a shared x axis with a one-line reason, or state in
the comment why y-sharing also wants the gutter (it does not, on this mechanism). "Every pane on a
shared axis" is the branch's claim; the mechanism only earns it for x.

### F4 — New public field published for a `view/`-only need — **Low**

`ScrollAxisState` is public and app-facing (`scroll.state.position` is a documented app-author
call). `bindingCount` exists so `reserveScrollbarGutter` can tell whether a neighbour shares the
axis. Acceptable, but two things should be settled deliberately: (a) is this wanted on the
app-author surface at all, or should it be `@internal` (e.g. behind the existing `internals`
WeakMap or a `ScrollAxisBindingHandle` read) since only `view/` reads it; and (b) if it stays,
record the addition as a contract change rather than only regenerating `etc/freegantt.api.md`. The
doc comment pointing a public type at the private `reserveScrollbarGutter` is also a small
internals leak.

### F5 — The #440 e2e pins the mechanism, not the outcome — **Low**

`e2e/scroll-sync.spec.ts:218-262` states its own limit plainly, which is good. Still, the assertions
`clientWidth` equal and `maxScrollLeft` equal cannot fail under overlay scrollbars, so the test
named for the defect would pass even if `scrollbar-gutter` were a silent no-op (unsupported engine,
typo in the value). Consider one cheap guard that does not need classic scrollbars: assert the
computed `scrollbarGutter` value is exactly `stable` (already done) **and** that the stylesheet rule
is present through the production build (a unit test on the emitted CSS string, or reuse the
`index.html` check). If a real-engine check is wanted, gate it behind a flag and skip with a
recorded reason, so the gap is visible rather than implied by a green test name.

### F6 — Stale in-code comments from the same change — **Low**

- `src/layout/viewport/scroll-axis.ts:34-35` — "The resolved state — **both halves** of it" (now
  three fields).
- `src/layout/viewport/scroll-axis.ts:88` — "how to resolve `{position, max}`".
- `src/layout/viewport/scroll-attachment.ts:55-70` — the long comment is accurate and good, but it
  duplicates the same argument now in `harness/scroll-sync.ts:78-81` and `e2e/...:207-217`; three
  copies of one rationale will drift. Keep the canonical copy here and let the others point at it.

### F7 — `scrollbar-gutter` browser support — **Info**

Baseline support is recent enough to matter (Safari < 18.2 ignores the property). macOS overlay
scrollbars make that mostly moot, and this is progressive enhancement — if the property is ignored
the behavior falls back to today's loosest-`max` gap, which is no worse than shipping main. Worth a
one-line note in `docs/05-consumer-api.md` beside the class row so a reader does not assume the
guarantee is universal.

---

## What is right and should stay

- The decision to fix at the CSS source rather than tighten `max` (F1's counterpart on Q1).
- `reserveScrollbarGutter`'s cache-and-toggle shape and its placement beside `writePosition()` in
  `GanttShell.render()` (`src/view/gantt-shell.ts:2514`).
- The unit tests for count, late-join, and give-back
  (`src/view/scroll-attachment.test.ts:131-175`, `src/layout/viewport/scroll-axis.test.ts:164-205`).
- The honest e2e comment about overlay scrollbars.
- The harness pair adds no library re-derivation.

---

## Response, 2026-09-19

**F1 — fixed.** The refinement is recorded in `plans/s1.5-scroll-model/README.md` under D-S1.5-4, and
the resolved value now reads `{position, max, bindingCount}` in `CONTEXT.md`,
`plans/01-domain-architecture.md` (D-A and §8.2), `plans/s6-scale-and-sync/README.md` and
`docs/architecture/classes.md`. The §9 test list names the narrowed check.

**F2 — fixed.** The doc comment counts bindings and says so.

**F3 — fixed, and the review is right.** `scrollbar-gutter` reserves the inline-end gutter, which is
the vertical scrollbar's. Measured on this branch: `stable` moved `clientWidth` 990 → 975 and left
`clientHeight` at 240. So the condition is now a shared **x** axis only, with the measurement in the
comment, and a unit test pins that a y-only pair pays nothing. Two panes on a shared y axis can
still drift through a horizontal scrollbar; that is a different mechanism and this property does not
reach it.

**F4 — kept public, deliberately.** The count has to sit in the resolved value, because that is what
makes an arriving neighbour notify the panes already bound. Hiding it behind the `internals` WeakMap
would mean two state shapes — an internal one that drives notification and a public one that does
not — for a field that is honest on its own terms: how many charts share this axis is a question an
app author who passes a `ScrollAxis` to two Gantts can reasonably ask. Recorded as a contract change
under F1 rather than left to `etc/freegantt.api.md` alone.

**F5 — accepted as a known limit, not closed.** The `scrollbarGutter === 'stable'` assertion does
fail if the class or the CSS rule is reverted, so the mechanism is pinned. The outcome — classic
scrollbars actually equalized — cannot be staged in headless Chromium, and the spec comment says so
in the file rather than implying coverage by the test's name. `::-webkit-scrollbar` and
`--disable-features=OverlayScrollbar,FluentOverlayScrollbar` were both measured here and neither
brings classic scrollbars back.

**F6 — fixed.** `both halves` and `{position, max}` in `scroll-axis.ts` now describe three fields.
The rationale stays canonical in `scroll-attachment.ts`.

**F7 — noted in the Parts table.** `docs/05-consumer-api.md` says the class needs `scrollbar-gutter`
and states the fallback: an engine without it behaves as main does today.
