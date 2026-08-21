#!/usr/bin/env node
// Vendor Gantt product names never appear in specs, docs, or code (CLAUDE.md, plans/01 §1 preamble).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Known vendor Gantt/PM product names to keep out of the codebase, case-insensitive.
const BANNED = [
  'dhtmlx',
  'bryntum',
  'syncfusion gantt',
  'jsgantt',
  'frappe gantt',
  'ms project',
  'microsoft project',
];

const SCAN_DIRS = ['src', 'harness', 'plans', 'docs', 'test', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
}

const SELF = path.relative(root, fileURLToPath(import.meta.url));

const files = [];
for (const dir of SCAN_DIRS) {
  const full = path.join(root, dir);
  try {
    walk(full, files);
  } catch {
    // directory doesn't exist yet — fine.
  }
}

const hits = [];
for (const file of files) {
  if (path.relative(root, file) === SELF) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lower = content.toLowerCase();
  for (const name of BANNED) {
    if (lower.includes(name)) {
      hits.push({ file: path.relative(root, file), name });
    }
  }
}

if (hits.length > 0) {
  console.error('vendor-names: banned vendor product names found:');
  for (const hit of hits) {
    console.error(`  ${hit.file}: "${hit.name}"`);
  }
  process.exit(1);
}

console.log(`vendor-names: clean (${files.length} files scanned).`);
