#!/usr/bin/env node
// #514: the nightly Firefox and WebKit run (`.github/workflows/nightly-engines.yml`) reports its
// failures as a GitHub issue. One issue collects every failure until someone closes it:
//
// - No open issue carries the `nightly-e2e-failure` label: open one that lists the failures.
// - One is open: comment on it with only the failures it does not already list.
//
// A failure is new when its signature is new. The signature is the engine, the spec file, the test
// title, the failing line and the first line of the error. So the same test failing at another
// assertion, or with another error, counts as new.
// Each listed failure carries its signature in an HTML comment, which is how the next night reads
// what the issue already holds.
//
// Usage: node scripts/report-nightly-failures.mjs <playwright-json-report>

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAILURE_LABEL = 'nightly-e2e-failure';

/** A terminal colour code, as Playwright writes it into an error message. */
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The first non-empty line of an error message, with terminal colours and extra spaces removed. */
export function firstErrorLine(message) {
  const lines = (message ?? '').replace(ANSI_ESCAPE, '').split('\n');
  const first = lines.map((line) => line.trim()).find((line) => line.length > 0);
  return first === undefined ? '(no error message)' : first.replace(/\s+/g, ' ');
}

/** Every test that failed on its last try. A flaky test passed on a retry, so it is not a failure.
 *  A run that fails before any test starts (a browser that does not launch, a dev server that does
 *  not start) has no failed test, so its top-level errors count as failures too. */
export function readFailures(report) {
  const failures = [];
  const visit = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== 'unexpected') continue;
        const results = test.results ?? [];
        const last = results[results.length - 1];
        const error = last?.error ?? last?.errors?.[0];
        failures.push({
          project: test.projectName ?? '(no project)',
          file: spec.file ?? file,
          title: spec.title,
          line: error?.location?.line ?? 0,
          error: firstErrorLine(error?.message),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, child.file ?? file);
  };
  for (const suite of report.suites ?? []) visit(suite, suite.file ?? '(no file)');
  for (const error of report.errors ?? []) {
    failures.push({
      project: '(run)',
      file: '(run)',
      title: 'The run failed',
      line: 0,
      error: firstErrorLine(error.message),
    });
  }
  return failures;
}

/** A short, stable id for one failure: the same engine, test, line and error give the same id. */
export function failureSignature(failure) {
  const key = [failure.project, failure.file, failure.title, failure.line, failure.error].join('\n');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function signatureMarker(signature) {
  return `<!-- nightly-failure:${signature} -->`;
}

/** The failures whose signature marker is not in `knownText` — the issue body and its comments. */
export function unreportedFailures(failures, knownText) {
  const seen = new Set();
  return failures.filter((failure) => {
    const signature = failureSignature(failure);
    if (seen.has(signature) || knownText.includes(signatureMarker(signature))) return false;
    seen.add(signature);
    return true;
  });
}

/** One Markdown bullet per failure, each with its signature marker. */
export function formatFailures(failures) {
  return failures
    .map(
      (failure) =>
        `- **${failure.project}** \`${failure.file}${failure.line > 0 ? `:${failure.line}` : ''}\` › ${failure.title}\n` +
        `  \`${failure.error.replaceAll('`', "'")}\`\n` +
        `  ${signatureMarker(failureSignature(failure))}`,
    )
    .join('\n');
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function reportToGitHub(failures, runUrl) {
  const runLine = runUrl ? `Run: ${runUrl}` : 'Run: (no run URL)';
  const open = JSON.parse(
    gh(['issue', 'list', '--label', FAILURE_LABEL, '--state', 'open', '--json', 'number']),
  );
  const issueNumber = open.map((issue) => issue.number).sort((a, b) => a - b)[0];

  if (issueNumber === undefined) {
    gh([
      'label',
      'create',
      FAILURE_LABEL,
      '--color',
      'B60205',
      '--description',
      'The nightly engine e2e run failed',
      '--force',
    ]);
    const body = [
      'The nightly Firefox and WebKit e2e run failed (`.github/workflows/nightly-engines.yml`).',
      'Later nights comment here with each failure this issue does not list yet. Close the issue when the run is green.',
      '',
      runLine,
      '',
      formatFailures(failures),
    ].join('\n');
    const url = gh([
      'issue',
      'create',
      '--title',
      'Nightly engine e2e run failed',
      '--label',
      FAILURE_LABEL,
      '--body',
      body,
    ]);
    console.log(`report-nightly-failures: opened ${url} with ${failures.length} failure(s).`);
    return;
  }

  const issue = JSON.parse(gh(['issue', 'view', String(issueNumber), '--json', 'body,comments']));
  const knownText = [issue.body, ...issue.comments.map((comment) => comment.body)].join('\n');
  const fresh = unreportedFailures(failures, knownText);
  if (fresh.length === 0) {
    console.log(`report-nightly-failures: #${issueNumber} already lists every failure. No comment.`);
    return;
  }
  const body = [`${fresh.length} new failure(s).`, '', runLine, '', formatFailures(fresh)].join('\n');
  gh(['issue', 'comment', String(issueNumber), '--body', body]);
  console.log(`report-nightly-failures: commented on #${issueNumber} with ${fresh.length} new failure(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const reportPath = process.argv[2];
  const runUrl = process.env.FG_RUN_URL ?? '';
  let failures;
  if (!reportPath || !existsSync(reportPath)) {
    failures = [
      {
        project: '(run)',
        file: '(run)',
        title: 'The run wrote no JSON report',
        line: 0,
        error: `missing: ${reportPath ?? '(no path)'}`,
      },
    ];
  } else {
    failures = readFailures(JSON.parse(readFileSync(reportPath, 'utf8')));
  }
  if (failures.length === 0) {
    failures = [
      {
        project: '(run)',
        file: '(run)',
        title: 'The run failed with no failed test',
        line: 0,
        error: 'see the run log',
      },
    ];
  }
  reportToGitHub(failures, runUrl);
}
