#!/usr/bin/env node
// plans/s5-extensibility-and-editing/s5.13-gallery-and-gate.md §1:
// documentation is prose about an API, and prose about an API rots. Every fenced `ts` block in
// `README.md` and in `docs/` is extracted and typechecked here against the BUILT package types —
// `dist/api/index.d.ts`, resolved through package.json's own sealed `exports` map, the way a third
// party's `import ... from 'freegantt'` resolves it. Never against `src/`: a guide that only
// compiles against internals is a guide that lies to the reader who actually installs the package.
//
// Three things fail this check, and all three must:
//   1. An example that no longer compiles — the guide names an API that moved.
//   2. An example that reaches a private path — `src/extensions/**` proves the dogfood rule for
//      shipped code; this proves it for the documentation a third party actually copies.
//   3. An excerpt that cites a file which is not there — see `titlePattern` below for why a
//      quotation is the one fence this script does not compile, and why its citation is checked.
//
// `guard-red-test` posture (docs/04-hooks-and-ci.md §4): "a guard with no failing fixture is presumed
// broken." `runRedTest` below runs three fixtures built to fail — a broken example, a private import
// and a dead citation — and exits nonzero itself if any one of them is accepted, before this script
// ever looks at the real guides.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distTypesPath = path.join(root, 'dist/api/index.d.ts');
const tsc = path.join(root, 'node_modules/.bin/tsc');

/** Which folders hold prose that makes a checkable claim about the API. Everything below them is
 *  read, so a new guide is checked the day someone writes it — there is no list to join and no way
 *  to write an unchecked example by forgetting one. */
const guideRoots = ['README.md', 'docs'];

/** Why `docs/adr/` is out of scope: an ADR records a decision on the day it was made, including the
 *  superseded ones (ADR 0010 still shows `SegmentId`). Its samples describe the API of that day on
 *  purpose, so compiling them against today's types would ask history to change its mind. The
 *  retired-word guard (`test/guards/retired-words.test.ts`) skips the folder for the same reason. */
const historyFolder = path.join(root, 'docs/adr');

/** Every Markdown file under `guideRoots`, ADRs excluded, in a stable order. */
function findGuides() {
  const found = [];
  const walk = (dir) => {
    if (dir === historyFolder) return;
    for (const child of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(dir, child.name);
      if (child.isDirectory()) walk(full);
      else if (child.name.endsWith('.md')) found.push(full);
    }
  };
  for (const entry of guideRoots) {
    const full = path.join(root, entry);
    if (!existsSync(full)) {
      console.error(`check-doc-examples: ${entry} does not exist.`);
      process.exit(1);
    }
    if (entry.endsWith('.md')) found.push(full);
    else walk(full);
  }
  return found;
}

/** What gives a fragment its context. A guide's examples are written for a reader, so most of them
 *  say `dataset.undo()` rather than re-building a Dataset first. A setup comment supplies the
 *  declarations those lines stand on:
 *
 *      <!-- doc-example-setup
 *      declare const dataset: import('freegantt').Dataset;
 *      -->
 *
 *  It is an HTML comment, so it renders as nothing, and it holds for every example on that page. The
 *  declarations land in an ambient `.d.ts` beside the examples rather than inside each one, which is
 *  what lets one page both *use* `dataset` in one example and *build* its own in the next: a module's
 *  own `const` shadows the ambient name instead of colliding with it. Write `import('freegantt')`
 *  inline, as above — a top-level `import` would make the file a module and the names local to it.
 *  Each page compiles alone, so one page's setup never quietly satisfies another page's example. */
const setupPattern = '<!--\\s*doc-example-setup\\n([\\s\\S]*?)-->';

/** What separates an example from a quotation. A bare ` ```ts ` fence is an example: code a reader
 *  may copy, so it compiles against the published types. A fence that carries
 *  ` ```ts title="src/…" ` is an excerpt of that file, quoted to explain a mechanism — class bodies
 *  and object fragments that were never a module and cannot compile alone. Docusaurus prints the
 *  title above the block, so the reader sees where the code came from, and `checkExcerpt` below
 *  fails when the named file does not exist. That keeps the title a citation rather than a way to
 *  silence this check. */
const titlePattern = /title="([^"]+)"/;

/** One page, read: its setup, the examples to compile, and the excerpts to verify. Each example
 *  compiles as its own module — `export {}` closes it — and remembers the Markdown line its first
 *  code line occupies, so a failure names the line the writer has to open. */
function readGuide(guidePath) {
  const markdown = readFileSync(guidePath, 'utf8');
  const lineAt = (index) => markdown.slice(0, index).split('\n').length;

  const setupFence = new RegExp(setupPattern, 'g');
  let setup = '';
  let setupMatch;
  while ((setupMatch = setupFence.exec(markdown)) !== null) {
    setup += setupMatch[1];
  }

  const fence = /^```ts([^\n]*)\n([\s\S]*?)^```/gm;
  const examples = [];
  const excerpts = [];
  let match;
  while ((match = fence.exec(markdown)) !== null) {
    const at = { guidePath, firstCodeLine: lineAt(match.index) + 1 };
    const meta = match[1].trim();
    if (meta !== '') excerpts.push({ ...at, meta });
    else examples.push({ ...at, code: match[2] });
  }
  return { guidePath, setup, examples, excerpts };
}

/** The citation an excerpt's fence makes, checked. Returns the complaint to print, or `undefined`. */
function checkExcerpt(excerpt) {
  const where = `${path.relative(root, excerpt.guidePath)}:${excerpt.firstCodeLine - 1}`;
  const title = titlePattern.exec(excerpt.meta);
  if (title === null) {
    return `${where} — a ts fence with \`${excerpt.meta}\` is neither an example nor a citation. Drop the meta to have it typechecked, or name the file it quotes with title="…".`;
  }
  if (!existsSync(path.join(root, title[1]))) {
    return `${where} — the excerpt cites \`${title[1]}\`, which does not exist. An excerpt names the file it was copied from.`;
  }
  return undefined;
}

/** Writes one guide's examples as sibling `.ts` files in a fresh temp package, resolving the bare
 *  specifier `'freegantt'` through a `node_modules/freegantt` symlink to this repo's own root — the
 *  same resolution `npm install freegantt` gives a real consumer, and the reason this never points at
 *  `src/`. Returns `{ ok, output }` with every tsc line rewritten back to the guide and the line the
 *  reader would open. The temp directory is always removed. */
function typecheckGuide(guide) {
  if (!existsSync(distTypesPath)) {
    console.error('check-doc-examples: dist/api/index.d.ts is missing. Run `pnpm build` first.');
    process.exit(1);
  }
  const sources = new Map(guide.examples.map((example, index) => [`example-${index + 1}.ts`, example]));
  const workDir = mkdtempSync(path.join(tmpdir(), 'freegantt-doc-examples-'));
  try {
    mkdirSync(path.join(workDir, 'node_modules'));
    symlinkSync(root, path.join(workDir, 'node_modules', 'freegantt'), 'dir');

    for (const [fileName, example] of sources) {
      writeFileSync(path.join(workDir, fileName), `${example.code}\nexport {};\n`);
    }
    writeFileSync(path.join(workDir, setupFileName), guide.setup);

    writeFileSync(
      path.join(workDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['ES2022', 'DOM'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            isolatedModules: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: [setupFileName, ...sources.keys()],
        },
        null,
        2,
      ),
    );

    execFileSync(tsc, ['--noEmit', '-p', 'tsconfig.json'], { cwd: workDir, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    const raw = (error.stdout ?? error.message ?? '').toString();
    return { ok: false, output: rewriteToGuide(raw, sources) };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const setupFileName = 'doc-example-setup.d.ts';

/** Turns `example-7.ts(12,5): error TS2304: …` into `docs/05-consumer-api.md:66:5 — error TS2304: …`,
 *  so a failing run names the line the writer has to open rather than a temp file that is gone. A
 *  complaint about the setup file itself is left as it is: its text is in the guide's own comment. */
function rewriteToGuide(output, sources) {
  return output
    .split('\n')
    .map((line) => {
      const match = /^(example-\d+\.ts)\((\d+),(\d+)\):\s*(.*)$/.exec(line);
      if (match === null) return line;
      const example = sources.get(match[1]);
      if (example === undefined) return line;
      const guideName = path.relative(root, example.guidePath);
      return `${guideName}:${example.firstCodeLine + Number(match[2]) - 1}:${match[3]} — ${match[4]}`;
    })
    .join('\n');
}

/** The fixture that proves this checker actually rejects a bad example. One block fails to compile;
 *  one reaches past the sealed `exports` map into a path only `src/` can see. Neither is a shipped
 *  guide — both are written here, on purpose, so the check that watches the guides is itself watched. */
function runRedTest() {
  const brokenExample = [
    "import { Dataset } from 'freegantt';",
    '',
    'const dataset = new Dataset({ entries: [] });',
    '// Deliberate type error: Dataset is not assignable to number.',
    'const notANumber: number = dataset;',
    'export { notANumber };',
    '',
  ].join('\n');
  const privateImport = [
    "import { ensureBaseStyles } from 'freegantt/dist/view/styles.js';",
    '',
    '// Deliberate private-path reach: only "." is in the published exports map.',
    'export { ensureBaseStyles };',
    '',
  ].join('\n');

  const result = typecheckGuide({
    guidePath: path.join(root, 'red-test.md'),
    setup: '',
    examples: [brokenExample, privateImport].map((code) => ({
      guidePath: path.join(root, 'red-test.md'),
      code,
      firstCodeLine: 1,
    })),
  });
  if (result.ok) {
    console.error(
      'check-doc-examples: RED TEST FAILED — a broken example and a private-path import both ' +
        'typechecked clean. The checker is not actually checking anything. Fix it before trusting a ' +
        'green run on the real guides.',
    );
    process.exit(1);
  }
  const uncited = checkExcerpt({
    guidePath: path.join(root, 'red-test.md'),
    firstCodeLine: 2,
    meta: 'title="src/this-file-was-deleted.ts"',
  });
  if (uncited === undefined) {
    console.error(
      'check-doc-examples: RED TEST FAILED — an excerpt citing a file that does not exist was ' +
        'accepted. A title would then be a way to silence this check.',
    );
    process.exit(1);
  }
  console.log(
    'check-doc-examples: red test — a broken example, a private import and a dead citation were all ' +
      'rejected, as expected.',
  );
}

runRedTest();

const guides = findGuides().map(readGuide);

const complaints = guides.flatMap((guide) =>
  guide.excerpts.map(checkExcerpt).filter((complaint) => complaint !== undefined),
);
if (complaints.length > 0) {
  console.error(`check-doc-examples: ${complaints.length} ts fence(s) cite a file badly:\n`);
  console.error(complaints.join('\n'));
  process.exit(1);
}

const checkedGuides = guides.filter((guide) => guide.examples.length > 0);
if (checkedGuides.length === 0) {
  console.error('check-doc-examples: no fenced ts blocks were found. The extractor is broken.');
  process.exit(1);
}

let failed = false;
let checkedCount = 0;
for (const guide of checkedGuides) {
  const guideName = path.relative(root, guide.guidePath);
  const result = typecheckGuide(guide);
  if (result.ok) {
    checkedCount += guide.examples.length;
    console.log(`check-doc-examples: all ${guide.examples.length} example(s) in ${guideName} typecheck.`);
    continue;
  }
  failed = true;
  console.error(
    `check-doc-examples: ${guide.examples.length} example(s) in ${guideName}, one or more failed:\n`,
  );
  console.error(result.output);
}

if (failed) process.exit(1);

console.log(
  `check-doc-examples: ${checkedCount} example(s) across ${checkedGuides.length} guide(s) ` +
    'typecheck against the built package types.',
);
