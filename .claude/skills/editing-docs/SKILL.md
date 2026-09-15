---
name: editing-docs
description: How this repo publishes docs. Use before you add, edit, move, or delete any Markdown file under docs/ or website/.
---

# Editing Docs

`docs/` is the source. The site under `website/docs/` is output.

## Rules

1. Write the change in `docs/` only. A new guide publishes by being written: put the file in `docs/`, and it appears on the site.
2. Never edit a file under `website/`. `website/docs/guides/` and `website/docs/adr/` are generated, and a hand edit is lost on the next publish. Other pages there are the site's own; ask the user before you touch them.
3. Run `pnpm docs:publish` after each change under `docs/`. It rewrites the published copy.
4. Commit the source and the published copy together. Both are in git, so a reviewer reads the diff.

## Two limits from the publisher

- A relative link must stay inside the published set. A link to `plans/` or to `src/` becomes a GitHub blob URL. A link to a site-only page has nowhere to land, so name that page in prose.
- Docusaurus takes the page title from the `# …` heading. Give each doc one.

## The gate

`pnpm verify` runs `pnpm docs:published-is-current`. It fails when the published copy is behind. Run `pnpm docs:publish` to fix it.

Read `scripts/build-website-docs.mjs` when you need the full mapping.
