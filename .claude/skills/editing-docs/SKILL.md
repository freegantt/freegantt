---
name: editing-docs
description: How this repo publishes docs. Use before you add, edit, move, or delete any Markdown file under docs/ or website/.
---

# Editing Docs

`docs/` is the source. Everything the site serves under `website/docs/` is copied from there.

| Source                   | Published to                                     |
| ------------------------ | ------------------------------------------------ |
| `docs/*.md`              | `website/docs/guides/` — the number prefix drops |
| `docs/adr/*.md`          | `website/docs/adr/`                              |
| `docs/architecture/*.md` | `website/docs/architecture/`                     |

`website/docs/api/` is the one exception. TypeDoc writes it from `src/`, so it has no source in `docs/`.

## Rules

1. Write the change in `docs/` only. A page publishes by being written: put the file in `docs/`, and it appears on the site.
2. Never edit a page under `website/docs/`. Every one is output, and a hand edit is lost on the next publish.
3. Run `pnpm docs:publish` after each change under `docs/`. It rewrites the published copy.
4. Commit the source and the published copy together. Both are in git, so a reviewer reads the diff.

## Two limits from the publisher

- A relative link must stay inside the published set. A link to `plans/`, `CONTEXT.md` or `README.md` becomes a GitHub blob URL, and a link to `etc/freegantt.api.md` becomes the API reference. Write a real relative path, never a site route like `/guides/consumer-api`.
- Docusaurus takes the page title from the `# …` heading. Give each doc one, and no frontmatter — the publisher writes that.

## The architecture pages

`docs/architecture/` is prose about what `src/` does now. Read `docs/architecture/maintaining.md` before you edit one. It says which page to update for each file you change.

Its `files.md` inventory is not generated — the "what it is for" column is prose a person writes after reading the file. `test/guards/file-inventory.test.ts` holds it true instead: the test fails when `src/` gains a file the page omits, when a row points at a deleted file, or when a row credits a file with an export it does not contain. `pnpm guards` runs it, and `pnpm verify` runs that. Do not build a second checker for it.

## The gate

`pnpm verify` runs `pnpm docs:published-is-current`. It fails when the published copy is behind, and it fails when a page under `website/docs/` has no source. Run `pnpm docs:publish` to fix both.

Read `scripts/build-website-docs.mjs` when you need the full mapping.
