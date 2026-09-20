import { test, expect } from '@playwright/test';

// S1.5 README §7: the two cases happy-dom cannot express, because there `scrollTop` is a plain
// property that neither clamps nor fires an event — so both checks pass vacuously in
// src/view/scroll-attachment.test.ts. harness/scroll-sync.html mounts two Gantts sharing a
// ScrollAxis per direction: #tall has every fixture entry, #short has the first 20 (fewer rows ->
// a smaller max). A second pair, #xonly-a/#xonly-b, shares only the x ScrollAxis, and a third,
// #yonly-a/#yonly-b, shares only the y ScrollAxis (S6 R3, D-S6-1).
//
// The timeline pane is the native scroller (S1.8, D-D/D-S1.8-1) — `#tall`/`#short` themselves no
// longer scroll, so every read/write below targets each container's `.fg-timeline-pane` child.

async function scrollTops(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    tall: document.querySelector('#tall .fg-timeline-pane')!.scrollTop,
    short: document.querySelector('#short .fg-timeline-pane')!.scrollTop,
  }));
}

async function scrollPositions(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    tall: {
      x: document.querySelector('#tall .fg-timeline-pane')!.scrollLeft,
      y: document.querySelector('#tall .fg-timeline-pane')!.scrollTop,
    },
    short: {
      x: document.querySelector('#short .fg-timeline-pane')!.scrollLeft,
      y: document.querySelector('#short .fg-timeline-pane')!.scrollTop,
    },
  }));
}

test('a model-driven write does not feed back into another panTo (echo case, D-S1.5-6)', async ({ page }) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#tall .fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await scrollTops(page)).tall).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const tops = await scrollTops(page);
      return tops.short === tops.tall ? tops.short : -1;
    })
    .toBe(150);
  const first = await scrollTops(page);
  // #short has plenty of headroom at 150 (its own max is well over that), so it tracks exactly.
  expect(first.short).toBe(first.tall);

  // If the model-driven write into #short's element fed back into another panTo, the shared
  // position would keep nudging every settle tick. Poll for a few ticks and confirm it never
  // moves again after settling once.
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(await scrollTops(page)).toEqual(first);
  }
});

test('a shorter chart pins at its own max while the taller one keeps going, and resumes (U3)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#tall .fg-bar').first()).toBeVisible();

  const shortMax = await page.evaluate(() => {
    const el = document.querySelector('#short .fg-timeline-pane')!;
    return el.scrollHeight - el.clientHeight;
  });
  expect(shortMax).toBeGreaterThan(0);

  // Scroll #tall far past #short's max.
  await page.evaluate(() => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = 100_000;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await scrollTops(page)).short).toBe(shortMax);
  const pinned = await scrollTops(page);
  expect(pinned.tall).toBeGreaterThan(pinned.short);

  // Scroll back to a point under #short's max: it resumes tracking with zero remembered state.
  const resumeAt = Math.floor(shortMax / 2);
  await page.evaluate((y) => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = y;
    el.dispatchEvent(new Event('scroll'));
  }, resumeAt);
  await expect.poll(async () => (await scrollTops(page)).short).toBe(resumeAt);
  const resumed = await scrollTops(page);
  expect(resumed.tall).toBe(resumeAt);
});

test('[S1-A4] a scroll on #tall moves #short in x and y (D9, plans/00 §4 gate condition 2)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#tall .fg-bar').first()).toBeVisible();

  const before = await scrollPositions(page);

  await page.evaluate(() => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollLeft = 400;
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect.poll(async () => (await scrollPositions(page)).short.x).toBeGreaterThan(before.short.x);
  const after = await scrollPositions(page);
  expect(after.short.x).toBeGreaterThan(before.short.x);
  expect(after.short.y).toBeGreaterThan(before.short.y);
  expect(after.short).toEqual(after.tall);
});

// S6 R3 (plans/03-slices.md, D-S6-1): #xonly-a/#xonly-b share only the x ScrollAxis. A horizontal
// scroll on either moves both; a vertical scroll on one stays private, and neither pane's row-count
// -derived y max leaks into the other.
test('[S6-A3] two Gantts sharing only x move together in x and stay private in y (D-S6-1)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#xonly-a .fg-bar').first()).toBeVisible();

  async function xOnlyPositions() {
    return page.evaluate(() => ({
      a: {
        x: document.querySelector('#xonly-a .fg-timeline-pane')!.scrollLeft,
        y: document.querySelector('#xonly-a .fg-timeline-pane')!.scrollTop,
      },
      b: {
        x: document.querySelector('#xonly-b .fg-timeline-pane')!.scrollLeft,
        y: document.querySelector('#xonly-b .fg-timeline-pane')!.scrollTop,
      },
    }));
  }

  const before = await xOnlyPositions();

  // A horizontal scroll on #xonly-a reaches #xonly-b.
  await page.evaluate(() => {
    const el = document.querySelector('#xonly-a .fg-timeline-pane')!;
    el.scrollLeft = 400;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await xOnlyPositions()).b.x).toBeGreaterThan(before.b.x);
  const afterX = await xOnlyPositions();
  expect(afterX.a.x).toBe(afterX.b.x);

  // A vertical scroll on #xonly-a stays on #xonly-a: #xonly-b's y is untouched.
  await page.evaluate(() => {
    const el = document.querySelector('#xonly-a .fg-timeline-pane')!;
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await xOnlyPositions()).a.y).toBe(150);
  const afterY = await xOnlyPositions();
  expect(afterY.b.y).toBe(before.b.y);
});

// S6 R3 (plans/03-slices.md, D-S6-1): #yonly-a/#yonly-b share only the y ScrollAxis. A vertical
// scroll on either moves both; a horizontal scroll on one stays private.
test('[S6-A4] two Gantts sharing only y move together in y and stay private in x (D-S6-1)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#yonly-a .fg-bar').first()).toBeVisible();

  async function yOnlyPositions() {
    return page.evaluate(() => ({
      a: {
        x: document.querySelector('#yonly-a .fg-timeline-pane')!.scrollLeft,
        y: document.querySelector('#yonly-a .fg-timeline-pane')!.scrollTop,
      },
      b: {
        x: document.querySelector('#yonly-b .fg-timeline-pane')!.scrollLeft,
        y: document.querySelector('#yonly-b .fg-timeline-pane')!.scrollTop,
      },
    }));
  }

  const before = await yOnlyPositions();

  // A vertical scroll on #yonly-a reaches #yonly-b.
  await page.evaluate(() => {
    const el = document.querySelector('#yonly-a .fg-timeline-pane')!;
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await yOnlyPositions()).b.y).toBeGreaterThan(before.b.y);
  const afterY = await yOnlyPositions();
  expect(afterY.a.y).toBe(afterY.b.y);

  // A horizontal scroll on #yonly-a stays on #yonly-a: #yonly-b's x is untouched.
  await page.evaluate(() => {
    const el = document.querySelector('#yonly-a .fg-timeline-pane')!;
    el.scrollLeft = 400;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await yOnlyPositions()).a.x).toBeGreaterThan(before.a.x);
  const afterX = await yOnlyPositions();
  expect(afterX.b.x).toBe(before.b.x);
});

// #440: two Gantts on one x axis used to stop at different places on the right, because an
// `overflow: auto` pane that overflows vertically loses its scrollbar's width from `clientWidth`,
// and the narrower pane gets the larger maximum. Every pane on a shared axis now reserves the
// gutter, so the widths agree.
//
// Headless Chromium draws overlay scrollbars, which take no width, so it cannot stage the unequal
// widths the reporter sees — `::-webkit-scrollbar` and `--disable-features=OverlayScrollbar` were
// both measured here and neither brings classic scrollbars back. What this check does prove is the
// part that carries the fix: the gutter reaches both panes of a shared axis, their widths and
// maxima stay equal, and neither runs out before the other. The pane-width arithmetic itself lives
// in src/layout/viewport/scroll-axis.test.ts, where it needs no browser.
test('two panes on one x axis keep one width and one maximum (#440)', async ({ page }) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#gutter-a .fg-bar').first()).toBeVisible();
  await expect(page.locator('#gutter-b .fg-bar').first()).toBeVisible();

  function panes() {
    return page.evaluate(() => {
      function read(id: string) {
        const pane = document.querySelector(`#${id} .fg-timeline-pane`)!;
        return {
          clientWidth: pane.clientWidth,
          scrollLeft: pane.scrollLeft,
          maxScrollLeft: pane.scrollWidth - pane.clientWidth,
          contentHeight: pane.scrollHeight,
          paneHeight: pane.clientHeight,
          gutter: getComputedStyle(pane).scrollbarGutter,
        };
      }
      return { a: read('gutter-a'), b: read('gutter-b') };
    });
  }

  const before = await panes();

  // The fixture only means anything if the two panes disagree about vertical overflow.
  expect(before.a.contentHeight).toBeGreaterThan(before.a.paneHeight);
  expect(before.b.contentHeight).toBeLessThan(before.a.contentHeight / 2);

  // Both reserve the gutter: only #gutter-a shows a scrollbar, and both pay for one.
  expect(before.a.gutter).toBe('stable');
  expect(before.b.gutter).toBe('stable');
  expect(before.a.clientWidth).toBe(before.b.clientWidth);
  expect(before.a.maxScrollLeft).toBe(before.b.maxScrollLeft);

  // Drive the overflowing pane to the far right. Its partner reaches the same place.
  await page.evaluate(() => {
    const pane = document.querySelector('#gutter-a .fg-timeline-pane')!;
    pane.scrollLeft = pane.scrollWidth;
    pane.dispatchEvent(new Event('scroll'));
  });

  await expect.poll(async () => (await panes()).b.scrollLeft).toBeGreaterThan(0);
  const after = await panes();
  expect(after.a.scrollLeft).toBe(after.b.scrollLeft);
});

test('a Gantt that shares no axis keeps its whole pane width (#440)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const gutter = await page.evaluate(
    () => getComputedStyle(document.querySelector('.fg-timeline-pane')!).scrollbarGutter,
  );

  expect(gutter).toBe('auto');
});

// #436: #pane-fit-a/#pane-fit-b share only the x ScrollAxis, at `fit: 'pane'` (the default) — the
// one combination every pair above opts out of ("#436" comment in harness/scroll-sync.ts). At this
// fit, contentWidth === paneWidth by construction, so the shared ScrollAxis's own max is always 0:
// the only way #pane-fit-a and #pane-fit-b can never desync is if neither pane can natively scroll
// at all. A zero-length entry parked on the range's own end used to float a bar (and its label)
// past contentWidth and open a real, if small, native scroll range the axis could never see — this
// asserts that range stays exactly zero.
test('[timeline-content-width] two Gantts sharing an x ScrollAxis at fit: pane never open a native scroll range (#436)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#pane-fit-a .fg-bar').first()).toBeVisible();

  const panes = await page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector)!;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    };
    return { a: read('#pane-fit-a .fg-timeline-pane'), b: read('#pane-fit-b .fg-timeline-pane') };
  });
  expect(panes.a.scrollWidth).toBeLessThanOrEqual(panes.a.clientWidth);
  expect(panes.b.scrollWidth).toBeLessThanOrEqual(panes.b.clientWidth);
});
