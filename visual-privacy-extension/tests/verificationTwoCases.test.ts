import { describe, expect, it } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('SanitizerVerifier Two-Case Verification Suite (Case A & Case B)', () => {
  const redactor = new Redactor();
  const verifier = new SanitizerVerifier();

  function createTestPixels(w: number, h: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;     // R (Skin tone approximation)
      data[i + 1] = 150; // G
      data[i + 2] = 120; // B
      data[i + 3] = 255; // A
    }
    return data;
  }

  const faceRegion: SensitiveRegion = {
    id: 'face-1',
    type: 'FACE',
    label: 'Face #1',
    box: { x: 100, y: 100, width: 200, height: 200 },
    boundingBox: { x: 100, y: 100, width: 200, height: 200 },
    unpaddedBox: { x: 100, y: 100, width: 200, height: 200 },
    paddedBox: { x: 92, y: 92, width: 216, height: 216 },
    confidence: 0.98,
    source: 'FACE',
    reason: 'Detected face',
    padding: 8,
    paddingPx: 8
  };

  const mockFaceDetector = {
    detectFaces: async () => [{ id: 'f_cand', box: { x: 100, y: 100, width: 200, height: 200 }, confidence: 0.90 }]
  };

  it('CASE A: Correctly redacted face (100% covered) → Verification PASSES (VERIFIED)', async () => {
    const pixels = createTestPixels(800, 800);
    const originalImage: any = {
      width: 800,
      height: 800,
      data: pixels,
      rawBytes: pixels.buffer.slice(0),
      metadata: { width: 800, height: 800, name: 'original.png', mimeType: 'image/png', size: 50000 }
    };

    // Full 100% solid redaction over padded region
    const redactedResult = await redactor.redact(originalImage, [faceRegion], { strategy: 'SOLID', solidColor: '#000000' });

    const verificationResult = await verifier.verify({
      originalImage,
      sanitizedImage: redactedResult.blob,
      originalFaces: [{ id: 'f1', box: faceRegion.boundingBox, confidence: 0.98 }],
      originalRegions: [faceRegion],
      redactionResult: redactedResult,
      faceDetector: mockFaceDetector
    });

    expect(verificationResult).toBeDefined();
    expect(verificationResult.faceResiduals.passed).toBe(true);
    expect(verificationResult.faceResiduals.residualFacesCount).toBe(0);
    expect(verificationResult.regionIntegrity.passed).toBe(true);
    expect(verificationResult.outputIntegrity.passed).toBe(true);
    expect(verificationResult.status).toBe('PASS');
    expect(verificationResult.passed).toBe(true);
  });

  it('CASE B: Under-redacted face (only 30% covered, 70% face exposed) → Verification FAILS', async () => {
    const pixels = createTestPixels(800, 800);
    const originalImage: any = {
      width: 800,
      height: 800,
      data: pixels,
      rawBytes: pixels.buffer.slice(0),
      metadata: { width: 800, height: 800, name: 'original.png', mimeType: 'image/png', size: 50000 }
    };

    // Under-redacted region covering only 30% of the face
    const badRegion: SensitiveRegion = {
      ...faceRegion,
      paddedBox: { x: 100, y: 100, width: 60, height: 60 }
    };

    const redactedResult = await redactor.redact(originalImage, [badRegion], { strategy: 'SOLID', solidColor: '#000000' });

    const verificationResult = await verifier.verify({
      originalImage,
      sanitizedImage: redactedResult.blob,
      originalFaces: [{ id: 'f1', box: faceRegion.boundingBox, confidence: 0.98 }],
      originalRegions: [faceRegion], // Verifying against full original face box
      redactionResult: redactedResult,
      faceDetector: mockFaceDetector
    });

    expect(verificationResult).toBeDefined();
    expect(verificationResult.regionIntegrity.passed).toBe(false);
    expect(verificationResult.status).toBe('FAIL');
    expect(verificationResult.passed).toBe(false);
  });
});
