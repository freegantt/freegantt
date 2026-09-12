import { test, expect } from '@playwright/test';

// T1-1: --fg-bar-fill-painted used to resolve once on .fg-container, so a bar's own --fg-bar-fill
// override (barRenderer's style, e.g. harness/plugins.ts's milestone recolor) never reached the
// bar's painted background — the custom property changed, but the mixed colour did not. The fix
// moves the color-mix() onto .fg-bar itself.
//
// color-mix() serializes differently across engines, so this never asserts a literal colour. It
// asks the browser for the mix it would build with the bar's own --fg-bar-fill and --fg-bar-opacity
// (both readable off the bar today, override or not — only the painted mix was stuck) and compares
// that, as a computed colour, against the bar's own computed background-color.
test('a bar with its own --fg-bar-fill override paints that colour, not the container default (T1-1)', async ({
  page,
}) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const milestoneBar = page.locator('#gantt .fg-bar.fg-bar-diamond');
  await expect(milestoneBar).toBeVisible();

  const { paintedColor, expectedColor } = await milestoneBar.evaluate((bar) => {
    // The diamond shape paints on .fg-bar-diamond::before (ADR 0022, diamond()'s own `css`), and
    // the bar element's own background stays transparent so the diamond can rotate past the bar's
    // box. Read the pseudo-element's computed style, the one --fg-bar-fill-painted reaches.
    const beforeStyle = getComputedStyle(bar, '::before');
    const fill = beforeStyle.getPropertyValue('--fg-bar-fill').trim();
    const opacity = beforeStyle.getPropertyValue('--fg-bar-opacity').trim();

    // An independent oracle: the same color-mix() formula the stylesheet uses for
    // --fg-bar-fill-painted, built from values read straight off the pseudo-element's own computed
    // style rather than the container's — never a hand-written literal colour.
    const probe = document.createElement('div');
    probe.style.background = `color-mix(in oklch, ${fill} calc(${opacity} * 100%), transparent)`;
    bar.parentElement!.appendChild(probe);
    const expectedColor = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return { paintedColor: beforeStyle.backgroundColor, expectedColor };
  });

  expect(paintedColor).toBe(expectedColor);
});
