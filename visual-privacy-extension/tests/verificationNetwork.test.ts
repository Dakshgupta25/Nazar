import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';

describe('Verification Local Privacy & Zero Network Egress Test', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalXMLHttpRequest: typeof globalThis.XMLHttpRequest;
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalXMLHttpRequest = globalThis.XMLHttpRequest;
    originalWebSocket = globalThis.WebSocket;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      throw new Error('NETWORK EGRESS VIOLATION: fetch() was called during SanitizerVerifier execution!');
    });

    (globalThis as any).XMLHttpRequest = vi.fn().mockImplementation(() => {
      throw new Error('NETWORK EGRESS VIOLATION: XMLHttpRequest was instantiated during SanitizerVerifier execution!');
    });

    (globalThis as any).WebSocket = vi.fn().mockImplementation(() => {
      throw new Error('NETWORK EGRESS VIOLATION: WebSocket was opened during SanitizerVerifier execution!');
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    globalThis.WebSocket = originalWebSocket;
  });

  it('guarantees 0 network operations during sanitization verification', async () => {
    const verifier = new SanitizerVerifier();

    const origImage = {
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 4),
      metadata: { width: 100, height: 100 }
    };
    const saniImage = {
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 4),
      metadata: { width: 100, height: 100 }
    };

    const mockDetector = { detectFaces: async () => [] };
    const mockOcr = { extractText: async () => [] };
    const mockPii = { classify: async () => ({ piiFindings: [], nonSensitiveResults: [] }) };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalRegions: [],
      faceDetector: mockDetector,
      ocrEngine: mockOcr,
      piiClassifier: mockPii
    });

    expect(result).toBeDefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
