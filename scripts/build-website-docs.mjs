// Publishes `docs/` to the Docusaurus site, and checks the published copy is current.
//
// #221 moved the theming contract out of `plans/02` §4 into `docs/05-consumer-api.md` because two
// homes is how a doc drifts. The site migration (#355) then gave every one of those docs a second
// home under `website/docs/`, by hand. All 32 pairs diverged, and three root docs took an edit that
// never reached the published copy, so the site served a stale page while every gate stayed green.
//
// `docs/` is the source. `website/docs/guides/` and `website/docs/adr/` are output. The published
// copy is committed, not ignored, for the same reason `etc/freegantt.api.md` is: a reviewer reads
// the diff. `--check` fails when the committed output is behind, the way `pnpm api-report` does.
//
// A published page differs from its source in exactly two ways, and both are the site's, not the
// author's: Docusaurus needs frontmatter and takes the page title from it, and a relative link that
// leaves the published set has nowhere to land on the site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOB_BASE = 'https://github.com/Pawel-IT/FreeGantt/blob/main/';

// -------------------------------------------------------------------------------------------
// Which source doc lands where
// -------------------------------------------------------------------------------------------

/** The site path for one source doc, or `null` when the doc does not publish. */
function publishedPathFor(sourcePath) {
  const dir = path.posix.dirname(sourcePath);
  const file = path.posix.basename(sourcePath);
  if (dir === 'docs') {
    // `docs/04-hooks-and-ci.md` reads as `guides/hooks-and-ci` on the site: the number orders the
    // folder for a contributor, and the sidebar already carries that order for a reader.
    return `website/docs/guides/${file.replace(/^\d+-/, '')}`;
  }
  if (dir === 'docs/adr') {
    return `website/docs/adr/${file === 'README.md' ? 'index.md' : file}`;
  }
  // Everything else stays off the site. `docs/handoff/` is the only case today: a handoff names what
  // one pass left undone, for the next contributor, and it goes stale the moment someone acts on it.
  // A new guide publishes by being written — drop it in `docs/` and it appears.
  return null;
}

/** Every source doc that publishes, in a stable order. */
function sourceDocs() {
  const topLevel = fs
    .readdirSync(path.join(root, 'docs'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/${file}`);
  const records = fs
    .readdirSync(path.join(root, 'docs/adr'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/adr/${file}`);
  return [...topLevel, ...records].sort();
}

const publishedBySource = new Map(sourceDocs().map((source) => [source, publishedPathFor(source)]));

// -------------------------------------------------------------------------------------------
// The two transforms
// -------------------------------------------------------------------------------------------

const TITLE_HEADING = /^# (.+)$/m;

/** The page title — the source doc's own `# …` heading. */
function titleOf(text, sourcePath) {
  const heading = TITLE_HEADING.exec(text);
  if (!heading) throw new Error(`build-website-docs: ${sourcePath} has no "# " heading to title it`);
  return heading[1].trim();
}

/** The body with that heading gone: Docusaurus renders the title from frontmatter, so a body
 *  heading would print it twice. */
function withoutTitleHeading(text) {
  return text.replace(/^# .+\n\n?/m, '').replace(/^\n+/, '');
}

/** A YAML string literal — the title carries backticks, em dashes and apostrophes. */
function quote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const MARKDOWN_LINK = /\]\((?!https?:)([^)\s]+)\)/g;

// The export list and the site's reference pages are one artifact in two forms — api-extractor
// writes the file, TypeDoc writes the pages, both from `src/`. A doc that cites the file means the
// reference, so on the site it links to the reference a reader can already browse. The route is
// relative because the site publishes under a base path, and a leading slash would miss it.
const EXPORT_LIST = 'etc/freegantt.api.md';
const API_REFERENCE_ROUTE = 'website/docs/api/';

/** Every relative link, re-aimed at something the site can reach.
 *
 *  A link to a doc that also publishes becomes a link between two published pages. A link to
 *  anything else — `plans/`, `CONTEXT.md`, `README.md` — leaves the site, so it becomes the file on
 *  GitHub. An anchor-only link stays as it is; it never leaves the page. */
function rewriteLinks(text, sourcePath, publishedPath) {
  const sourceDir = path.posix.dirname(sourcePath);
  const publishedDir = path.posix.dirname(publishedPath);
  return text.replace(MARKDOWN_LINK, (whole, target) => {
    if (target.startsWith('#')) return whole;
    const [filePart, anchor] = splitAnchor(target);
    const resolved = path.posix.normalize(path.posix.join(sourceDir, filePart));
    if (resolved === EXPORT_LIST) {
      return `](${path.posix.relative(publishedDir, API_REFERENCE_ROUTE)}/${anchor})`;
    }
    const twin = publishedBySource.get(resolved);
    if (twin) return `](${path.posix.relative(publishedDir, twin)}${anchor})`;
    return `](${BLOB_BASE}${resolved}${anchor})`;
  });
}

function splitAnchor(target) {
  const hash = target.indexOf('#');
  return hash === -1 ? [target, ''] : [target.slice(0, hash), target.slice(hash)];
}

// -------------------------------------------------------------------------------------------
// Publishing
// -------------------------------------------------------------------------------------------

/** One source doc, as the site should serve it. */
function publish(sourcePath, publishedPath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const id = path.posix.basename(publishedPath, '.md');
  const frontMatter = `---\nid: ${id}\ntitle: ${quote(titleOf(source, sourcePath))}\n---\n\n`;
  return frontMatter + rewriteLinks(withoutTitleHeading(source), sourcePath, publishedPath);
}

const checking = process.argv.includes('--check');
const behind = [];
let written = 0;

for (const [sourcePath, publishedPath] of publishedBySource) {
  const wanted = publish(sourcePath, publishedPath);
  const target = path.join(root, publishedPath);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === wanted) continue;
  if (checking) {
    behind.push(`${publishedPath} is ${current === null ? 'missing' : 'behind'} ${sourcePath}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, wanted);
  written += 1;
}

// A page with no source is a second home nobody generates — the exact shape this script exists to
// end. It fails the check rather than being deleted, so the fix is a decision, not a surprise.
const published = new Set(publishedBySource.values());
const orphans = ['website/docs/guides', 'website/docs/adr'].flatMap((dir) =>
  fs
    .readdirSync(path.join(root, dir))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `${dir}/${file}`)
    .filter((file) => !published.has(file)),
);

if (checking) {
  const problems = [
    ...behind,
    ...orphans.map((file) => `${file} has no source under docs/ — give it one or delete it`),
  ];
  if (problems.length > 0) {
    console.error('check-website-docs FAILED — the published copy is not what docs/ says:\n');
    problems.forEach((problem) => console.error(`  ${problem}`));
    console.error('\nRun `pnpm docs:publish` and commit the result.');
    process.exit(1);
  }
  console.log(`check-website-docs PASS — ${publishedBySource.size} published pages match docs/.`);
} else {
  orphans.forEach((file) => console.warn(`warning: ${file} has no source under docs/`));
  console.log(`docs:publish — ${written} of ${publishedBySource.size} pages rewritten from docs/.`);
}
