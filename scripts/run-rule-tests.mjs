#!/usr/bin/env node
// Runs every eslint/rules/*.test.js RuleTester suite (docs/04-hooks-and-ci.md §4).

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rulesDir = path.join(root, 'eslint/rules');

const testFiles = readdirSync(rulesDir).filter((f) => f.endsWith('.test.cjs'));

let failed = false;
for (const file of testFiles) {
  try {
    await import(pathToFileURL(path.join(rulesDir, file)).href);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${file}`);
    console.error(err);
  }
}

if (failed) process.exit(1);
console.log(`run-rule-tests: ${testFiles.length} rule test files passed.`);
