# Function: tooltips()

> **tooltips**(`options?`): [`ChromePlugin`](../type-aliases/ChromePlugin.md)

Defined in: extensions/features/tooltips.ts:63

D-S5-13: hover a bar, or focus it, and a popup shows the entry's name and dates. `role="img"`
 bars gain a real tabindex in S5.11's a11y pass. This plugin listens for `focusin`/`focusout`
 now, so it needs no change once they do. `focus: 'none'` (D-S5-9) — the pointer path never steals focus,
 and the keyboard path is `role="img"`'s own accessible label (`FrameBar.a11yLabel`, S5.11) rather
 than this popup. Content resolves through the `tooltip` renderer point (S5.4) via
 `ctx.view.resolveTooltipContent`, so a consumer's `tooltipRenderer` replaces the body with no change to
 the show/hide behaviour.

## Parameters

### options?

[`TooltipsOptions`](../interfaces/TooltipsOptions.md) = `{}`

## Returns

[`ChromePlugin`](../type-aliases/ChromePlugin.md)
