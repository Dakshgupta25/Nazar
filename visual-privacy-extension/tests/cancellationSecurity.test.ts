import { describe, expect, it } from 'vitest';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';
import { PipelineStageState } from '../src/core/types/pipeline';

describe('Multi-Stage Cancellation Security Audit (Phase 9)', () => {
  function createMockImage() {
    return {
      width: 100,
      height: 100,
      metadata: { width: 100, height: 100, name: 'cancel_test.png', size: 1000 }
    };
  }

  function createPipelineWithStageDelay(targetStage: PipelineStageState, delayMs = 40) {
    const mockFaceDetector = {
      getStatus: () => 'READY',
      detectFaces: async () => {
        if (targetStage === 'DETECTING_FACES') {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return [{ id: 'f1', box: { x: 10, y: 10, width: 20, height: 20 }, confidence: 0.9 }];
      }
    };

    const mockOcrEngine = {
      getStatus: () => 'READY',
      recognizeText: async () => {
        if (targetStage === 'RUNNING_OCR') {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return [{ id: 'o1', text: 'user@email.com', box: { x: 40, y: 10, width: 50, height: 20 }, confidence: 0.95 }];
      }
    };

    const mockPiiClassifier = {
      classify: () => ({
        piiFindings: [{ id: 'p1', piiType: 'EMAIL', ocrId: 'o1', ocrConfidence: 0.95, confidence: 0.99, originalText: 'user@email.com', maskedText: 'u***@email.com', box: { x: 40, y: 10, width: 50, height: 20 }, reason: 'Email' }],
        nonSensitiveResults: [],
        classificationTimeMs: 1
      })
    };

    const mockRegionMapper = {
      mapRegions: () => ({
        regions: [{ id: 'r1', source: 'OCR_PII', type: 'EMAIL', label: 'EMAIL', box: { x: 40, y: 10, width: 50, height: 20 }, paddedBox: { x: 40, y: 10, width: 50, height: 20 }, unpaddedBox: { x: 40, y: 10, width: 50, height: 20 }, confidence: 0.99, reason: 'Email', paddingPx: 0 }],
        summary: { totalCount: 1, faceCount: 0, piiCount: 1 },
        mappingTimeMs: 1
      })
    };

    const mockRedactor = {
      redact: async () => {
        if (targetStage === 'REDACTING') {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return {
          blob: new Blob([]),
          previewUrl: 'blob:test',
          width: 100,
          height: 100,
          mimeType: 'image/png',
          strategy: 'SOLID',
          redactedRegionsCount: 1,
          faceCount: 0,
          piiCount: 1,
          originalHash: 'h1',
          sanitizedHash: 'h2',
          timing: { canvasInitMs: 1, drawingMs: 1, redactionMs: 1, exportMs: 1, hashMs: 1, totalMs: 4 }
        };
      }
    };

    const mockVerifier = {
      verify: async () => {
        if (targetStage === 'VERIFYING') {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return {
          status: 'PASS',
          passed: true,
          faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
          ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
          piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
          regionIntegrity: { checked: 1, passedCount: 1, failedCount: 0, passed: true },
          outputIntegrity: { passed: true, details: 'OK' },
          timing: { faceScanMs: 1, ocrScanMs: 1, piiScanMs: 1, regionIntegrityMs: 1, outputIntegrityMs: 1, totalMs: 5 },
          reasons: []
        };
      }
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

  it('1. guarantees CANCELLED status when cancelled during face detection', async () => {
    const pipeline = createPipelineWithStageDelay('DETECTING_FACES', 50);
    const promise = pipeline.protectImage(createMockImage());
    pipeline.cancel();

    const res = await promise;
    expect(res.status).toBe('CANCELLED');
    expect(res.passed).toBe(false);
  });

  it('2. guarantees CANCELLED status when cancelled during spatial OCR', async () => {
    const pipeline = createPipelineWithStageDelay('RUNNING_OCR', 50);
    const promise = pipeline.protectImage(createMockImage());
    pipeline.cancel();

    const res = await promise;
    expect(res.status).toBe('CANCELLED');
    expect(res.passed).toBe(false);
  });

  it('3. guarantees CANCELLED status when cancelled during redaction', async () => {
    const pipeline = createPipelineWithStageDelay('REDACTING', 50);
    const promise = pipeline.protectImage(createMockImage());
    pipeline.cancel();

    const res = await promise;
    expect(res.status).toBe('CANCELLED');
    expect(res.passed).toBe(false);
  });

  it('4. guarantees CANCELLED status when cancelled during residual verification', async () => {
    const pipeline = createPipelineWithStageDelay('VERIFYING', 50);
    const promise = pipeline.protectImage(createMockImage());
    pipeline.cancel();

    const res = await promise;
    expect(res.status).toBe('CANCELLED');
    expect(res.passed).toBe(false);
  });
});
