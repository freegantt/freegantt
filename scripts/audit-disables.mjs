#!/usr/bin/env node
// Guards against the easy path of resolving a guard failure by disabling the guard
// (docs/04-hooks-and-ci.md §2.2). Every disable comment in src/ must carry a reason.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, 'src');

const DISABLE_PATTERNS = [/eslint-disable/, /@ts-ignore\b/, /@ts-expect-error\b/, /depcruise-ignore/];
// A bare disable with no explanatory text after it is the thing we're catching.
const BARE = /(eslint-disable(?:-next-line|-line)?|@ts-ignore|@ts-expect-error)\s*(--|$)/;

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(full);
  }
}

const files = [];
try {
  walk(SRC, files);
} catch {
  console.log('disables: src/ does not exist yet, nothing to audit.');
  process.exit(0);
}

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (DISABLE_PATTERNS.some((p) => p.test(line)) && BARE.test(line.trim())) {
      violations.push(`${path.relative(root, file)}:${i + 1}: disable comment with no reason`);
    }
  });
}

if (violations.length > 0) {
  console.error('disables: unexplained lint/type disables found:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`disables: clean (${files.length} files audited).`);
