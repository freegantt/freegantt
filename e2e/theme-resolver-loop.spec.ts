import { test, expect } from '@playwright/test';

test('#433: a resolver must not re-enter itself through its own data-fg-theme write', async ({ page }) => {
  await page.goto('/zoom.html'); // exposes window.__gantt
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

test('#433: a throwing resolver must not re-enter itself through its own fallback write', async ({
  page,
}) => {
  await page.goto('/zoom.html'); // exposes window.__gantt
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const g = (window as unknown as { __gantt: { theme: unknown } }).__gantt;
        let count = 0;
        g.theme = () => {
          count++;
          throw new Error('boom');
        };
        setTimeout(() => resolve(count), 300);
      }),
  );
  console.log('RESOLVER CALLS FOR A THROWING RESOLVER:', calls);
  expect(calls).toBeLessThan(10);
});

test("#433: a resolver answering 'auto' must not re-enter itself through its own fallback write", async ({
  page,
}) => {
  await page.goto('/zoom.html'); // exposes window.__gantt
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const g = (window as unknown as { __gantt: { theme: unknown } }).__gantt;
        let count = 0;
        g.theme = () => {
          count++;
          return 'auto';
        };
        setTimeout(() => resolve(count), 300);
      }),
  );
  console.log("RESOLVER CALLS FOR A RESOLVER ANSWERING 'auto':", calls);
  expect(calls).toBeLessThan(10);
});
