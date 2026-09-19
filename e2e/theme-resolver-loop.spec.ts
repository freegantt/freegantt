import { test, expect } from '@playwright/test';

test('#433: a resolver must not re-enter itself through its own data-fg-theme write', async ({ page }) => {
  await page.goto('/harness/zoom.html'); // exposes window.__gantt
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const g = (window as unknown as { __gantt: { theme: unknown } }).__gantt;
        let count = 0;
        g.theme = () => {
          count++;
          return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        };
        count = 0; // ignore the assignment's own synchronous reads
        document.documentElement.classList.add('dark'); // the wrapping app's flip a resolver exists to catch
        setTimeout(() => resolve(count), 300);
      }),
  );
  console.log('RESOLVER CALLS AFTER ONE CLASS FLIP:', calls);
  expect(calls).toBeLessThan(10);
});
