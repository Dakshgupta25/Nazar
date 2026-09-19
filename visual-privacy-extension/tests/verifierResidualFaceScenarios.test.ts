import { describe, expect, it } from 'vitest';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { SensitiveRegion, VerifierInput } from '../src/core/types/pipeline';

// Helper to create synthetic RGBA pixel buffer (100x100)
function createSyntheticPixelBuffer(
  width: number,
  height: number,
  redactBox?: { x: number; y: number; width: number; height: number },
  redactRatio: number = 1.0 // 1.0 = 100% black, 0.4 = 40% black
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Fill with non-black background image pixels (R=200, G=150, B=100)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 200;
    pixels[i + 1] = 150;
    pixels[i + 2] = 100;
    pixels[i + 3] = 255;
  }

  // Draw redaction box if specified
  if (redactBox) {
    let drawn = 0;
    const totalInBox = redactBox.width * redactBox.height;
    const targetRedactCount = Math.floor(totalInBox * redactRatio);

    for (let py = redactBox.y; py < redactBox.y + redactBox.height; py++) {
      for (let px = redactBox.x; px < redactBox.x + redactBox.width; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          if (drawn < targetRedactCount) {
            const idx = (py * width + px) * 4;
            pixels[idx] = 0;     // R
            pixels[idx + 1] = 0; // G
            pixels[idx + 2] = 0; // B
            pixels[idx + 3] = 255; // A
            drawn++;
          }
        }
      }
    }
  }

  return pixels;
}

// Mock FaceDetector factory returning predetermined candidate detections
function createMockFaceDetector(detectedCandidates: { x: number; y: number; width: number; height: number; confidence: number }[]) {
  return {
    detectFaces: async () => {
      return detectedCandidates.map((c, i) => ({
        id: `candidate-${i + 1}`,
        box: { x: c.x, y: c.y, width: c.width, height: c.height },
        confidence: c.confidence
      }));
    }
  };
}

describe('SanitizerVerifier Residual Face Verification Scenarios', () => {
  const verifier = new SanitizerVerifier();

  it('Scenario 1: Fully redacted face -> PASSes residual face criterion', async () => {
    const faceBox = { x: 20, y: 20, width: 40, height: 40 };
    const pixels = createSyntheticPixelBuffer(100, 100, faceBox, 1.0); // 100% black redaction

    const protectedRegion: SensitiveRegion = {
      id: 'face-001',
      source: 'FACE_DETECTOR',
      type: 'FACE',
      label: 'FACE #1',
      boundingBox: faceBox,
      unpaddedBox: faceBox,
      box: faceBox,
      paddedBox: faceBox,
      confidence: 0.95,
      reason: 'Face detected',
      padding: 0,
      paddingPx: 0
    };

    // Residual BlazeFace detects candidate box spanning over redaction box + background (neural edge artifact)
    const mockDetector = createMockFaceDetector([{ x: 15, y: 15, width: 50, height: 50, confidence: 0.75 }]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.95 }],
      originalRegions: [protectedRegion],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(true);
    expect(result.faceResiduals.residualFacesCount).toBe(0);
    expect(result.faceResiduals.instrumentationLogs).toBeDefined();
    expect(result.faceResiduals.instrumentationLogs![0].decision).toBe('PASS_DETECTOR_ARTIFACT');
  });

  it('Scenario 2: Partially redacted face -> FAILS residual face criterion', async () => {
    const faceBox = { x: 20, y: 20, width: 40, height: 40 };
    const pixels = createSyntheticPixelBuffer(100, 100, faceBox, 0.40); // Only 40% redacted (under-redacted)

    const protectedRegion: SensitiveRegion = {
      id: 'face-001',
      source: 'FACE_DETECTOR',
      type: 'FACE',
      label: 'FACE #1',
      boundingBox: faceBox,
      unpaddedBox: faceBox,
      box: faceBox,
      paddedBox: faceBox,
      confidence: 0.95,
      reason: 'Face detected',
      padding: 0,
      paddingPx: 0
    };

    const mockDetector = createMockFaceDetector([{ x: 20, y: 20, width: 40, height: 40, confidence: 0.75 }]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.95 }],
      originalRegions: [protectedRegion],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(false);
    expect(result.faceResiduals.residualFacesCount).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAIL');
  });

  it('Scenario 3: Face candidate outside protected region -> FAILS', async () => {
    const faceBox = { x: 10, y: 10, width: 20, height: 20 };
    const pixels = createSyntheticPixelBuffer(100, 100, faceBox, 1.0);

    const protectedRegion: SensitiveRegion = {
      id: 'face-001',
      source: 'FACE_DETECTOR',
      type: 'FACE',
      label: 'FACE #1',
      boundingBox: faceBox,
      unpaddedBox: faceBox,
      box: faceBox,
      paddedBox: faceBox,
      confidence: 0.95,
      reason: 'Face detected',
      padding: 0,
      paddingPx: 0
    };

    // Candidate detected far away at (70, 70) with no matching protected region
    const mockDetector = createMockFaceDetector([{ x: 70, y: 70, width: 20, height: 20, confidence: 0.80 }]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.95 }],
      originalRegions: [protectedRegion],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(false);
    expect(result.faceResiduals.residualFacesCount).toBe(1);
    expect(result.faceResiduals.instrumentationLogs![0].decision).toBe('FAIL_UNPROTECTED_CANDIDATE');
    expect(result.status).toBe('FAIL');
  });

  it('Scenario 4: Detector candidate fully inside verified destructive redaction -> PASSes', async () => {
    const faceBox = { x: 10, y: 10, width: 50, height: 50 };
    const pixels = createSyntheticPixelBuffer(100, 100, faceBox, 1.0);

    const protectedRegion: SensitiveRegion = {
      id: 'face-001',
      source: 'FACE_DETECTOR',
      type: 'FACE',
      label: 'FACE #1',
      boundingBox: faceBox,
      unpaddedBox: faceBox,
      box: faceBox,
      paddedBox: faceBox,
      confidence: 0.95,
      reason: 'Face detected',
      padding: 0,
      paddingPx: 0
    };

    // Candidate detected strictly inside the 100% black box
    const mockDetector = createMockFaceDetector([{ x: 20, y: 20, width: 30, height: 30, confidence: 0.85 }]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.95 }],
      originalRegions: [protectedRegion],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(true);
    expect(result.faceResiduals.residualFacesCount).toBe(0);
    expect(result.faceResiduals.instrumentationLogs![0].decision).toBe('PASS_DETECTOR_ARTIFACT');
  });

  it('Scenario 5: Mismatched coordinate dimensions -> INCONCLUSIVE / FAIL', async () => {
    const faceBox = { x: 10, y: 10, width: 20, height: 20 };

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 200, height: 200 } }, // Dimension mismatch!
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.95 }],
      originalRegions: []
    };

    const result = await verifier.verify(input);

    expect(result.passed).toBe(false);
    expect(result.outputIntegrity.passed).toBe(false);
  });

  it('Scenario 6: Multiple faces where Face 1 is redacted and Face 2 is under-redacted -> FAILS', async () => {
    const face1Box = { x: 10, y: 10, width: 30, height: 30 };
    const face2Box = { x: 50, y: 50, width: 30, height: 30 };

    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    // Face 1 is 100% black redacted
    for (let py = 10; py < 40; py++) {
      for (let px = 10; px < 40; px++) {
        const idx = (py * 100 + px) * 4;
        pixels[idx + 3] = 255;
      }
    }
    // Face 2 is unredacted (R=200, G=150, B=100)
    for (let py = 50; py < 80; py++) {
      for (let px = 50; px < 80; px++) {
        const idx = (py * 100 + px) * 4;
        pixels[idx] = 200; pixels[idx + 1] = 150; pixels[idx + 2] = 100; pixels[idx + 3] = 255;
      }
    }

    const protectedRegions: SensitiveRegion[] = [
      { id: 'f1', source: 'FACE_DETECTOR', type: 'FACE', label: 'F1', boundingBox: face1Box, unpaddedBox: face1Box, box: face1Box, paddedBox: face1Box, confidence: 0.9, reason: 'F1', padding: 0, paddingPx: 0 },
      { id: 'f2', source: 'FACE_DETECTOR', type: 'FACE', label: 'F2', boundingBox: face2Box, unpaddedBox: face2Box, box: face2Box, paddedBox: face2Box, confidence: 0.9, reason: 'F2', padding: 0, paddingPx: 0 }
    ];

    const mockDetector = createMockFaceDetector([
      { x: 10, y: 10, width: 30, height: 30, confidence: 0.70 }, // Artifact on F1 (PASS)
      { x: 50, y: 50, width: 30, height: 30, confidence: 0.85 }  // True residual on F2 (FAIL)
    ]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: face1Box, confidence: 0.9 }, { id: 'f2', box: face2Box, confidence: 0.9 }],
      originalRegions: protectedRegions,
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(false);
    expect(result.faceResiduals.residualFacesCount).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('Scenario 7: Zero faces in original image -> PASSes', async () => {
    const pixels = createSyntheticPixelBuffer(100, 100);
    const mockDetector = createMockFaceDetector([]);

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [],
      originalRegions: [],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.faceResiduals.passed).toBe(true);
    expect(result.faceResiduals.residualFacesCount).toBe(0);
    expect(result.passed).toBe(true);
  });
});
