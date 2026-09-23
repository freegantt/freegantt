// What the library says when a consumer writes something that is not a date. Two readers produce
// these faults — `instant()` (the public helper, absolute values only) and `toInstant()` (the
// zone-aware reader every Entry write goes through) — and a consumer who meets both must not get two
// vocabularies for one mistake. `instant.ts` cannot import `input.ts`, which already imports it, so
// this shared door lives here rather than in either reader (#431 F6).
//
// The message itself is `InvalidInstantError`'s own job now (#242): `reason` is a closed
// `InvalidInstantReason`, not prose, so a consumer branches on data instead of parsing the message.
// `operation` is required — the internal door, so no caller can forget to name the public call the
// consumer made.

import type { InvalidInstantReason } from '../model/index.js';
import { InvalidInstantError } from '../model/index.js';

/** Builds the fault one bad value produces. The value is a member as well as a sentence: a bulk
 *  loader catches this and names the row it came from, instead of parsing our wording (#237). */
export function invalidInstant(
  value: unknown,
  reason: InvalidInstantReason,
  operation: string,
): InvalidInstantError {
  return new InvalidInstantError(value, reason, operation);
}
