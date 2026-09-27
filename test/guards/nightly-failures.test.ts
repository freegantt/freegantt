// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `scripts/report-nightly-failures.mjs` (#514) turns the nightly engine run's Playwright JSON
// report into one GitHub issue. The `gh` calls need a live repo, so this file tests the pieces a
// fabricated report can drive: which tests count as failed, and which failures an open issue
// already lists.

import { describe, expect, it } from 'vitest';
import {
  failureSignature,
  firstErrorLine,
  formatFailures,
  readFailures,
  unreportedFailures,
} from '../../scripts/report-nightly-failures.mjs';

/** One test in a fabricated report. A test with a `describe` title sits in a nested suite of that title. */
interface ReportTest {
  title: string;
  project: string;
  status: string;
  message?: string;
  describe?: string;
}

/** A Playwright JSON spec for one test, shaped like `reporter: json` writes it. */
function spec(test: ReportTest): unknown {
  return {
    title: test.title,
    file: 'zoom.spec.ts',
    tests: [
      {
        projectName: test.project,
        status: test.status,
        results: [
          {
            error:
              test.message === undefined
                ? undefined
                : { message: test.message, location: { file: 'zoom.spec.ts', line: 12, column: 3 } },
          },
        ],
      },
    ],
  };
}

/** A Playwright JSON report with one spec file, shaped like `reporter: json` writes it. Each
 *  `describe` title becomes one nested suite under the file suite. */
function report(tests: ReportTest[]): unknown {
  const describeTitles = [
    ...new Set(tests.flatMap((test) => (test.describe === undefined ? [] : [test.describe]))),
  ];
  return {
    suites: [
      {
        title: 'zoom.spec.ts',
        file: 'zoom.spec.ts',
        specs: tests.filter((test) => test.describe === undefined).map(spec),
        suites: describeTitles.map((describeTitle) => ({
          title: describeTitle,
          file: 'zoom.spec.ts',
          specs: tests.filter((test) => test.describe === describeTitle).map(spec),
        })),
      },
    ],
    errors: [],
  };
}

describe('readFailures', () => {
  it('reads a test that failed on its last try, and skips a flaky one and a passed one', () => {
    const failures = readFailures(
      report([
        {
          title: 'zooms',
          project: 'webkit',
          status: 'unexpected',
          message: '\u001b[31mExpected: 8\u001b[39m\nmore',
        },
        { title: 'pans', project: 'firefox', status: 'flaky', message: 'Timeout' },
        { title: 'scrolls', project: 'firefox', status: 'expected' },
      ]),
    );
    expect(failures).toEqual([
      { project: 'webkit', file: 'zoom.spec.ts', title: 'zooms', line: 12, error: 'Expected: 8' },
    ]);
  });

  it('titles a test in a describe block with the describe path, so same-titled tests do not collide', () => {
    const failures = readFailures(
      report([
        {
          title: 'zooms',
          project: 'webkit',
          status: 'unexpected',
          message: 'Expected: 8',
          describe: 'toolbar',
        },
        {
          title: 'zooms',
          project: 'webkit',
          status: 'unexpected',
          message: 'Expected: 8',
          describe: 'wheel',
        },
      ]),
    );
    expect(failures.map((failure) => failure.title)).toEqual(['toolbar › zooms', 'wheel › zooms']);
    expect(failureSignature(failures[0]!)).not.toBe(failureSignature(failures[1]!));
    expect(unreportedFailures(failures, '')).toHaveLength(2);
    expect(formatFailures(failures)).toContain('`zoom.spec.ts:12` › toolbar › zooms');
  });

  it('reads a run-level error as a failure, so a run that fails before any test is still reported', () => {
    const failures = readFailures({ suites: [], errors: [{ message: 'browserType.launch: Timeout' }] });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error).toBe('browserType.launch: Timeout');
  });
});

describe('unreportedFailures', () => {
  const zoomFailure = {
    project: 'webkit',
    file: 'zoom.spec.ts',
    title: 'zooms',
    line: 12,
    error: 'Expected: 8',
  };

  it('keeps a failure the open issue does not list, and drops one it already lists', () => {
    const listed = formatFailures([zoomFailure]);
    expect(unreportedFailures([zoomFailure], '')).toEqual([zoomFailure]);
    expect(unreportedFailures([zoomFailure], `issue body\n${listed}`)).toEqual([]);
  });

  it('counts the same test failing with a different error as a new failure', () => {
    const listed = formatFailures([zoomFailure]);
    const otherError = { ...zoomFailure, error: 'Received: 0' };
    expect(unreportedFailures([otherError], listed)).toEqual([otherError]);
  });

  it('counts the same error at a different assertion as a new failure', () => {
    const listed = formatFailures([zoomFailure]);
    const otherLine = { ...zoomFailure, line: 30 };
    expect(unreportedFailures([otherLine], listed)).toEqual([otherLine]);
  });

  it('counts the same failure on a different engine as a new failure', () => {
    const listed = formatFailures([zoomFailure]);
    const otherEngine = { ...zoomFailure, project: 'firefox' };
    expect(unreportedFailures([otherEngine], listed)).toEqual([otherEngine]);
  });

  it('lists a failure once when one run reports it twice', () => {
    expect(unreportedFailures([zoomFailure, { ...zoomFailure }], '')).toHaveLength(1);
  });
});

describe('failureSignature and firstErrorLine', () => {
  it('gives the same failure the same signature', () => {
    const failure = { project: 'webkit', file: 'a.spec.ts', title: 't', line: 1, error: 'e' };
    expect(failureSignature(failure)).toBe(failureSignature({ ...failure }));
  });

  it('names a missing error message instead of an empty line', () => {
    expect(firstErrorLine(undefined)).toBe('(no error message)');
    expect(firstErrorLine('\n\n  Error:   two   spaces \n')).toBe('Error: two spaces');
  });
});
