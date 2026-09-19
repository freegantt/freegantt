# FreeGantt — Integration pitfalls

Every entry below is a question a real integrator asked. Each one cost hours, and each one had an
answer already in the tree. The pattern is always the same: the integrator looked at the object
they held, found nothing, and built a workaround.

A pitfall earns a place here when a correct API existed and a competent reader still missed it.
That makes it a documentation defect, not a user error. When the API was genuinely absent, the
entry says so and links the issue.

**Add to this file when an integration report turns out to be a misunderstanding.** A wrong report
is evidence about the surface, not noise. Record what the reader searched, so the next reader finds
the answer from the same starting point.

---

## 1. `theme: 'auto'` does not follow an application's own `dark` class

**Issue #433. Fix in flight — this section describes the shipped 0.1.0 behaviour.**

`resolveTheme` (`src/view/theme.ts:26-27`) reads two sources, and only two:

1. The nearest `data-fg-theme` pin, found by a `closest()` walk up from the container.
2. `prefers-color-scheme`, which is the operating system.

Applications do not use either. Tailwind, Filament and next-themes put `class="dark"` on
`<html>`. Bootstrap 5.3 uses `data-bs-theme="dark"`. FreeGantt sees none of these.

The result is not a small mismatch. A user on a light operating system who turns the application
dark gets a light Gantt on a dark page. The grid pane renders near-black text on a near-black
background, and the left rail becomes unreadable.

**What works today.** Mirror the application's signal onto `data-fg-theme` on any ancestor. One write at
the application root reaches every Gantt below it (#271).

```js
document.documentElement.setAttribute('data-fg-theme', isDark ? 'dark' : 'light');
```

**Do not write a per-mount `MutationObserver` for this.** That path re-derives `resolvedTheme`,
`checkResolvedTheme` and `themeChange`, which the library already owns. It also leaks unless you
dispose it on `destroy()`.

---

## 2. Zoom does fire a change notification — on the `Gantt`, not on the `TimeScaleModel`

**Issue #438. The reported premise was wrong. The discoverability defect is real.**

`zoomIn`, `zoomOut`, `zoomBy` and `zoomTo` all fire `navigationChange`. The notification reaches you
through the viewport binding (`src/view/gantt-shell.ts:838`), which fires on any resolved-scale
change. The cause does not matter. A toolbar, a key binding, the wheel and a plugin all arrive the
same way.

```js
gantt.on('navigationChange', ({ presetId, fit, canZoomIn, canZoomOut }) => { … });
```

Tests pin this at `src/api/gantt.test.ts:998` and `src/api/gantt.test.ts:7000`.

**Why a reader misses it.** A consumer who shares one `TimeScaleModel` across two Gantts holds the
object that conceptually owns the zoom state. That object publishes no observer, and it never will:
`bindTimeScale` reaches the model's internals through a module-private `WeakMap` on purpose, "so the
published type has nothing a consumer holding a `TimeScaleModel` could call" (ADR 0007, #84).

So the reader searches the model, finds nothing, and concludes no notification exists. Ask the
`Gantt` instead. Either Gantt reports the shared scale, because both bind the same model.

**One real limit.** The `NavigationChange` payload carries `presetId`, `fit`, `canZoomIn` and
`canZoomOut`. It carries no time span. A zoom control built from presets has everything it needs. A
zoom control built from explicit `range` windows can detect that the user left its ladder, because
`fit` becomes a number. It cannot learn which window now shows without reading that back itself.

**Do not shadow `freegantt.zoomIn` to learn that zoom happened.** Re-registering a command id is
legal and it works, but it is the wrong tool. Shadow a built-in to change what zoom *means*, never
to observe it.

---

## 3. A `barRenderer` paints nothing when every entry's variant already paints

**Issue #448. Fixed — the library now warns.**

`#paintFor` (`src/view/gantt-shell.ts:1363-1367`) resolves a variant's own `paint` first, and falls
back to the Gantt-wide `barRenderer` only when the variant supplies none. A variant outranks the
Gantt-wide renderer. That precedence is deliberate and documented (`src/api/gantt.ts:164`).

The failure mode is silence. An author assigns `barRenderer`, every entry resolves to a variant that
paints, and no bar changes. Nothing reports why.

The library now raises a `bar-renderer-shadowed` warning once per assigned function. Remove a
variant's `paint`, or move the renderer into the variants that need it.

**Known limit.** The check runs once per function identity, against `dataset.entries.all`. A variant
added *later*, which newly shadows an already-assigned `barRenderer`, is not detected again for that
same function. That false negative buys zero false positives.

---

## 4. `overscan` widens what the frame asks for, and the frame does not clamp it

**Issue #436. Open — fix queued. Read this before you tune `overscan`.**

`overscan` is public on the `Gantt`, as a constructor option and a live accessor pair. It landed in
`2051b57c` and it is **not** in `0.1.0`.

`buildFrame` derives its cull window from the visible pane plus `overscan.horizontalPx`
(`src/layout/frame.ts:460-461`), then hands that window to `scale.ticks()`. Nothing clamps the
window to `[0, contentWidth]`. `ticks()` honours the request literally, so it returns real ticks
outside the range, and the header paints them.

The severity scales with how far the pane exceeds the content:

| fit | content | pane | overscan | ticks for a 7-day range | right overflow |
|---|---|---|---|---|---|
| `'preset'` | 700 | 1224 | 128 | **16** | **700px** |
| `'pane'` | 1224 | 1224 | 128 | 9 | 175px |
| `'pane'` | 1224 | 1224 | 0 | 7 | 0 |

Under `fit: 'pane'`, `pxPerMs` is `width / spanMs` (`src/layout/viewport/time-scale-model.ts:256`).
So `contentWidth` equals the pane width by construction, and the window always overshoots. Pane-fit
does not merely allow this. Pane-fit guarantees it, and it is the *mild* case, because the overshoot
is capped at the overscan constant.

`ScrollAxis` binds the correct `contentWidth`, so `max` stays 0. The overflow is therefore clipped
and the user cannot scroll to it.

**Do not set `horizontalPx: 0` to work around this.** It looks free at pane-fit only, where there is
no horizontal scrolling for the buffer to smooth. At any zoom where the tick-width floor binds, the
content exceeds the pane, and the buffer does real work. Making the value conditional on which
constraint binds is consumer-side compensation for a library bug. Wait for the clamp.

**Measuring this from a browser under-reports it by about half.** Each affected frame also emits a
tick at negative `x`. Left-to-right layout clips that one, and `scrollWidth` never counts it.

---

## 5. A row click has no public event

**Issue #434. Open — a genuine gap, not a misunderstanding. Fix decided, not yet built:**
**`entryActivate: { entry, cause: 'click' | 'dblclick' | 'key' }` on `GanttEventMap`.**

"Click a row, open that thing" has no public path today. `GanttEventMap` declares no activation
event. `selectionChange` is the nearest thing and it is the wrong shape: selection is state that
survives the gesture, keyboard roving moves it, and `capabilities.select: false` switches it off
exactly where rows most need to be clickable.

The two correct ports exist, and both are plugin-only. `ctx.view.onDomEvent` gives one scoped,
auto-disposed listener that never answers another Gantt's events. `ctx.dom.targetUnder(node)`
resolves a node to `{ kind, element, entry?, field? }`. Neither is reachable from `Gantt`.

So a consumer hand-rolls `closest('.fg-row')` and `data-entry-id`, against class names that no
public export versions. A rename breaks that code with a green build. This is the exact retyping the
plugin seam was built to abolish.

The fix adds an activation event, fired from the view's own hit testing. It stays independent of
`selection` and of `capabilities.select`, and it keeps the DOM contract internal. Promoting
`onDomEvent` and `targetUnder` onto `Gantt` was rejected: an app author must never need a plugin
port to get default behaviour (`plans/02`, two callers and two surfaces).

Track #434. Do not treat the hand-rolled version as a supported pattern.

---

## Related

- `docs/05-consumer-api.md` — the consumer API index.
- `docs/06-plugin-authoring.md` — the plugin surface, including `onDomEvent` and `targetUnder`.
- `docs/04-hooks-and-ci.md` §7 — the contributor-side counterpart to this file.
