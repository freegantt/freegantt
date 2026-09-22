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

The application resolves its own dark-mode signal and **pushes** the answer. The library never calls
back to ask, and never watches an attribute or a class it does not own. So the behaviour below is the
decided behaviour, and the workaround below is the supported answer.

`resolveTheme` reads two sources, and only two:

1. The nearest `data-fg-theme` pin, found by a `closest()` walk up from the container.
2. `prefers-color-scheme`, which is the operating system.

Applications do not use either. Tailwind, Filament and next-themes put `class="dark"` on
`<html>`. Bootstrap 5.3 uses `data-bs-theme="dark"`. FreeGantt sees none of these.

The result is not a small mismatch. A user on a light operating system who turns the application
dark gets a light Gantt on a dark page. The grid pane renders near-black text on a near-black
background, and the left rail becomes unreadable.

**The answer.** Mirror the application's signal onto `data-fg-theme` on any ancestor. One write at
the application root reaches every Gantt below it.

```js
document.documentElement.setAttribute('data-fg-theme', isDark ? 'dark' : 'light');
```

**Do not write a per-mount `MutationObserver` for this.** That path re-derives `resolvedTheme`,
`checkResolvedTheme` and `themeChange`, which the library already owns. It also leaks unless you
dispose it on `destroy()`.

---

## 2. Zoom does fire a change notification — on the `Gantt`, not on the `TimeScaleModel`

`zoomIn`, `zoomOut`, `zoomBy` and `zoomTo` all fire `navigationChange`. The notification reaches you
through the viewport binding, which fires on any resolved-scale change. The cause does not matter. 
A toolbar, a key binding, the wheel and a plugin all arrive the same way.

```js
gantt.on('navigationChange', ({ presetId, fit, canZoomIn, canZoomOut }) => { … });
```

**Why a reader misses it.** A consumer who shares one `TimeScaleModel` across two Gantts holds the
object that conceptually owns the zoom state. That object publishes no observer, and it never will:
`bindTimeScale` reaches the model's internals through a module-private `WeakMap` on purpose, so the
published type has nothing a consumer holding a `TimeScaleModel` could call.

So the reader searches the model, finds nothing, and concludes no notification exists. Ask the
`Gantt` instead. Either Gantt reports the shared scale, because both bind the same model.

**One real limit.** The `NavigationChange` payload carries `presetId`, `fit`, `canZoomIn` and
`canZoomOut`. It carries no time span. A zoom control built from presets has everything it needs. A
zoom control built from explicit `range` windows can detect that the user left its ladder, because
`fit` stops being the preset's. It cannot learn which window now shows without reading that back
itself. Test `fit` by shape, not by `typeof`: a zoom gesture writes a `number`, and a consumer
stating a tile width writes a `TimeUnitWidth` object.

**Do not shadow `freegantt.zoomIn` to learn that zoom happened.** Re-registering a command id is
legal and it works, but it is the wrong tool. Shadow a built-in to change what zoom *means*, never
to observe it.

---

## 3. A `barRenderer` paints nothing when every entry's variant already paints

The library now warns about this. A variant's own `paint` takes priority over the Gantt-wide
`barRenderer`. That precedence is deliberate and documented.

The failure mode is silence. An author assigns `barRenderer`, every entry resolves to a variant that
paints, and no bar changes. Nothing reports why.

The library now raises a `bar-renderer-shadowed` warning once per assigned function. Remove a
variant's `paint`, or move the renderer into the variants that need it.

**Known limit.** The check runs once per function identity, against `dataset.entries.all`. A variant
added *later*, which newly shadows an already-assigned `barRenderer`, is not detected again for that
same function. That false negative buys zero false positives.

---

## 4. `overscan` widens what the frame asks for, and nothing it widens paints past the content

`overscan` is public on the `Gantt`, as a constructor option and a live accessor pair.

`computeFrame` still derives its cull window from the visible pane plus `overscan.horizontalPx`, and
that window is still unclamped. **That part is the feature.** The buffer exists to pull in the tick
and the bar just off the edge, so a scroll of one pixel has them already built.

The consequence is now closed: the frame *painted* what the buffer
pulled in, past `[0, contentWidth)`, and a painted node past the content sizer widens the pane's own
native `scrollWidth`. Two Gantts on a shared `ScrollAxis` then disagreed about how far right the
timeline goes, because the axis binds `contentWidth` and the browser had measured something wider.

The fix clips output, not the window:

- A header band cell takes its intersection with `[0, contentWidth)` and is dropped at zero width.
- A tick line is a point, so it is kept only while `0 <= x < contentWidth`.
- A real duration bar is trimmed to its intersection, and reports `span: 'clipped'` rather than
  `'exact'` — `'exact'` promises the entry's own untouched start and end. A bar with no intersection
  at all is dropped, not shifted inward to a visible edge.

**What this means for you.** Tune `overscan` for how far ahead you want the frame built, and nothing
else. A larger buffer costs ticks and bars per frame. It no longer costs overflow, so you do not
need a consumer-side compensation, and `fit: 'pane'` no longer guarantees an overshoot.

---

## 5. A row click has no public event

This is a genuine gap. When built, the fix will be:
`entryActivate: { entry, cause: 'click' | 'dblclick' | 'key' }` on `GanttEventMap`.

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

The fix will add an activation event, fired from the view's own hit testing. It stays independent of
`selection` and of `capabilities.select`, and keeps the DOM contract internal. Promoting
`onDomEvent` and `targetUnder` onto `Gantt` was rejected: an app author must never need a plugin
port to get default behaviour.

Do not treat the hand-rolled version as a supported pattern.

---

## 6. `fit: 'pane'` scrolls instead of showing the whole dataset

This is an accepted limitation. `fit: 'pane'` fills the pane down to the preset's `minTickWidthPx` floor. Every `fit` mode floors
at the preset's `minTickWidthPx`, not just `'pane'`. A range wider than that floor scrolls. To see
more, choose a coarser preset — the library never picks one for you.

An integrator loading a three-year dataset on the `day` preset sees a timeline that scrolls, not
one that shrinks every day to fit. That is the floor at work, not a defect. The library never
coarsens a preset behind the caller's back. A silent switch would turn `gantt.preset` into a value
the library overwrites. A window resize would then relabel the axis without warning.

```ts
gantt.zoomOut(); // or:
gantt.preset = 'week'; // a coarser preset, chosen by you
```

---

## Related

- `docs/05-consumer-api.md` — the consumer API index.
- `docs/06-plugin-authoring.md` — the plugin surface, including `onDomEvent` and `targetUnder`.
