import { describe, expect, it } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { PiiFinding } from '../src/core/types/pipeline';

describe('Phase 7 Verification Integration Pipeline Test', () => {
  function createSyntheticImage(w = 200, h = 200) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 180;
      data[i + 1] = 180;
      data[i + 2] = 180;
      data[i + 3] = 255;
    }
    return {
      width: w,
      height: h,
      data,
      metadata: { width: w, height: h, name: 'integration_test.png', size: data.length }
    };
  }

  it('runs complete pipeline: RegionMapper -> Redactor -> SanitizerVerifier (PASS)', async () => {
    const image = createSyntheticImage(200, 200);
    const mapper = new RegionMapper();
    const redactor = new Redactor();
    const verifier = new SanitizerVerifier();

    const mockFaces = [
      { id: 'f1', box: { x: 20, y: 20, width: 40, height: 40 }, confidence: 0.92 }
    ];
    const mockPii: PiiFinding[] = [
      {
        id: 'p1',
        piiType: 'EMAIL',
        ocrId: 'o1',
        ocrConfidence: 0.95,
        confidence: 0.99,
        originalText: 'priyanshu@gmail.com',
        maskedText: 'p***@gmail.com',
        box: { x: 100, y: 100, width: 80, height: 25 },
        reason: 'Email matched'
      }
    ];

    // 1. Sensitive Region Mapping
    const regionResult = mapper.mapRegions(mockFaces, mockPii, 200, 200, { paddingPx: 8 });
    expect(regionResult.regions.length).toBe(2);

    // 2. Destructive Redaction
    const redactedResult = await redactor.redact(image, regionResult.regions, {
      strategy: 'SOLID',
      solidColor: '#000000'
    });
    expect(redactedResult.redactedRegionsCount).toBe(2);
    expect(redactedResult.originalHash).not.toBe(redactedResult.sanitizedHash);

    // 3. Sanitization Verification
    const mockCleanDetector = { detectFaces: async () => [] };
    const mockCleanOcr = { extractText: async () => [] };
    const mockCleanPii = { classify: async () => ({ piiFindings: [], nonSensitiveResults: [] }) };

    const verificationResult = await verifier.verify({
      originalImage: image,
      sanitizedImage: redactedResult.blob,
      originalFaces: mockFaces,
      originalPiiFindings: mockPii,
      originalRegions: regionResult.regions,
      redactionResult: redactedResult,
      faceDetector: mockCleanDetector,
      ocrEngine: mockCleanOcr,
      piiClassifier: mockCleanPii
    });

    expect(verificationResult.status).toBe('PASS');
    expect(verificationResult.passed).toBe(true);
    expect(verificationResult.faceResiduals.passed).toBe(true);
    expect(verificationResult.ocrResiduals.passed).toBe(true);
    expect(verificationResult.regionIntegrity.passed).toBe(true);
    expect(verificationResult.outputIntegrity.passed).toBe(true);
  });

  it('runs complete pipeline and catches under-redacted image (FAIL)', async () => {
    const origImage = createSyntheticImage(200, 200);
    const badSanitizedImage = createSyntheticImage(200, 200); // Unredacted pixels!

    const mapper = new RegionMapper();
    const verifier = new SanitizerVerifier();

    const mockPii: PiiFinding[] = [
      {
        id: 'p1',
        piiType: 'PAN',
        ocrId: 'o1',
        ocrConfidence: 0.95,
        confidence: 0.99,
        originalText: 'ABCDE1234F',
        maskedText: 'AB*****34F',
        box: { x: 30, y: 30, width: 100, height: 25 },
        reason: 'PAN matched'
      }
    ];

    const regionResult = mapper.mapRegions([], mockPii, 200, 200, { paddingPx: 4 });

    const verificationResult = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: badSanitizedImage, // Bad image
      originalPiiFindings: mockPii,
      originalRegions: regionResult.regions
    });

    expect(verificationResult.status).toBe('FAIL');
    expect(verificationResult.passed).toBe(false);
    expect(verificationResult.regionIntegrity.passed).toBe(false);
  });
});
