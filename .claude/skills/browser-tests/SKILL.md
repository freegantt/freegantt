---
name: browser-tests
description: Write a new Playwright/browser e2e test, or edit an existing one, in `e2e/`. Use also before you change `playwright.config.ts`.
---

# Browser test hygiene

Follow these five rules for every test in `e2e/`. They come from a flakiness audit of the existing suite.

## 1. Wait for a condition, not for time

Do not use `page.waitForTimeout()`. Use `expect.poll()`, or wait for a locator to reach a state (`toBeVisible()`, `not.toBe(previousValue)`).

A time-based wait passes on a fast machine and fails on a slow CI runner. It hides a real race instead of removing it.

## 2. Guard every `page.goto()`

After each `goto()`, wait for one real element to render before you read any DOM state:

```ts
await page.goto('/');
await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
```

The app loads through a `<script type="module">`. The module parses and runs after the browser's `load` event, so a bare `goto()` does not guarantee the app has rendered.

## 3. Do not hardcode fixture data in the test

Do not write a fixture value into a test: not a row name, not a row count, not an id.

Find the target at test time instead — for example, query the DOM for the last rendered row rather than naming it. A test written this way survives a fixture edit; a hardcoded one breaks on the next unrelated data change.

## 4. Read computed geometry, not a style string

Do not parse `style.transform` (or any style string) with a regex. Read the browser's own computed values instead: `getBoundingClientRect()`, `offsetWidth`, `offsetHeight`.

A regex over a style string breaks silently the moment the library changes how it expresses the same value (a second `translate`, a `matrix()`, a different unit).

## 5. Set retries in the config, not in the test

`playwright.config.ts` sets `retries`. Do not write a manual retry loop inside a test — that is a sign rule 1 or rule 2 was skipped.

## Checklist before you commit

- [ ] No `waitForTimeout` in the diff.
- [ ] Every `goto()` has a visibility guard right after it.
- [ ] No hardcoded fixture name, id, or row count.
- [ ] No regex over a `style` attribute.
- [ ] Any numeric tolerance (a pixel margin, a threshold) has a comment that states why that number.
