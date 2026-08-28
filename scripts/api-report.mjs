#!/usr/bin/env node
// I11, plans/04 §2, S2.7 §4: the committed etc/freegantt.api.md is the public surface's contract.
// `api-extractor run` (no --local) fails the build the moment dist/api/index.d.ts drifts from it —
// the diff itself is api-extractor's own output; this script only adds the fix-it message.

import { execFileSync } from 'node:child_process';

try {
  execFileSync('api-extractor', ['run'], { stdio: 'inherit' });
} catch {
  console.error(
    '\napi-report: dist/api/index.d.ts no longer matches etc/freegantt.api.md.\n' +
      'A report diff is a semver decision (docs/04 §5), not a formatting nit — either:\n' +
      '  - revert the surface change, or\n' +
      '  - run `api-extractor run --local` to update the report, commit it, and say so in the PR.\n',
  );
  process.exit(1);
}
