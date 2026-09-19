import { describe, expect, it } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { DetectedFace, OcrResult, VerifierInput } from '../src/core/types/pipeline';

describe('Face NMS & ID-Card PII Contextual Classification Suite', () => {
  const faceDetector = new FaceDetector();
  const piiClassifier = new PiiClassifier();
  const regionMapper = new RegionMapper();
  const verifier = new SanitizerVerifier();

  it('Test 1: One face with duplicate overlapping detections -> 1 canonical face region', () => {
    const duplicateCandidates: DetectedFace[] = [
      { id: 'f1', box: { x: 100, y: 100, width: 120, height: 120 }, confidence: 0.92 },
      { id: 'f2', box: { x: 105, y: 105, width: 110, height: 115 }, confidence: 0.88 }
    ];

    const deduplicated = faceDetector.suppressDuplicateFaceDetections(duplicateCandidates);

    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].confidence).toBe(0.92);
    // Canonical box is union envelope of both boxes
    expect(deduplicated[0].box.x).toBe(100);
    expect(deduplicated[0].box.y).toBe(100);
    expect(deduplicated[0].box.width).toBe(120);
    expect(deduplicated[0].box.height).toBe(120);
  });

  it('Test 2: Two genuinely different faces -> 2 separate face regions', () => {
    const distinctCandidates: DetectedFace[] = [
      { id: 'f1', box: { x: 50, y: 50, width: 80, height: 80 }, confidence: 0.90 },
      { id: 'f2', box: { x: 400, y: 300, width: 80, height: 80 }, confidence: 0.85 }
    ];

    const deduplicated = faceDetector.suppressDuplicateFaceDetections(distinctCandidates);

    expect(deduplicated.length).toBe(2);
    expect(deduplicated[0].id).toBe('f1');
    expect(deduplicated[1].id).toBe('f2');
  });

  it('Test 3: Identity card with face + ID number + DOB -> all applicable regions detected', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: 'Priyanshu Vishwakarma', box: { x: 100, y: 50, width: 200, height: 20 }, confidence: 0.95 },
      { id: 'o2', text: 'Batch: 2024', box: { x: 100, y: 80, width: 80, height: 20 }, confidence: 0.90 },
      { id: 'o3', text: 'Reg. No: 9829685562', box: { x: 100, y: 110, width: 150, height: 20 }, confidence: 0.92 },
      { id: 'o4', text: 'DOB: 15/08/2002', box: { x: 100, y: 140, width: 120, height: 20 }, confidence: 0.93 }
    ];

    const result = piiClassifier.classify(mockOcr);

    expect(result.piiFindings.length).toBeGreaterThanOrEqual(2);
    const hasRegNo = result.piiFindings.some((f) => f.originalText.includes('9829685562') || f.originalText.includes('Reg. No'));
    const hasDob = result.piiFindings.some((f) => f.originalText.includes('15/08/2002') || f.originalText.includes('DOB'));
    expect(hasRegNo).toBe(true);
    expect(hasDob).toBe(true);
  });

  it('Test 4: Invalid dummy Aadhaar-format number in clear Aadhaar context -> sensitive identifier', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: 'Government of India', box: { x: 50, y: 20, width: 200, height: 20 }, confidence: 0.9 },
      { id: 'o2', text: 'Aadhaar Card', box: { x: 50, y: 50, width: 100, height: 20 }, confidence: 0.95 },
      { id: 'o3', text: '1234 5678 9012', box: { x: 50, y: 100, width: 150, height: 20 }, confidence: 0.92 }
    ];

    const result = piiClassifier.classify(mockOcr);

    const aadhaarFinding = result.piiFindings.find((f) => f.piiType === 'AADHAAR' || f.originalText.includes('1234'));
    expect(aadhaarFinding).toBeDefined();
  });

  it('Test 5: Valid Aadhaar number -> sensitive identifier', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: '9087 6543 2105', box: { x: 50, y: 50, width: 150, height: 20 }, confidence: 0.95 }
    ];

    const result = piiClassifier.classify(mockOcr);

    expect(result.piiFindings.length).toBe(1);
    expect(result.piiFindings[0].piiType).toBe('AADHAAR');
  });

  it('Test 6: DOB with "DOB:" label -> DOB region', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: 'DOB:', box: { x: 20, y: 20, width: 40, height: 20 }, confidence: 0.9 },
      { id: 'o2', text: '01/01/2000', box: { x: 70, y: 20, width: 80, height: 20 }, confidence: 0.95 }
    ];

    const result = piiClassifier.classify(mockOcr);

    expect(result.piiFindings.length).toBeGreaterThanOrEqual(1);
    const dobFinding = result.piiFindings.find((f) => f.originalText.includes('01/01/2000') || f.reason.includes('DOB'));
    expect(dobFinding).toBeDefined();
  });

  it('Test 7: Student/university ID number with explicit label -> sensitive ID region', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: 'Student ID:', box: { x: 10, y: 10, width: 80, height: 20 }, confidence: 0.9 },
      { id: 'o2', text: '12418826', box: { x: 100, y: 10, width: 80, height: 20 }, confidence: 0.95 }
    ];

    const result = piiClassifier.classify(mockOcr);

    expect(result.piiFindings.length).toBe(1);
    expect(result.piiFindings[0].originalText).toBe('12418826');
  });

  it('Test 8: Random number with no context -> not automatically sensitive', () => {
    const mockOcr: OcrResult[] = [
      { id: 'o1', text: 'Page 42', box: { x: 10, y: 10, width: 50, height: 20 }, confidence: 0.9 }
    ];

    const result = piiClassifier.classify(mockOcr);

    expect(result.piiFindings.length).toBe(0);
    expect(result.nonSensitiveResults.length).toBe(1);
  });

  it('Test 9: Redaction boxes align exactly with source image coordinates', () => {
    const face: DetectedFace = { id: 'f1', box: { x: 50, y: 60, width: 100, height: 120 }, confidence: 0.95 };
    const mapped = regionMapper.mapRegions([face], [], 1000, 1000, { paddingPx: 8 });

    expect(mapped.regions.length).toBe(1);
    const reg = mapped.regions[0];
    // Source box x=50, y=60, w=100, h=120 padded by 8px
    expect(reg.paddedBox.x).toBe(42);
    expect(reg.paddedBox.y).toBe(52);
    expect(reg.paddedBox.width).toBe(116);
    expect(reg.paddedBox.height).toBe(136);
  });

  it('Test 10: Verification blocks export when a required sensitive region remains unredacted', async () => {
    const faceBox = { x: 20, y: 20, width: 50, height: 50 };
    // Image is completely unredacted (all white pixels)
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    pixels.fill(255);

    const mockDetector = {
      detectFaces: async () => [{ id: 'f1', box: faceBox, confidence: 0.9 }]
    };

    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: { metadata: { width: 100, height: 100 }, pixels },
      originalFaces: [{ id: 'f1', box: faceBox, confidence: 0.9 }],
      originalRegions: [{
        id: 'r1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Face #1',
        boundingBox: faceBox,
        unpaddedBox: faceBox,
        box: faceBox,
        paddedBox: faceBox,
        confidence: 0.9,
        reason: 'Face',
        padding: 0,
        paddingPx: 0
      }],
      faceDetector: mockDetector
    };

    const result = await verifier.verify(input);

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAIL');
  });
});
