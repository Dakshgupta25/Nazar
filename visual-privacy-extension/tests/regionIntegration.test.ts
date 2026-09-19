import { describe, it, expect } from 'vitest';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { DetectedFace, OcrResult } from '../src/core/types/pipeline';

describe('Region Mapping End-to-End Integration Tests', () => {
  it('executes full pipeline flow: OCR -> PII Classifier -> Region Mapper', () => {
    const ocrItems: OcrResult[] = [
      {
        id: 'ocr-email',
        text: 'Contact: privacy.officer@domain.org',
        confidence: 0.95,
        box: { x: 40, y: 100, width: 250, height: 30 }
      },
      {
        id: 'ocr-phone',
        text: 'Mobile: +91 9876543210',
        confidence: 0.92,
        box: { x: 40, y: 150, width: 200, height: 30 }
      },
      {
        id: 'ocr-header',
        text: 'OFFICIAL IDENTIFICATION CARD',
        confidence: 0.97,
        box: { x: 100, y: 20, width: 400, height: 40 }
      }
    ];

    const detectedFaces: DetectedFace[] = [
      {
        id: 'face-main',
        box: { x: 450, y: 100, width: 150, height: 180 },
        confidence: 0.96
      }
    ];

    // Step 1: PII Classification
    const piiClassifier = new PiiClassifier();
    const piiResult = piiClassifier.classify(ocrItems);

    expect(piiResult.piiFindings).toHaveLength(2);
    expect(piiResult.nonSensitiveResults).toHaveLength(1);

    // Step 2: Region Mapping
    const regionMapper = new RegionMapper();
    const mappingResult = regionMapper.mapRegions(
      detectedFaces,
      piiResult.piiFindings,
      800,
      600,
      { paddingPx: 8 }
    );

    // Step 3: Assertions
    expect(mappingResult.regions).toHaveLength(3); // 1 face + 2 PII
    expect(mappingResult.summary.totalCount).toBe(3);
    expect(mappingResult.summary.faceCount).toBe(1);
    expect(mappingResult.summary.piiCount).toBe(2);

    const faceRegion = mappingResult.regions.find((r) => r.type === 'FACE');
    expect(faceRegion).toBeDefined();
    expect(faceRegion?.id).toBe('face-001');
    expect(faceRegion?.box).toEqual({ x: 450, y: 100, width: 150, height: 180 });

    const emailRegion = mappingResult.regions.find((r) => r.piiType === 'EMAIL');
    expect(emailRegion).toBeDefined();
    expect(emailRegion?.paddedBox).toEqual({ x: 32, y: 92, width: 266, height: 46 });

    const phoneRegion = mappingResult.regions.find((r) => r.piiType === 'PHONE');
    expect(phoneRegion).toBeDefined();
    expect(phoneRegion?.paddedBox).toEqual({ x: 32, y: 142, width: 216, height: 46 });

    // Verify non-destructive metadata integrity
    expect(mappingResult.mappingTimeMs).toBeGreaterThanOrEqual(0);
  });
});
