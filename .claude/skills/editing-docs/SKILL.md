---
name: editing-docs
description: How this repo publishes docs. Use before you add, edit, move, or delete any Markdown file under docs/ or website/.
---

# Editing Docs

`docs/` is the source. The site under `website/docs/` is output.

## Rules

1. Write the change in `docs/` only. A new guide publishes by being written: put the file in `docs/`, and it appears on the site.
2. Never edit `website/docs/guides/` or `website/docs/adr/`. Both are generated, and a hand edit is lost on the next publish.
3. Run `pnpm docs:publish` after each change under `docs/`. It rewrites the published copy.
4. Commit the source and the published copy together. Both are in git, so a reviewer reads the diff.

## The one hand-written folder

`website/docs/architecture/` has no source in `docs/`. It is prose about what `src/` does now, and it is written on the site. Read `website/docs/architecture/maintaining.md` before you edit a page there. It says which page to update for each file you change.

Its `files.md` inventory is not generated — the "what it is for" column is prose. `test/guards/file-inventory.test.ts` holds it true instead: the test fails when `src/` gains a file the page omits, keeps a row for a deleted file, or credits a file with an export it does not contain. `pnpm guards` runs it, and `pnpm verify` runs that.

## Two limits from the publisher

- A relative link must stay inside the published set. A link to `plans/` or to `src/` becomes a GitHub blob URL. A link to a site-only page has nowhere to land, so name that page in prose.
- Docusaurus takes the page title from the `# …` heading. Give each doc one.

## The gate

`pnpm verify` runs `pnpm docs:published-is-current`. It fails when the published copy is behind. Run `pnpm docs:publish` to fix it.

Read `scripts/build-website-docs.mjs` when you need the full mapping.
