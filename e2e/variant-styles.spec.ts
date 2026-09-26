import { test, expect } from '@playwright/test';

// ADR 0022 §5: a variant's own `css` lands in one `<style data-freegantt-variant-styles>` node
// per Gantt, after the base sheet, inside `@layer freegantt`. Two claims only a real cascade can
// prove — happy-dom's CSSOM does not parse `@layer`, so a unit test cannot resolve either one:
//
//   1. A variant's rule beats the base sheet's own rule for the same element at equal specificity,
//      because the variant's node is later in the same layer (ADR 0022 §5).
//   2. An unlayered consumer rule still beats the variant's, at any specificity (ADR 0021).
//
// `window.__gantt` (harness/main.ts) already exposes a live `Gantt`, so this installs its own throw-
// away variant through the public `variants` setter — no harness source file changes, and no
// dependence on `diamond()`/`summary()` being installed anywhere (unit G's job, not this one's).
declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

test('a variant’s own css beats the base sheet, and an unlayered consumer rule still beats the variant’s', async ({
  page,
}) => {
  await page.goto('/generic.html');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary):not(.fg-bar-diamond)').first();
  await expect(bar).toBeVisible();

  const baseColor = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);

  // 1. The variant's own rule, inside @layer freegantt (variant-styles.ts wraps it), cancels the
  // base sheet's `.fg-bar` background at equal specificity because it lands after it.
  await page.evaluate(() => {
    window.__gantt.variants = [
      { name: 'probe', when: () => true, css: '.fg-bar { background-color: rgb(1, 2, 3); }' },
    ];
  });
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(1, 2, 3)');
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(baseColor);

  // 2. An ordinary, unlayered page rule still wins over the variant's own — ADR 0021 holds even once
  // a variant contributes its own layered rule.
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.fg-bar { background-color: rgb(4, 5, 6); }';
    document.head.append(style);
  });
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(4, 5, 6)');
});
