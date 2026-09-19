import { describe, expect, it, vi } from 'vitest';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { RedactedImageResult } from '../src/core/types/pipeline';

describe('SanitizerVerifier Unit Tests (Phase 7)', () => {

  function createMockImage(width = 200, height = 200, fillColor = [0, 0, 0, 255]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fillColor[0];
      data[i + 1] = fillColor[1];
      data[i + 2] = fillColor[2];
      data[i + 3] = fillColor[3];
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'mock.png', size: data.length }
    };
  }

  function createMockOriginalImage(width = 200, height = 200) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;   // Redish background
      data[i + 1] = 200;
      data[i + 2] = 200;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'original.png', size: data.length }
    };
  }

  it('1. passes clean correctly redacted image', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(100, 100);
    const saniImage = createMockImage(100, 100, [0, 0, 0, 255]); // Opaque black fill

    const mockFaceDetector = {
      detectFaces: vi.fn().mockResolvedValue([])
    };
    const mockOcrEngine = {
      extractText: vi.fn().mockResolvedValue([])
    };
    const mockPiiClassifier = {
      classify: vi.fn().mockReturnValue({ piiFindings: [], nonSensitiveResults: [], classificationTimeMs: 0 })
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalFaces: [{ id: 'f1', box: { x: 10, y: 10, width: 30, height: 30 }, confidence: 0.9 }],
      originalRegions: [{
        id: 'r1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Face Region',
        boundingBox: { x: 10, y: 10, width: 30, height: 30 },
        unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
        box: { x: 10, y: 10, width: 30, height: 30 },
        paddedBox: { x: 10, y: 10, width: 30, height: 30 },
        confidence: 0.9,
        reason: 'Face',
        padding: 0,
        paddingPx: 0
      }],
      faceDetector: mockFaceDetector,
      ocrEngine: mockOcrEngine,
      piiClassifier: mockPiiClassifier
    });

    expect(result.status).toBe('PASS');
    expect(result.passed).toBe(true);
    expect(result.faceResiduals.passed).toBe(true);
    expect(result.ocrResiduals.passed).toBe(true);
    expect(result.regionIntegrity.passed).toBe(true);
    expect(result.outputIntegrity.passed).toBe(true);
  });

  it('2. fails when face residual remains detectable (Case F-1)', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockOriginalImage();

    const mockFaceDetector = {
      detectFaces: vi.fn().mockResolvedValue([
        { id: 'f_res', box: { x: 10, y: 10, width: 40, height: 40 }, confidence: 0.85 }
      ])
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalFaces: [{ id: 'f1', box: { x: 10, y: 10, width: 40, height: 40 }, confidence: 0.9 }],
      originalRegions: [{
        id: 'r1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Face',
        boundingBox: { x: 10, y: 10, width: 40, height: 40 },
        unpaddedBox: { x: 10, y: 10, width: 40, height: 40 },
        box: { x: 10, y: 10, width: 40, height: 40 },
        paddedBox: { x: 10, y: 10, width: 40, height: 40 },
        confidence: 0.9,
        reason: 'Face',
        padding: 0,
        paddingPx: 0
      }],
      faceDetector: mockFaceDetector
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.faceResiduals.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Residual face scan detected'))).toBe(true);
  });

  it('3. fails when residual PII is detected by classifier (Case P-1)', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockImage();

    const mockFaceDetector = { detectFaces: vi.fn().mockResolvedValue([]) };
    const mockOcrEngine = {
      extractText: vi.fn().mockResolvedValue([
        { id: 'o1', text: 'user@gmail.com', box: { x: 50, y: 50, width: 80, height: 20 }, confidence: 0.95 }
      ])
    };
    const mockPiiClassifier = {
      classify: vi.fn().mockReturnValue({
        piiFindings: [{
          id: 'p1',
          piiType: 'EMAIL',
          ocrId: 'o1',
          ocrConfidence: 0.95,
          confidence: 0.99,
          originalText: 'user@gmail.com',
          maskedText: 'u***@gmail.com',
          box: { x: 50, y: 50, width: 80, height: 20 },
          reason: 'Valid email format'
        }],
        nonSensitiveResults: [],
        classificationTimeMs: 1
      })
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalPiiFindings: [{
        id: 'orig_p1',
        piiType: 'EMAIL',
        ocrId: 'o1',
        ocrConfidence: 0.95,
        confidence: 0.99,
        originalText: 'user@gmail.com',
        maskedText: 'u***@gmail.com',
        box: { x: 50, y: 50, width: 80, height: 20 },
        reason: 'Email'
      }],
      faceDetector: mockFaceDetector,
      ocrEngine: mockOcrEngine,
      piiClassifier: mockPiiClassifier
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.piiResiduals.passed).toBe(false);
  });

  it('4. fails when residual OCR normalized string matches original sensitive text', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockImage();

    const mockOcrEngine = {
      extractText: vi.fn().mockResolvedValue([
        { id: 'res_o1', text: '9876543210', box: { x: 20, y: 20, width: 60, height: 15 }, confidence: 0.88 }
      ])
    };
    const mockPiiClassifier = {
      classify: vi.fn().mockReturnValue({ piiFindings: [], nonSensitiveResults: [], classificationTimeMs: 0 })
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalPiiFindings: [{
        id: 'orig_phone',
        piiType: 'PHONE',
        ocrId: 'o1',
        ocrConfidence: 0.90,
        confidence: 0.95,
        originalText: '+91 98765 43210',
        maskedText: '+91 98*****210',
        box: { x: 20, y: 20, width: 60, height: 15 },
        reason: 'Phone'
      }],
      ocrEngine: mockOcrEngine,
      piiClassifier: mockPiiClassifier
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.ocrResiduals.passed).toBe(false);
  });

  it('5. fails pixel-level region integrity when sensitive area is not filled with opaque redaction color', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(100, 100);

    // Create bad sanitized image where region [10, 10, 30, 30] retains white/bright pixels
    const saniImage = createMockOriginalImage(100, 100);

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalRegions: [{
        id: 'r1',
        source: 'OCR_PII',
        type: 'EMAIL',
        label: 'EMAIL Region',
        boundingBox: { x: 10, y: 10, width: 30, height: 30 },
        unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
        box: { x: 10, y: 10, width: 30, height: 30 },
        paddedBox: { x: 10, y: 10, width: 30, height: 30 },
        confidence: 0.95,
        reason: 'Email',
        padding: 0,
        paddingPx: 0
      }]
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.regionIntegrity.passed).toBe(false);
    expect(result.regionIntegrity.failedCount).toBe(1);
  });

  it('6. fails output integrity when dimensions mismatch', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(200, 200);
    const saniImage = createMockImage(100, 100);

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage
    });

    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
    expect(result.outputIntegrity.passed).toBe(false);
  });

  it('7. returns INCONCLUSIVE when face detector throws an exception (fail-closed policy)', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage();
    const saniImage = createMockImage();

    const mockFailingDetector = {
      detectFaces: vi.fn().mockRejectedValue(new Error('WebGL context lost'))
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalFaces: [{ id: 'f1', box: { x: 10, y: 10, width: 20, height: 20 }, confidence: 0.8 }],
      faceDetector: mockFailingDetector
    });

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.passed).toBe(false); // Inconclusive MUST NOT become PASS
  });

  it('8. confirms hash mismatch alone does not grant automatic PASS without check execution', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(100, 100);
    const saniImage = createMockOriginalImage(100, 100); // Unredacted!

    const redactionMetadata: RedactedImageResult = {
      blob: new Blob([]),
      previewUrl: 'blob:test',
      width: 100,
      height: 100,
      mimeType: 'image/png',
      redactedRegionsCount: 1,
      faceCount: 0,
      piiCount: 1,
      strategy: 'SOLID',
      originalHash: 'abc123hash',
      sanitizedHash: 'def456different',
      timing: { canvasInitMs: 1, drawingMs: 1, redactionMs: 1, exportMs: 1, hashMs: 1, totalMs: 4 }
    };

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: saniImage,
      originalRegions: [{
        id: 'r1',
        source: 'OCR_PII',
        type: 'PAN',
        label: 'PAN Region',
        boundingBox: { x: 10, y: 10, width: 30, height: 30 },
        unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
        box: { x: 10, y: 10, width: 30, height: 30 },
        paddedBox: { x: 10, y: 10, width: 30, height: 30 },
        confidence: 0.9,
        reason: 'PAN',
        padding: 0,
        paddingPx: 0
      }],
      redactionResult: redactionMetadata
    });

    // Hash differed, but pixel region was unredacted -> MUST FAIL
    expect(result.status).toBe('FAIL');
    expect(result.passed).toBe(false);
  });

  it('9. catches deliberately bad under-redacted sanitized image (Case C)', async () => {
    const verifier = new SanitizerVerifier();
    const origImage = createMockOriginalImage(100, 100);
    // Fake sanitized image: pixels in region [10, 10, 30, 30] are still original pixels
    const badSanitizedImage = createMockOriginalImage(100, 100);

    const result = await verifier.verify({
      originalImage: origImage,
      sanitizedImage: badSanitizedImage,
      originalRegions: [{
        id: 'r_email',
        source: 'OCR_PII',
        type: 'EMAIL',
        label: 'EMAIL Region',
        boundingBox: { x: 10, y: 10, width: 30, height: 30 },
        unpaddedBox: { x: 10, y: 10, width: 30, height: 30 },
        box: { x: 10, y: 10, width: 30, height: 30 },
        paddedBox: { x: 10, y: 10, width: 30, height: 30 },
        confidence: 0.95,
        reason: 'Email',
        padding: 0,
        paddingPx: 0
      }]
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAIL');
  });
});
