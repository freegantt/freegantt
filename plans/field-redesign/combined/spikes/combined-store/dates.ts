/** Dates iff Segments. Un-date uses presence, not !== undefined. */

import { EmptySegmentsError, InvalidInstantError } from './errors.js';
import type { Entry, Instant, Segment, Write } from './types.js';

export function namesOneDate(write: Write): boolean {
  const startNamed = 'start' in write;
  const endNamed = 'end' in write;
  if (startNamed !== endNamed) return true;
  if (startNamed && endNamed) return (write.start !== undefined) !== (write.end !== undefined);
  return false;
}

export function clearsDates(write: Write): boolean {
  return 'start' in write && write.start === undefined && 'end' in write && write.end === undefined;
}

export function reconcileEnvelope(entry: Entry, write: Write): Entry {
  if ('segments' in write) {
    if (write.segments !== undefined && write.segments.length === 0) {
      throw new EmptySegmentsError();
    }
    if (write.segments !== undefined && write.segments.length > 0) {
      const env = envelopeOf(write.segments);
      return {
        ...entry,
        segments: write.segments,
        start: env.start,
        end: env.end,
      };
    }
  }

  if (namesOneDate(write)) {
    throw new InvalidInstantError();
  }

  if (clearsDates(write)) {
    const next = { ...entry };
    delete next.start;
    delete next.end;
    delete next.segments;
    return next;
  }

  const next = { ...entry };
  if ('start' in write) {
    if (write.start === undefined) delete next.start;
    else next.start = write.start;
  }
  if ('end' in write) {
    if (write.end === undefined) delete next.end;
    else next.end = write.end;
  }

  if ('start' in write || 'end' in write) {
    if (next.start !== undefined && next.end !== undefined) {
      next.segments = [{ start: next.start, end: next.end }];
    } else if (next.start === undefined && next.end === undefined) {
      delete next.segments;
    } else {
      throw new InvalidInstantError();
    }
  }

  return next;
}

export function envelopeOf(segments: readonly Segment[]): { start: Instant; end: Instant } {
  const first = segments[0];
  if (!first) throw new EmptySegmentsError();
  let start = first.start;
  let end = first.end;
  for (const span of segments) {
    if (span.start < start) start = span.start;
    if (span.end > end) end = span.end;
  }
  return { start, end };
}

export function hasDates(entry: Entry): boolean {
  return entry.start !== undefined && entry.end !== undefined;
}

export function durationOf(entry: Entry): { value: number } | undefined {
  if (!hasDates(entry)) return undefined;
  return { value: entry.end! - entry.start! };
}

export function omitEnvelopeForJson(entry: Entry, omitDates: boolean): Entry {
  const out: Entry = {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    props: { ...entry.props },
  };
  if (entry.parentId !== undefined) out.parentId = entry.parentId;
  if (entry.followChildren === false) out.followChildren = false;
  if (!omitDates) {
    if (entry.start !== undefined) out.start = entry.start;
    if (entry.end !== undefined) out.end = entry.end;
    if (entry.segments !== undefined && entry.segments.length > 0) out.segments = entry.segments;
  }
  return out;
}
