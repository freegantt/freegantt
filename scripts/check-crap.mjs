#!/usr/bin/env node
// CRAP (Change Risk Anti-Patterns) over production functions in `src/`. All of that code is
// agent-written, so a ceiling on "hard to change and untested" is a machine check, not a review
// memory. Formula: complexity² × (1 − coverage)³ + complexity.
//
// Back-off lives in `crap.json`. `"metric": "crap"` needs a coverage JSON and scores CRAP.
// `"metric": "complexity"` drops coverage and scores McCabe cyclomatic complexity only. One field
// is the whole switch. Threshold is the number for the active metric, not both at once.
//
// Complexity matches ESLint's classic `complexity` rule: one path to start, then one more for each
// `if` / loop / `case` / `catch` / `?:` / `&&` / `||` / `??` / default param / logical assignment /
// optional call or member. Nested functions score on their own. They do not add to the parent.
//
// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const defaultRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const LOGICAL_BINARIES = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const LOGICAL_ASSIGNMENTS = new Set([
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const LOOP_OR_BRANCH = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

/** CRAP(m) = comp² × (1 − cov)³ + comp. `coverage` is a fraction in 0..1. */
export function crapScore(complexity, coverage) {
  const clamped = Math.min(1, Math.max(0, coverage));
  return complexity * complexity * (1 - clamped) ** 3 + complexity;
}

export function readConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`check-crap: ${configPath} is missing.`);
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  if (raw.metric !== 'crap' && raw.metric !== 'complexity') {
    throw new Error(`check-crap: metric must be "crap" or "complexity", not ${JSON.stringify(raw.metric)}.`);
  }
  if (typeof raw.threshold !== 'number' || !Number.isFinite(raw.threshold) || raw.threshold <= 0) {
    throw new Error(`check-crap: threshold must be a finite number greater than 0.`);
  }
  return { metric: raw.metric, threshold: raw.threshold };
}

function isFunctionLikeWithBody(node) {
  if (node.body === undefined) return false;
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function functionName(node, sourceFile) {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isGetAccessorDeclaration(node) && node.name) return `get ${node.name.getText(sourceFile)}`;
  if (ts.isSetAccessorDeclaration(node) && node.name) return `set ${node.name.getText(sourceFile)}`;
  if (node.name) return node.name.getText(sourceFile);
  const parent = node.parent;
  if (parent === undefined) return '(anonymous)';
  if (ts.isVariableDeclaration(parent) && parent.name) return parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(parent) && parent.name) return parent.name.getText(sourceFile);
  if (ts.isPropertyDeclaration(parent) && parent.name) return parent.name.getText(sourceFile);
  if (ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) return parent.left.getText(sourceFile);
  return '(anonymous)';
}

function isTypeish(node) {
  return ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) || ts.isHeritageClause(node);
}

function optionalChainAddsBranch(node) {
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return node.questionDotToken !== undefined;
  }
  return false;
}

function complexityOf(fnNode) {
  let complexity = 1;
  function visit(node) {
    if (node !== fnNode && isFunctionLikeWithBody(node)) return;
    if (isTypeish(node)) return;

    if (LOOP_OR_BRANCH.has(node.kind)) complexity += 1;
    else if (ts.isCaseClause(node)) complexity += 1;
    else if (ts.isBinaryExpression(node) && LOGICAL_BINARIES.has(node.operatorToken.kind)) complexity += 1;
    else if (ts.isBinaryExpression(node) && LOGICAL_ASSIGNMENTS.has(node.operatorToken.kind)) complexity += 1;
    else if (ts.isParameter(node) && node.initializer !== undefined) complexity += 1;
    else if (ts.isBindingElement(node) && node.initializer !== undefined) complexity += 1;
    if (optionalChainAddsBranch(node)) complexity += 1;

    ts.forEachChild(node, visit);
  }
  visit(fnNode);
  return complexity;
}

/** Every function-like with a body in `source`, with classic cyclomatic complexity. */
export function functionsIn(source, fileName = 'fixture.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  function walk(node) {
    if (isFunctionLikeWithBody(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.end);
      found.push({
        name: functionName(node, sourceFile),
        line: start.line + 1,
        start: node.getStart(sourceFile),
        end: node.end,
        startLine: start.line + 1,
        endLine: end.line + 1,
        complexity: complexityOf(node),
      });
    }
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return found;
}

function listProductionFiles(srcDir) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      files.push(full);
    }
  }
  walk(srcDir);
  return files.sort();
}

function coverageRecordFor(coverage, absPath) {
  if (coverage === null || coverage === undefined) return undefined;
  if (coverage[absPath] !== undefined) return coverage[absPath];
  const wanted = absPath.replaceAll('\\', '/');
  for (const [key, value] of Object.entries(coverage)) {
    if (key.replaceAll('\\', '/') === wanted) return value;
  }
  for (const [key, value] of Object.entries(coverage)) {
    if (key.replaceAll('\\', '/').endsWith(wanted) || wanted.endsWith(key.replaceAll('\\', '/'))) {
      return value;
    }
  }
  return undefined;
}

/** Statement coverage in 0..1 for `fn`, using the innermost function that owns each statement. */
export function coverageRatio(fn, siblings, fileCoverage, sourceFile) {
  if (fileCoverage === undefined || fileCoverage.statementMap === undefined || fileCoverage.s === undefined) {
    return 0;
  }
  const map = fileCoverage.statementMap;
  const hits = fileCoverage.s;
  let total = 0;
  let covered = 0;
  const innermost = [...siblings].sort((a, b) => a.end - a.start - (b.end - b.start));
  for (const [id, loc] of Object.entries(map)) {
    if (loc?.start === undefined) continue;
    let position;
    try {
      position = sourceFile.getPositionOfLineAndCharacter(loc.start.line - 1, loc.start.column);
    } catch {
      continue;
    }
    const owner = innermost.find((candidate) => position >= candidate.start && position < candidate.end);
    if (owner !== fn) continue;
    total += 1;
    if ((hits[id] ?? 0) > 0) covered += 1;
  }
  if (total === 0) return 1;
  return covered / total;
}

export function scoreFunctions(functions, { metric, fileCoverage, sourceFile }) {
  return functions.map((fn) => {
    if (metric === 'complexity') {
      return { ...fn, coverage: undefined, score: fn.complexity };
    }
    const coverage = coverageRatio(fn, functions, fileCoverage, sourceFile);
    return { ...fn, coverage, score: crapScore(fn.complexity, coverage) };
  });
}

export function breachesAmong(scored, threshold) {
  return scored.filter((row) => row.score > threshold).sort((a, b) => b.score - a.score);
}

function loadCoverageJson(coveragePath) {
  if (!existsSync(coveragePath)) return null;
  return JSON.parse(readFileSync(coveragePath, 'utf8'));
}

function collectCoverage(rootDir) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--project', 'pure', '--project', 'dom', '--coverage', '--reporter', 'dot'],
    { cwd: rootDir, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error('check-crap: coverage run failed. Tests must pass before CRAP can score them.');
  }
}

function formatScore(row, metric) {
  const where = `${row.file}:${row.line} ${row.name}`;
  if (metric === 'complexity') {
    return `${where} complexity=${row.score}`;
  }
  const pct = row.coverage === undefined ? '?' : `${Math.round(row.coverage * 100)}%`;
  return `${where} CRAP=${row.score.toFixed(2)} (complexity=${row.complexity}, coverage=${pct})`;
}

/**
 * Score every production function under `srcDir`. Does not print or exit.
 * `collectCoverageRun` is the coverage spawn; tests inject a stub or skip it.
 */
export function evaluateTree({
  rootDir,
  srcDir,
  metric,
  threshold,
  coveragePath,
  coverage: injectedCoverage,
  collectCoverageRun = collectCoverage,
}) {
  const files = listProductionFiles(srcDir);
  if (files.length === 0) {
    throw new Error(`check-crap: no production .ts files under ${srcDir}.`);
  }

  let coverage = injectedCoverage ?? null;
  if (metric === 'crap' && injectedCoverage === undefined) {
    collectCoverageRun(rootDir);
    coverage = loadCoverageJson(coveragePath);
    if (coverage === null) {
      throw new Error(`check-crap: ${coveragePath} is still missing after the coverage run.`);
    }
  }
  if (metric === 'crap' && coverage === null) {
    throw new Error(`check-crap: ${coveragePath} is missing.`);
  }

  const scored = [];
  for (const absPath of files) {
    const source = readFileSync(absPath, 'utf8');
    const sourceFile = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const functions = functionsIn(source, absPath);
    const fileCoverage = coverageRecordFor(coverage, absPath);
    const fileScored = scoreFunctions(functions, { metric, fileCoverage, sourceFile });
    const relative = path.relative(rootDir, absPath).split(path.sep).join('/');
    for (const row of fileScored) scored.push({ ...row, file: relative });
  }

  const breaches = breachesAmong(scored, threshold);
  const max = scored.reduce((high, row) => (row.score > high ? row.score : high), 0);
  return { scored, breaches, max, files: files.length, functions: scored.length };
}

function parseArgs(argv) {
  const options = {
    config: undefined,
    metric: undefined,
    threshold: undefined,
    coverage: undefined,
    src: undefined,
    root: undefined,
    skipCollect: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--config' && next !== undefined) {
      options.config = next;
      i += 1;
    } else if (arg === '--metric' && next !== undefined) {
      options.metric = next;
      i += 1;
    } else if (arg === '--threshold' && next !== undefined) {
      options.threshold = Number(next);
      i += 1;
    } else if (arg === '--coverage' && next !== undefined) {
      options.coverage = next;
      i += 1;
    } else if (arg === '--src' && next !== undefined) {
      options.src = next;
      i += 1;
    } else if (arg === '--root' && next !== undefined) {
      options.root = next;
      i += 1;
    } else if (arg === '--no-collect-coverage') {
      options.skipCollect = true;
    } else {
      throw new Error(`check-crap: unknown argument ${arg}.`);
    }
  }
  return options;
}

export function main(
  argv = process.argv.slice(2),
  io = { log: console.log, error: console.error, exit: process.exit },
) {
  const options = parseArgs(argv);
  const rootDir = path.resolve(options.root ?? defaultRoot);
  const configPath = path.resolve(rootDir, options.config ?? 'crap.json');
  const fileConfig = readConfig(configPath);
  const metric = options.metric ?? fileConfig.metric;
  const threshold = options.threshold ?? fileConfig.threshold;
  if (metric !== 'crap' && metric !== 'complexity') {
    throw new Error(`check-crap: metric must be "crap" or "complexity", not ${JSON.stringify(metric)}.`);
  }
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`check-crap: threshold must be a finite number greater than 0.`);
  }

  const srcDir = path.resolve(rootDir, options.src ?? 'src');
  const coveragePath = path.resolve(
    rootDir,
    options.coverage ?? path.join('coverage', 'coverage-final.json'),
  );

  let injectedCoverage;
  if (metric === 'crap' && options.skipCollect) {
    const loaded = loadCoverageJson(coveragePath);
    if (loaded === null) {
      throw new Error(`check-crap: ${coveragePath} is missing and coverage collection is off.`);
    }
    injectedCoverage = loaded;
  }

  const result = evaluateTree({
    rootDir,
    srcDir,
    metric,
    threshold,
    coveragePath,
    ...(injectedCoverage !== undefined ? { coverage: injectedCoverage } : {}),
    collectCoverageRun: collectCoverage,
  });

  const unit = metric === 'crap' ? 'CRAP' : 'complexity';
  if (result.breaches.length > 0) {
    io.error(`check-crap FAILED: ${result.breaches.length} function(s) over ${unit} ${threshold}.`);
    for (const row of result.breaches) io.error(`  ${formatScore(row, metric)}`);
    if (metric === 'crap') {
      io.error(
        'Split the function, cover its branches, or set metric to "complexity" in crap.json to back off.',
      );
    } else {
      io.error('Split the function, or raise threshold in crap.json.');
    }
    io.exit(1);
    return 1;
  }

  io.log(
    `check-crap: clean (${result.functions} functions in ${result.files} files, metric=${metric}, ` +
      `threshold=${threshold}, max=${metric === 'crap' ? result.max.toFixed(2) : String(result.max)}).`,
  );
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
