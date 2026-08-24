import { describe, expect, it } from 'vitest';
import { createNullBackend } from './index.js';
import { computeFrame } from '../../layout/index.js';
import { sampleEntries } from '../../../fixtures/sample-project.js';

describe('null render backend', () => {
  it('consumes a frame in Node with no DOM', () => {
    const backend = createNullBackend();
    const frame = computeFrame({
      entries: sampleEntries,
      xForInstant: (i: number) => i / 1000,
      rowHeight: 32,
      revision: 0,
    });
    backend.mount(undefined);
    backend.sync(frame);
    expect(backend.lastFrame()?.bars).toHaveLength(sampleEntries.length);
    backend.destroy();
    expect(backend.lastFrame()).toBeUndefined();
  });
});
