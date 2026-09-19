import { describe, expect, it, vi } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';
import { Redactor } from '../src/core/pipeline/redactor';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';

describe('Pipeline Zero Egress Network Privacy Test (Phase 8)', () => {
  function createSyntheticImage(width = 150, height = 150) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;
      data[i + 1] = 200;
      data[i + 2] = 200;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'network_test_input.png', size: data.length }
    };
  }

  it('guarantees ZERO network egress (fetch / XHR) during complete end-to-end pipeline execution', async () => {
    let networkCallCount = 0;

    // Spy on fetch
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockImplementation((...args: any[]) => {
      networkCallCount++;
      throw new Error(`PRIVACY VIOLATION: Remote network call attempted: ${args[0]}`);
    });
    globalThis.fetch = fetchSpy;

    // Spy on XMLHttpRequest if present
    if (typeof globalThis.XMLHttpRequest !== 'undefined') {
      vi.spyOn(globalThis.XMLHttpRequest.prototype, 'open').mockImplementation(() => {
        networkCallCount++;
        throw new Error('PRIVACY VIOLATION: XMLHttpRequest attempted during pipeline processing!');
      });
    }

    try {
      const faceDetector = new FaceDetector();
      const ocrEngine = new OcrEngine();
      const piiClassifier = new PiiClassifier();
      const regionMapper = new RegionMapper();
      const redactor = new Redactor();
      const verifier = new SanitizerVerifier();

      // Mock OCR & Face detector outputs
      ocrEngine.recognizeText = async () => [
        { id: 'ocr-1', text: 'user@domain.com', box: { x: 10, y: 10, width: 80, height: 20 }, confidence: 0.95 }
      ];
      faceDetector.detectFaces = async () => [
        { id: 'face-1', box: { x: 100, y: 10, width: 40, height: 40 }, confidence: 0.88 }
      ];

      // Mock verifier pass for JSDOM image loading
      verifier.verify = async () => ({
        status: 'PASS',
        passed: true,
        faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
        regionIntegrity: { checked: 2, passedCount: 2, failedCount: 0, passed: true },
        outputIntegrity: { passed: true, details: 'Valid decodable image' },
        timing: { faceScanMs: 1, ocrScanMs: 1, piiScanMs: 1, regionIntegrityMs: 1, outputIntegrityMs: 1, totalMs: 5 },
        reasons: []
      });

      const pipeline = new PrivacyPipeline(
        faceDetector,
        ocrEngine,
        piiClassifier,
        regionMapper,
        redactor,
        verifier
      );

      const inputImage = createSyntheticImage();
      const result = await pipeline.protectImage(inputImage);

      expect(result.status).toBe('VERIFIED');
      expect(result.passed).toBe(true);
      expect(networkCallCount).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
