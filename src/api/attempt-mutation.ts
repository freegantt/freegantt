// api/ — swallow a refused `beforeChange` so a button does not need its own try/catch.

import { MutationCancelledError } from '../model/index.js';

/** Call: `attemptMutation(() => dataset.undo())`. Runs `body`. Returns `true`. A refused
 *  `beforeChange` returns `false` instead of throwing. Any other error still throws. */
export function attemptMutation(body: () => void): boolean {
  try {
    body();
    return true;
  } catch (error) {
    if (error instanceof MutationCancelledError) return false;
    throw error;
  }
}
