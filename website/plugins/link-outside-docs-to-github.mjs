// Docusaurus resolves a relative link between two published pages by itself. It cannot resolve a
// link that leaves `docs/` — `plans/`, `CONTEXT.md`, `README.md` — because no page there exists, and
// `onBrokenLinks: 'throw'` then fails the build. This re-aims those links at the file on GitHub.
//
// It runs in `beforeDefaultRemarkPlugins`, so it reads the link the author wrote, before Docusaurus
// rewrites the ones it owns.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const BLOB_BASE = 'https://github.com/Pawel-IT/FreeGantt/blob/main/';

// TypeDoc writes the reference from `src/`, and `etc/freegantt.api.md` is the same export list in
// one file. A doc that cites the file means the reference, so the site sends a reader there.
const EXPORT_LIST = path.join(REPO_ROOT, 'etc', 'freegantt.api.md');
const API_REFERENCE_ROUTE = '/api/';

/** Every link node in the tree, whatever its depth. */
function eachLink(node, visit) {
  if (node.type === 'link') visit(node);
  for (const child of node.children ?? []) eachLink(child, visit);
}

function splitAnchor(target) {
  const hash = target.indexOf('#');
  return hash === -1 ? [target, ''] : [target.slice(0, hash), target.slice(hash)];
}

/** True when the site publishes a page for this file, so Docusaurus owns the link. */
function siteServes(resolved) {
  return resolved === DOCS_DIR || resolved.startsWith(DOCS_DIR + path.sep);
}

export default function linkOutsideDocsToGitHub() {
  return (tree, file) => {
    const sourceDir = path.dirname(file.path);
    eachLink(tree, (link) => {
      const target = link.url;
      if (!target) return;
      // An absolute URL, a site-absolute path and a bare anchor all already land.
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('/')) return;

      const [filePart, anchor] = splitAnchor(target);
      if (!filePart) return;

      const resolved = path.resolve(sourceDir, filePart);
      if (resolved === EXPORT_LIST) {
        link.url = `${API_REFERENCE_ROUTE}${anchor}`;
        return;
      }
      if (siteServes(resolved)) return;

      link.url = BLOB_BASE + path.relative(REPO_ROOT, resolved).split(path.sep).join('/') + anchor;
    });
  };
}
