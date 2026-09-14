#!/usr/bin/env node
// Vendor Gantt product names never appear in specs, docs, or code (CLAUDE.md, plans/01 §1 preamble).
// Two exceptions, and both are the same reason: a decision record has to be checkable, and "a
// comparable Gantt does X" is not — a reader cannot verify it or weigh how far it generalizes.
//
//   1. An ADR may name them (ruled 2026-09-09) — `docs/adr/**` and `website/docs/adr/**` alike.
//   2. `plans/field-redesign/**` — an ADR's working material (ruled 2026-09-09). ADR 0011 split
//      into five on 2026-09-09, and the product survey those five cite lives in one shared file
//      rather than being copied into each. The survey is ADR evidence that happens to sit beside
//      the plans; it is not a spec, and no spec here states the survey behind a decision.
//
// Both exceptions are scoped to a path, never to a file name. A live spec — `plans/00`-`04`,
// `CONTEXT.md`, `CLAUDE.md`, and everything else under `plans/` — stays in scope.

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
  'primavera',
  'ganttpro',
];

const SCAN_DIRS = ['src', 'harness', 'plans', 'docs', 'test', 'scripts', 'website/docs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

// Paths that may name a vendor product: the ADRs, and the working material behind the field
// redesign's five ADRs. Read the header for why each one is out of scope.
const EVIDENCE_DIRS = [
  path.join('docs', 'adr'),
  path.join('website', 'docs', 'adr'),
  path.join('plans', 'field-redesign'),
  // TypeDoc generates this from `src/`, which this script already scans.
  path.join('website', 'docs', 'api'),
];

function statesEvidence(rel) {
  return EVIDENCE_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}${path.sep}`));
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statesEvidence(path.relative(root, full))) continue;
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
