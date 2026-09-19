import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Redaction Local Privacy & Zero Network Egress Test', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Mock global fetch to throw error if invoked
    globalThis.fetch = vi.fn().mockImplementation(() => {
      throw new Error('NETWORK PRIVACY VIOLATION: fetch() was invoked during local redaction!');
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('guarantees 0 network operations during destructive pixel redaction', async () => {
    const data = new Uint8ClampedArray(100 * 100 * 4);
    const image = { width: 100, height: 100, data, rawBytes: data.buffer.slice(0) };

    const region: SensitiveRegion = {
      id: 'r1',
      source: 'FACE_DETECTOR',
      type: 'FACE',
      label: 'Face 1',
      boundingBox: { x: 10, y: 10, width: 30, height: 30 },
      unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
      box: { x: 10, y: 10, width: 30, height: 30 },
      paddedBox: { x: 10, y: 10, width: 30, height: 30 },
      confidence: 0.95,
      reason: 'Face',
      padding: 0,
      paddingPx: 0
    };

    const redactor = new Redactor();
    const result = await redactor.redact(image, [region]);

    expect(result.redactedRegionsCount).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
