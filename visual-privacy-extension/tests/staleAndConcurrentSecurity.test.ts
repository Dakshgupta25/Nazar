import { describe, expect, it } from 'vitest';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';

describe('Stale Result & Concurrent Processing Security Audit (Phase 9)', () => {
  function createMockImage(name: string, width = 100, height = 100) {
    const data = new Uint8ClampedArray(width * height * 4);
    return {
      width,
      height,
      metadata: { width, height, name, size: data.length }
    };
  }

  function createPipeline() {
    const mockFaceDetector = {
      getStatus: () => 'READY',
      detectFaces: async (imageInput: any) => [
        { id: `face-${imageInput.metadata.name}`, box: { x: 10, y: 10, width: 20, height: 20 }, confidence: 0.9 }
      ]
    };
    const mockOcrEngine = {
      getStatus: () => 'READY',
      recognizeText: async (imageInput: any) => [
        { id: `ocr-${imageInput.metadata.name}`, text: `text_in_${imageInput.metadata.name}@example.com`, box: { x: 40, y: 10, width: 50, height: 20 }, confidence: 0.95 }
      ]
    };
    const mockPiiClassifier = {
      classify: (ocrItems: any[]) => ({
        piiFindings: ocrItems.map((item) => ({
          id: `pii-${item.id}`,
          piiType: 'EMAIL',
          ocrId: item.id,
          ocrConfidence: 0.95,
          confidence: 0.99,
          originalText: item.text,
          maskedText: 'masked@example.com',
          box: item.box,
          reason: 'Email'
        })),
        nonSensitiveResults: [],
        classificationTimeMs: 1
      })
    };
    const mockRegionMapper = {
      mapRegions: (faces: any[], pii: any[]) => ({
        regions: [
          ...faces.map((f) => ({ id: `reg-${f.id}`, source: 'FACE_DETECTOR', type: 'FACE', label: 'Face', box: f.box, paddedBox: f.box, unpaddedBox: f.box, confidence: 0.9, reason: 'Face', paddingPx: 0 })),
          ...pii.map((p) => ({ id: `reg-${p.id}`, source: 'OCR_PII', type: 'EMAIL', label: 'EMAIL', box: p.box, paddedBox: p.box, unpaddedBox: p.box, confidence: 0.99, reason: 'Email', paddingPx: 0 }))
        ],
        summary: { totalCount: faces.length + pii.length, faceCount: faces.length, piiCount: pii.length },
        mappingTimeMs: 1
      })
    };
    const mockRedactor = {
      redact: async (imageInput: any, regions: any[]) => ({
        blob: new Blob([]),
        previewUrl: `blob:${imageInput.metadata.name}`,
        width: imageInput.metadata.width,
        height: imageInput.metadata.height,
        mimeType: 'image/png',
        strategy: 'SOLID',
        redactedRegionsCount: regions.length,
        faceCount: 1,
        piiCount: 1,
        originalHash: `hash_orig_${imageInput.metadata.name}`,
        sanitizedHash: `hash_sani_${imageInput.metadata.name}`,
        timing: { canvasInitMs: 1, drawingMs: 1, redactionMs: 1, exportMs: 1, hashMs: 1, totalMs: 4 }
      })
    };
    const mockVerifier = {
      verify: async (params: any) => ({
        status: 'PASS',
        passed: true,
        faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
        regionIntegrity: { checked: params.originalRegions.length, passedCount: params.originalRegions.length, failedCount: 0, passed: true },
        outputIntegrity: { passed: true, details: 'Valid' },
        timing: { faceScanMs: 1, ocrScanMs: 1, piiScanMs: 1, regionIntegrityMs: 1, outputIntegrityMs: 1, totalMs: 5 },
        reasons: []
      })
    };

    return new PrivacyPipeline(
      mockFaceDetector as any,
      mockOcrEngine as any,
      mockPiiClassifier as any,
      mockRegionMapper as any,
      mockRedactor as any,
      mockVerifier as any
    );
  }

  it('1. prevents stale result / image swap cross-contamination', async () => {
    const pipeline = createPipeline();
    const imageA = createMockImage('image_A.png');
    const imageB = createMockImage('image_B.png');

    const resultA = await pipeline.protectImage(imageA);
    const resultB = await pipeline.protectImage(imageB);

    // Verify Result A matches Image A strictly
    expect(resultA.input.fileName).toBe('image_A.png');
    expect(resultA.input.originalHash).toBe('hash_orig_image_A.png');
    expect(resultA.redaction.sanitizedHash).toBe('hash_sani_image_A.png');

    // Verify Result B matches Image B strictly
    expect(resultB.input.fileName).toBe('image_B.png');
    expect(resultB.input.originalHash).toBe('hash_orig_image_B.png');
    expect(resultB.redaction.sanitizedHash).toBe('hash_sani_image_B.png');

    // Assert zero cross-contamination of input identity or hashes
    expect(resultA.input.originalHash).not.toEqual(resultB.input.originalHash);
  });

  it('2. isolates state during concurrent pipeline executions', async () => {
    const pipeline1 = createPipeline();
    const pipeline2 = createPipeline();

    const imageAlpha = createMockImage('alpha.png');
    const imageBeta = createMockImage('beta.png');

    // Execute in parallel via Promise.all
    const [resAlpha, resBeta] = await Promise.all([
      pipeline1.protectImage(imageAlpha),
      pipeline2.protectImage(imageBeta)
    ]);

    expect(resAlpha.input.fileName).toBe('alpha.png');
    expect(resBeta.input.fileName).toBe('beta.png');
    expect(resAlpha.detections.faces[0].id).toBe('face-alpha.png');
    expect(resBeta.detections.faces[0].id).toBe('face-beta.png');
  });
});
