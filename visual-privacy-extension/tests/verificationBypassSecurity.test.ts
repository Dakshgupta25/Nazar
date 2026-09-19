import { describe, expect, it, vi } from 'vitest';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';

describe('Verification Bypass & Tampering Security Audit (Phase 9)', () => {
  function createMockImage(width = 100, height = 100) {
    const data = new Uint8ClampedArray(width * height * 4);
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'bypass_test.png', size: data.length }
    };
  }

  function createPipelineWithCustomVerifier(mockVerifyFn: (params: any) => Promise<any>) {
    const mockFaceDetector = {
      getStatus: () => 'READY',
      detectFaces: async () => [{ id: 'f1', box: { x: 10, y: 10, width: 20, height: 20 }, confidence: 0.9 }]
    };
    const mockOcrEngine = {
      getStatus: () => 'READY',
      recognizeText: async () => [{ id: 'o1', text: 'user@bank.com', box: { x: 40, y: 10, width: 50, height: 20 }, confidence: 0.95 }]
    };
    const mockPiiClassifier = {
      classify: () => ({
        piiFindings: [{ id: 'p1', piiType: 'EMAIL', ocrId: 'o1', ocrConfidence: 0.95, confidence: 0.99, originalText: 'user@bank.com', maskedText: 'u***@bank.com', box: { x: 40, y: 10, width: 50, height: 20 }, reason: 'Email' }],
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
      redact: async () => ({
        blob: new Blob([]),
        previewUrl: 'blob:test',
        width: 100,
        height: 100,
        mimeType: 'image/png',
        strategy: 'SOLID',
        redactedRegionsCount: 1,
        faceCount: 0,
        piiCount: 1,
        originalHash: 'hash1',
        sanitizedHash: 'hash2',
        timing: { canvasInitMs: 1, drawingMs: 1, redactionMs: 1, exportMs: 1, hashMs: 1, totalMs: 4 }
      })
    };

    const mockVerifier = {
      verify: vi.fn().mockImplementation(mockVerifyFn)
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

  it('1. rejects tampered verifier object claiming status = PASS but passed = false', async () => {
    const pipeline = createPipelineWithCustomVerifier(async () => ({
      status: 'PASS',
      passed: false, // Mismatched!
      faceResiduals: { passed: false },
      ocrResiduals: { passed: false },
      piiResiduals: { passed: false },
      regionIntegrity: { passed: false },
      outputIntegrity: { passed: false },
      timing: { totalMs: 1 },
      reasons: ['Mismatched tampered payload']
    }));

    const result = await pipeline.protectImage(createMockImage());
    expect(result.status).not.toBe('VERIFIED');
    expect(result.passed).toBe(false);
  });

  it('2. handles verifier throwing exception gracefully under fail-closed policy', async () => {
    const pipeline = createPipelineWithCustomVerifier(async () => {
      throw new Error('Fatal verifier exception');
    });

    const result = await pipeline.protectImage(createMockImage());
    expect(result.status).toBe('ERROR');
    expect(result.passed).toBe(false);
    expect(result.error).toContain('Fatal verifier exception');
  });

  it('3. fails closed when verifier returns status = FAIL', async () => {
    const pipeline = createPipelineWithCustomVerifier(async () => ({
      status: 'FAIL',
      passed: false,
      faceResiduals: { passed: true },
      ocrResiduals: { passed: false },
      piiResiduals: { passed: false },
      regionIntegrity: { passed: false },
      outputIntegrity: { passed: true },
      timing: { totalMs: 2 },
      reasons: ['Residual PII string found']
    }));

    const result = await pipeline.protectImage(createMockImage());
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.passed).toBe(false);
  });

  it('4. fails closed when verifier returns status = INCONCLUSIVE', async () => {
    const pipeline = createPipelineWithCustomVerifier(async () => ({
      status: 'INCONCLUSIVE',
      passed: false,
      faceResiduals: { passed: false },
      ocrResiduals: { passed: false },
      piiResiduals: { passed: false },
      regionIntegrity: { passed: false },
      outputIntegrity: { passed: false },
      timing: { totalMs: 1 },
      reasons: ['Low confidence OCR worker output']
    }));

    const result = await pipeline.protectImage(createMockImage());
    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.passed).toBe(false);
  });
});
