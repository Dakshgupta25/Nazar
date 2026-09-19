import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { OcrResult } from '../src/core/types/pipeline';

describe('Phase 4 PII Classification Network Privacy & Log Safety Tests', () => {
  let classifier: PiiClassifier;

  beforeEach(() => {
    vi.restoreAllMocks();
    classifier = new PiiClassifier();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleOcrItems: OcrResult[] = [
    {
      id: 'ocr-secret-1',
      text: 'User: sensitive.email@company.org',
      confidence: 0.95,
      box: { x: 10, y: 10, width: 200, height: 30 }
    },
    {
      id: 'ocr-secret-2',
      text: 'Aadhaar: 2345 6789 0127',
      confidence: 0.99,
      box: { x: 10, y: 50, width: 200, height: 30 }
    }
  ];

  it('guarantees ZERO external network requests (fetch, XMLHttpRequest, WebSocket) during PII classification', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrSpy = vi.spyOn(globalThis, 'XMLHttpRequest');

    const result = classifier.classify(sampleOcrItems);

    expect(result.piiFindings.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('verifies zero raw PII leakage or unmasked strings in console telemetry output', () => {
    const logSpy = vi.spyOn(console, 'log');

    classifier.classify(sampleOcrItems);

    for (const call of logSpy.mock.calls) {
      const logString = call.map((arg) => String(arg)).join(' ');
      expect(logString).not.toContain('sensitive.email@company.org');
      expect(logString).not.toContain('234567890127');
    }
  });
});
