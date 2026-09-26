/**
 * Rename a TypeScript symbol across a project, through the TypeScript language service.
 *
 * This is the call that powers rename in an editor and `textDocument/rename` over LSP. It
 * resolves symbols, so it follows re-exports, import aliases and `paths` mappings, and it never
 * touches a same-named word in a comment, a string or a compound identifier.
 *
 *   node <this-script> src/model/entry.ts Entry StoredEntry            # dry run
 *   node <this-script> src/model/entry.ts Entry StoredEntry --apply    # write
 *
 * Run it from the project root: the project's own `tsconfig.json` and `typescript` are read there.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [declFile, oldName, newName, ...flags] = process.argv.slice(2);
if (newName === undefined) {
  console.error('usage: rename-symbol.mjs <file-declaring-it> <OldName> <NewName> [--apply]');
  process.exit(2);
}
const apply = flags.includes('--apply');
const root = process.cwd();

/** The project's own TypeScript, not this script's. The skill folder has no node_modules. */
const ts = await (async () => {
  try {
    const require = createRequire(path.join(root, 'noop.js'));
    return (await import(pathToFileURL(require.resolve('typescript')).href)).default;
  } catch {
    console.error(`no 'typescript' installed at ${root} — run this from the project root`);
    process.exit(2);
  }
})();

const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error !== undefined) {
  console.error(`cannot read ${configPath}`);
  process.exit(2);
}
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);

const host = {
  getScriptFileNames: () => parsed.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (file) => {
    try {
      return ts.ScriptSnapshot.fromString(readFileSync(file, 'utf8'));
    } catch {
      return undefined;
    }
  },
  getCurrentDirectory: () => root,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

/** Where the name is declared. A rename starts from the declaration, never from a use site. */
function declarationOffset(file, name) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  let offset;
  const visit = (node) => {
    if (offset !== undefined) return;
    if (ts.isIdentifier(node) && node.text === name && node.parent?.name === node) {
      offset = node.getStart();
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offset;
}

const target = path.resolve(root, declFile);
const position = declarationOffset(target, oldName);
if (position === undefined) {
  console.error(`no declaration of '${oldName}' in ${declFile} — name the file that declares it`);
  process.exit(1);
}

const locations = service.findRenameLocations(target, position, false, false, {});
if (locations === undefined) {
  console.error(`the language service refuses to rename '${oldName}' at that position`);
  process.exit(1);
}

/** Group by file, then rewrite each file once, from the end, so earlier offsets stay valid. */
const spansByFile = new Map();
for (const location of locations) {
  const spans = spansByFile.get(location.fileName) ?? [];
  spans.push(location.textSpan);
  spansByFile.set(location.fileName, spans);
}

let skipped = 0;
for (const [file, spans] of spansByFile) {
  let text = readFileSync(file, 'utf8');
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    if (text.slice(span.start, span.start + span.length) !== oldName) {
      skipped++;
      continue;
    }
    text = text.slice(0, span.start) + newName + text.slice(span.start + span.length);
  }
  if (apply) writeFileSync(file, text);
}

console.log(
  `${apply ? 'renamed' : 'would rename'} ${locations.length} references to '${oldName}' ` +
    `in ${spansByFile.size} files`,
);
if (skipped > 0) console.log(`skipped ${skipped} spans that did not read '${oldName}'`);
if (!apply) {
  for (const [file, spans] of [...spansByFile].sort((a, b) => b[1].length - a[1].length).slice(0, 8))
    console.log(`  ${String(spans.length).padStart(4)}  ${path.relative(root, file)}`);
  console.log('  (dry run — pass --apply to write)');
}
