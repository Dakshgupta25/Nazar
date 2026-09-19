import { describe, it, expect } from 'vitest';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { Redactor } from '../src/core/pipeline/redactor';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Verifier Image Decode & Sanity Check', () => {
  const mockFaceDetector = {
    detectFaces: async () => [{ id: 'f_cand', box: { x: 100, y: 100, width: 100, height: 100 }, confidence: 0.90 }]
  };

  it('CASE A: correctly redacted image passes verifier without image decoding error', async () => {
    const redactor = new Redactor();
    const verifier = new SanitizerVerifier();
    const width = 800;
    const height = 800;

    const rawPixels = new Uint8ClampedArray(width * height * 4);
    rawPixels.fill(255);

    const origInput = { width, height, data: rawPixels, mimeType: 'image/png' };

    const faceRegion: SensitiveRegion = {
      id: 'face-001',
      type: 'FACE',
      label: 'FACE #1',
      box: { x: 100, y: 100, width: 100, height: 100 },
      boundingBox: { x: 100, y: 100, width: 100, height: 100 },
      unpaddedBox: { x: 100, y: 100, width: 100, height: 100 },
      paddedBox: { x: 92, y: 92, width: 116, height: 116 },
      confidence: 0.95,
      source: 'FACE',
      reason: 'Face detected',
      padding: 8,
      paddingPx: 8
    };

    const redacted = await redactor.redact(origInput, [faceRegion], {
      strategy: 'SOLID',
      solidColor: '#000000',
      mimeType: 'image/png'
    });

    const verifyResult = await verifier.verify({
      originalImage: origInput,
      sanitizedImage: redacted.blob,
      originalFaces: [{ id: 'f1', confidence: 0.9, box: { x: 100, y: 100, width: 100, height: 100 } }],
      originalRegions: [faceRegion],
      redactionResult: redacted,
      faceDetector: mockFaceDetector
    });

    expect(verifyResult.status).toBe('PASS');
    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.regionIntegrity.passed).toBe(true);
    expect(verifyResult.outputIntegrity.passed).toBe(true);
    expect(verifyResult.reasons).toHaveLength(0);
  });

  it('CASE B: under-redacted image fails region integrity scan', async () => {
    const redactor = new Redactor();
    const verifier = new SanitizerVerifier();
    const width = 800;
    const height = 800;

    const rawPixels = new Uint8ClampedArray(width * height * 4);
    rawPixels.fill(255);

    const origInput = { width, height, data: rawPixels, mimeType: 'image/png' };

    const faceRegion: SensitiveRegion = {
      id: 'face-001',
      type: 'FACE',
      label: 'FACE #1',
      box: { x: 100, y: 100, width: 100, height: 100 },
      boundingBox: { x: 100, y: 100, width: 100, height: 100 },
      unpaddedBox: { x: 100, y: 100, width: 100, height: 100 },
      paddedBox: { x: 92, y: 92, width: 116, height: 116 },
      confidence: 0.95,
      source: 'FACE',
      reason: 'Face detected',
      padding: 8,
      paddingPx: 8
    };

    // Under-redacted region (bad region covering only tiny 10x10 corner instead of full face)
    const badRegion: SensitiveRegion = {
      ...faceRegion,
      paddedBox: { x: 100, y: 100, width: 10, height: 10 }
    };

    const redacted = await redactor.redact(origInput, [badRegion], {
      strategy: 'SOLID',
      solidColor: '#000000',
      mimeType: 'image/png'
    });

    const verifyResult = await verifier.verify({
      originalImage: origInput,
      sanitizedImage: redacted.blob,
      originalFaces: [{ id: 'f1', confidence: 0.9, box: { x: 100, y: 100, width: 100, height: 100 } }],
      originalRegions: [faceRegion],
      redactionResult: redacted,
      faceDetector: mockFaceDetector
    });

    expect(verifyResult.status).toBe('FAIL');
    expect(verifyResult.passed).toBe(false);
    expect(verifyResult.regionIntegrity.passed).toBe(false);
  });
});
