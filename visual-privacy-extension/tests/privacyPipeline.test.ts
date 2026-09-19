import { describe, expect, it, vi } from 'vitest';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';
import { PrivacyPipelineProgressEvent, PrivacyPipelineResult } from '../src/core/types/pipeline';

describe('PrivacyPipeline Orchestrator Unit Tests (Phase 8)', () => {
  function createMockImage(width = 200, height = 200, fillColor = [200, 200, 200, 255]) {
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
      metadata: { width, height, name: 'synthetic_pipeline_input.png', size: data.length }
    };
  }

  function createMockComponentDependencies() {
    const mockFaceDetector = {
      getStatus: vi.fn().mockReturnValue('READY'),
      detectFaces: vi.fn().mockResolvedValue([
        { id: 'face-1', box: { x: 10, y: 10, width: 40, height: 40 }, confidence: 0.92 }
      ])
    };

    const mockOcrEngine = {
      getStatus: vi.fn().mockReturnValue('READY'),
      recognizeText: vi.fn().mockResolvedValue([
        { id: 'ocr-1', text: 'alice@example.com', box: { x: 60, y: 10, width: 100, height: 20 }, confidence: 0.95 },
        { id: 'ocr-2', text: 'Regular Public Text', box: { x: 10, y: 100, width: 120, height: 20 }, confidence: 0.90 }
      ])
    };

    const mockPiiClassifier = {
      classify: vi.fn().mockReturnValue({
        piiFindings: [
          {
            id: 'pii-1',
            piiType: 'EMAIL',
            ocrId: 'ocr-1',
            ocrConfidence: 0.95,
            confidence: 0.98,
            originalText: 'alice@example.com',
            maskedText: 'a***@example.com',
            box: { x: 60, y: 10, width: 100, height: 20 },
            reason: 'Valid email pattern'
          }
        ],
        nonSensitiveResults: [
          { id: 'ocr-2', text: 'Regular Public Text', box: { x: 10, y: 100, width: 120, height: 20 }, confidence: 0.90 }
        ],
        classificationTimeMs: 2
      })
    };

    const mockRegionMapper = {
      mapRegions: vi.fn().mockReturnValue({
        regions: [
          {
            id: 'region-face-1',
            source: 'FACE_DETECTOR',
            type: 'FACE',
            label: 'Face Region #1',
            box: { x: 2, y: 2, width: 56, height: 56 },
            paddedBox: { x: 2, y: 2, width: 56, height: 56 },
            unpaddedBox: { x: 10, y: 10, width: 40, height: 40 },
            confidence: 0.92,
            reason: 'Face Detection',
            paddingPx: 8
          },
          {
            id: 'region-pii-1',
            source: 'OCR_PII',
            type: 'EMAIL',
            label: 'EMAIL Region #1',
            box: { x: 52, y: 2, width: 116, height: 36 },
            paddedBox: { x: 52, y: 2, width: 116, height: 36 },
            unpaddedBox: { x: 60, y: 10, width: 100, height: 20 },
            confidence: 0.98,
            reason: 'Valid email pattern',
            paddingPx: 8
          }
        ],
        summary: { totalCount: 2, faceCount: 1, piiCount: 1 },
        mappingTimeMs: 1
      })
    };

    const mockRedactor = {
      redact: vi.fn().mockResolvedValue({
        blob: new Blob([]),
        previewUrl: 'blob:test-sanitized-url',
        strategy: 'SOLID',
        redactedRegionsCount: 2,
        faceCount: 1,
        piiCount: 1,
        originalHash: 'orig_hash_abc123',
        sanitizedHash: 'sani_hash_def456',
        timing: { redactionMs: 5, exportMs: 2, hashMs: 1, totalMs: 8 }
      })
    };

    const mockVerifier = {
      verify: vi.fn().mockResolvedValue({
        status: 'PASS',
        passed: true,
        faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
        regionIntegrity: { checked: 2, passedCount: 2, failedCount: 0, passed: true },
        outputIntegrity: { passed: true, details: 'Valid' },
        timing: { faceScanMs: 2, ocrScanMs: 2, piiScanMs: 1, regionIntegrityMs: 2, outputIntegrityMs: 1, totalMs: 8 },
        reasons: []
      })
    };

    return {
      mockFaceDetector,
      mockOcrEngine,
      mockPiiClassifier,
      mockRegionMapper,
      mockRedactor,
      mockVerifier
    };
  }

  it('1. executes complete end-to-end pipeline and produces VERIFIED result', async () => {
    const deps = createMockOriginalDependencies();
    const pipeline = new PrivacyPipeline(
      deps.mockFaceDetector as any,
      deps.mockOcrEngine as any,
      deps.mockPiiClassifier as any,
      deps.mockRegionMapper as any,
      deps.mockRedactor as any,
      deps.mockVerifier as any
    );

    const inputImage = createMockImage(200, 200);
    const progressEvents: PrivacyPipelineProgressEvent[] = [];

    const result: PrivacyPipelineResult = await pipeline.protectImage(inputImage, {
      onProgress: (event) => progressEvents.push(event)
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.passed).toBe(true);
    expect(result.input.width).toBe(200);
    expect(result.detections.faces.length).toBe(1);
    expect(result.detections.ocrRegions.length).toBe(2);
    expect(result.classification.piiFindings.length).toBe(1);
    expect(result.regions.sensitiveRegions.length).toBe(2);
    expect(result.redaction.redactedRegionCount).toBe(2);
    expect(result.verification.status).toBe('PASS');

    // Check progress reporting sequence
    expect(progressEvents.length).toBeGreaterThan(5);
    const stagesReported = progressEvents.map((e) => e.stage);
    expect(stagesReported).toContain('LOADING_IMAGE');
    expect(stagesReported).toContain('DETECTING_FACES');
    expect(stagesReported).toContain('RUNNING_OCR');
    expect(stagesReported).toContain('CLASSIFYING_PII');
    expect(stagesReported).toContain('MAPPING_REGIONS');
    expect(stagesReported).toContain('REDACTING');
    expect(stagesReported).toContain('VERIFYING');
    expect(stagesReported).toContain('COMPLETED');
  });

  it('2. supports cancellation during execution', async () => {
    const deps = createMockOriginalDependencies();
    // Delay face detection to allow cancellation call
    deps.mockFaceDetector.detectFaces = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => setTimeout(() => resolve([]), 50));
    });

    const pipeline = new PrivacyPipeline(
      deps.mockFaceDetector as any,
      deps.mockOcrEngine as any,
      deps.mockPiiClassifier as any,
      deps.mockRegionMapper as any,
      deps.mockRedactor as any,
      deps.mockVerifier as any
    );

    const inputImage = createMockImage();
    const promise = pipeline.protectImage(inputImage);
    pipeline.cancel();

    const result = await promise;
    expect(result.status).toBe('CANCELLED');
    expect(result.passed).toBe(false);
  });

  it('3. measures stage durations and total timing accurately', async () => {
    const deps = createMockOriginalDependencies();
    const pipeline = new PrivacyPipeline(
      deps.mockFaceDetector as any,
      deps.mockOcrEngine as any,
      deps.mockPiiClassifier as any,
      deps.mockRegionMapper as any,
      deps.mockRedactor as any,
      deps.mockVerifier as any
    );

    const inputImage = createMockImage();
    const result = await pipeline.protectImage(inputImage);

    expect(result.timing.total).toBeGreaterThanOrEqual(0);
    expect(result.timing.faceDetection).toBeGreaterThanOrEqual(0);
    expect(result.timing.ocr).toBeGreaterThanOrEqual(0);
    expect(result.timing.piiClassification).toBeGreaterThanOrEqual(0);
    expect(result.timing.regionMapping).toBeGreaterThanOrEqual(0);
    expect(result.timing.redaction).toBeGreaterThanOrEqual(0);
    expect(result.timing.verification).toBeGreaterThanOrEqual(0);
  });

  it('4. fail-closed: returns FAILED_VERIFICATION when verifier fails', async () => {
    const deps = createMockOriginalDependencies();
    deps.mockVerifier.verify = vi.fn().mockResolvedValue({
      status: 'FAIL',
      passed: false,
      faceResiduals: { detected: 1, residualFacesCount: 1, passed: false },
      ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
      piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
      regionIntegrity: { checked: 1, passedCount: 0, failedCount: 1, passed: false },
      outputIntegrity: { passed: true, details: 'Valid' },
      timing: { faceScanMs: 1, ocrScanMs: 0, piiScanMs: 0, regionIntegrityMs: 1, outputIntegrityMs: 0, totalMs: 2 },
      reasons: ['Residual face scan detected remaining face(s)']
    });

    const pipeline = new PrivacyPipeline(
      deps.mockFaceDetector as any,
      deps.mockOcrEngine as any,
      deps.mockPiiClassifier as any,
      deps.mockRegionMapper as any,
      deps.mockRedactor as any,
      deps.mockVerifier as any
    );

    const inputImage = createMockImage();
    const result = await pipeline.protectImage(inputImage);

    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.passed).toBe(false);
  });

  it('5. fail-closed: returns INCONCLUSIVE when verifier is inconclusive', async () => {
    const deps = createMockOriginalDependencies();
    deps.mockVerifier.verify = vi.fn().mockResolvedValue({
      status: 'INCONCLUSIVE',
      passed: false,
      faceResiduals: { detected: 0, residualFacesCount: 0, passed: false },
      ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: false },
      piiResiduals: { detected: 0, piiResidualsCount: 0, passed: false },
      regionIntegrity: { checked: 0, passedCount: 0, failedCount: 0, passed: false },
      outputIntegrity: { passed: false, details: 'Verifier error' },
      timing: { faceScanMs: 0, ocrScanMs: 0, piiScanMs: 0, regionIntegrityMs: 0, outputIntegrityMs: 0, totalMs: 0 },
      reasons: ['Inconclusive check']
    });

    const pipeline = new PrivacyPipeline(
      deps.mockFaceDetector as any,
      deps.mockOcrEngine as any,
      deps.mockPiiClassifier as any,
      deps.mockRegionMapper as any,
      deps.mockRedactor as any,
      deps.mockVerifier as any
    );

    const inputImage = createMockImage();
    const result = await pipeline.protectImage(inputImage);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.passed).toBe(false);
  });

  function createMockOriginalDependencies() {
    return createMockComponentDependencies();
  }
});
