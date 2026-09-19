import { describe, expect, it, vi } from 'vitest';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';

describe('Redaction Residual & Partial Exposure Security Audit (Phase 9)', () => {
  function createMockOriginalImage(width = 200, height = 200) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 220;
      data[i + 1] = 220;
      data[i + 2] = 220;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'orig_residual.png', size: data.length }
    };
  }

  function createMockSanitizedImage(width = 200, height = 200) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'sanitized_residual.png', size: data.length }
    };
  }

  it('1. fails verification when residual OCR matches partial email string fragment', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockSanitizedImage();

    const mockOcrEngine = {
      extractText: vi.fn().mockResolvedValue([
        { id: 'res-1', text: 'user@company.com', box: { x: 20, y: 20, width: 80, height: 20 }, confidence: 0.90 }
      ])
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalPiiFindings: [
        {
          id: 'p1',
          piiType: 'EMAIL',
          ocrId: 'o1',
          ocrConfidence: 0.95,
          confidence: 0.99,
          originalText: 'user@company.com',
          maskedText: 'u***@company.com',
          box: { x: 20, y: 20, width: 80, height: 20 },
          reason: 'Email'
        }
      ],
      ocrEngine: mockOcrEngine
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.ocrResiduals.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Residual PII classifier detected') || r.includes('Residual OCR match detected'))).toBe(true);
  });

  it('2. fails verification when residual face scan detects un-redacted face area', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockOriginalImage();

    const mockFaceDetector = {
      detectFaces: vi.fn().mockResolvedValue([
        { id: 'res-face-1', box: { x: 10, y: 10, width: 40, height: 40 }, confidence: 0.82 }
      ])
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalFaces: [{ id: 'f1', box: { x: 10, y: 10, width: 40, height: 40 }, confidence: 0.9 }],
      faceDetector: mockFaceDetector
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.faceResiduals.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Residual face scan detected'))).toBe(true);
  });

  it('3. fails verification when pixel region integrity check detects un-redacted pixels in sensitive box', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(100, 100);
    // Sanitize image retains original grey pixels inside sensitive region [10, 10, 30, 30]
    const unredactedSanitizedImage = createMockOriginalImage(100, 100);

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: unredactedSanitizedImage,
      originalRegions: [
        {
          id: 'r1',
          source: 'OCR_PII',
          type: 'PAN',
          label: 'PAN Region',
          box: { x: 10, y: 10, width: 30, height: 30 },
          paddedBox: { x: 10, y: 10, width: 30, height: 30 },
          unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
          boundingBox: { x: 10, y: 10, width: 30, height: 30 },
          confidence: 0.98,
          reason: 'PAN',
          padding: 0,
          paddingPx: 0
        }
      ]
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.regionIntegrity.passed).toBe(false);
    expect(result.regionIntegrity.failedCount).toBe(1);
  });
});
