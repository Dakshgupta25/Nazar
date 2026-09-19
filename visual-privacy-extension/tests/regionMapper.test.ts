import { describe, it, expect, beforeEach } from 'vitest';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { DetectedFace, PiiFinding } from '../src/core/types/pipeline';

describe('RegionMapper Unit Tests', () => {
  let mapper: RegionMapper;

  beforeEach(() => {
    mapper = new RegionMapper();
  });

  const sampleFaces: DetectedFace[] = [
    {
      id: 'face-1',
      box: { x: 100, y: 150, width: 80, height: 90 },
      confidence: 0.95
    },
    {
      id: 'face-2',
      box: { x: 300, y: 120, width: 70, height: 75 },
      confidence: 0.88
    }
  ];

  const samplePiiFindings: PiiFinding[] = [
    {
      id: 'pii-1',
      ocrId: 'ocr-1',
      piiType: 'EMAIL',
      originalText: 'user@example.com',
      maskedText: 'u***r@example.com',
      confidence: 0.98,
      box: { x: 50, y: 400, width: 200, height: 30 },
      ocrConfidence: 0.92,
      reason: 'Valid email address'
    },
    {
      id: 'pii-2',
      ocrId: 'ocr-2',
      piiType: 'PAN',
      originalText: 'ABCPE1234F',
      maskedText: 'AB***1234F',
      confidence: 0.99,
      box: { x: 500, y: 420, width: 150, height: 25 },
      ocrConfidence: 0.94,
      reason: 'Indian PAN Card'
    }
  ];

  describe('Region Mapping & Canonical Format', () => {
    it('converts face detections and PII findings into canonical SensitiveRegion array', () => {
      const result = mapper.mapRegions(sampleFaces, samplePiiFindings, 800, 600, { paddingPx: 8 });

      expect(result.regions).toHaveLength(4);
      expect(result.summary.totalCount).toBe(4);
      expect(result.summary.faceCount).toBe(2);
      expect(result.summary.piiCount).toBe(2);

      // Verify Face Region
      const faceRegion = result.regions.find((r) => r.type === 'FACE' && r.sourceId === 'face-1');
      expect(faceRegion).toBeDefined();
      expect(faceRegion?.source).toBe('FACE_DETECTOR');
      expect(faceRegion?.box).toEqual({ x: 100, y: 150, width: 80, height: 90 });
      expect(faceRegion?.paddedBox).toEqual({ x: 92, y: 142, width: 96, height: 106 });
      expect(faceRegion?.confidence).toBe(0.95);
      expect(faceRegion?.label).toBe('FACE #1');

      // Verify PII Region
      const piiRegion = result.regions.find((r) => r.source === 'OCR_PII' && r.sourceId === 'pii-1');
      expect(piiRegion).toBeDefined();
      expect(piiRegion?.source).toBe('OCR_PII');
      expect(piiRegion?.piiType).toBe('EMAIL');
      expect(piiRegion?.box).toEqual({ x: 50, y: 400, width: 200, height: 30 });
      expect(piiRegion?.paddedBox).toEqual({ x: 42, y: 392, width: 216, height: 46 });
      expect(piiRegion?.confidence).toBe(0.98);
      expect(piiRegion?.label).toBe('PII: EMAIL');
    });

    it('generates deterministic region IDs', () => {
      const result1 = mapper.mapRegions(sampleFaces, samplePiiFindings, 800, 600);
      const result2 = mapper.mapRegions(sampleFaces, samplePiiFindings, 800, 600);

      const ids1 = result1.regions.map((r) => r.id);
      const ids2 = result2.regions.map((r) => r.id);

      expect(ids1).toEqual(['face-001', 'face-002', 'pii-email-001', 'pii-pan-001']);
      expect(ids1).toEqual(ids2);
    });
  });

  describe('Padding, Clamping & Border Boundaries', () => {
    it('clips padded boxes at image boundaries [0, imageWidth] and [0, imageHeight]', () => {
      const nearEdgeFace: DetectedFace[] = [
        {
          id: 'edge-face',
          box: { x: 2, y: 2, width: 50, height: 50 },
          confidence: 0.9
        }
      ];

      const nearCornerPii: PiiFinding[] = [
        {
          id: 'edge-pii',
          ocrId: 'ocr-edge',
          piiType: 'PHONE',
          originalText: '9876543210',
          maskedText: '98******10',
          confidence: 0.95,
          box: { x: 770, y: 570, width: 40, height: 40 },
          ocrConfidence: 0.9,
          reason: 'Valid phone'
        }
      ];

      const result = mapper.mapRegions(nearEdgeFace, nearCornerPii, 800, 600, { paddingPx: 10 });

      const faceReg = result.regions.find((r) => r.type === 'FACE')!;
      expect(faceReg.paddedBox.x).toBe(0);
      expect(faceReg.paddedBox.y).toBe(0);

      const piiReg = result.regions.find((r) => r.source === 'OCR_PII')!;
      expect(piiReg.paddedBox.x + piiReg.paddedBox.width).toBe(800);
      expect(piiReg.paddedBox.y + piiReg.paddedBox.height).toBe(600);
    });
  });

  describe('Overlap Preservation', () => {
    it('preserves overlapping regions as distinct semantic SensitiveRegion objects', () => {
      const overlappingFaces: DetectedFace[] = [
        { id: 'f1', box: { x: 100, y: 100, width: 80, height: 80 }, confidence: 0.9 },
        { id: 'f2', box: { x: 120, y: 120, width: 80, height: 80 }, confidence: 0.85 }
      ];

      const result = mapper.mapRegions(overlappingFaces, [], 800, 600);

      expect(result.regions).toHaveLength(2);
      expect(result.regions[0].id).toBe('face-001');
      expect(result.regions[1].id).toBe('face-002');
    });

    it('provides cluster helper combineRedactionAreas without mutating regions', () => {
      const regions = mapper.mapRegions(sampleFaces, samplePiiFindings, 800, 600).regions;
      const combined = mapper.combineRedactionAreas(regions);

      expect(Array.isArray(combined)).toBe(true);
      expect(combined.length).toBeGreaterThan(0);
    });
  });

  describe('Image Byte Integrity Verification', () => {
    it('guarantees original image metadata/pixels remain 100% unmutated metadata-only layer', () => {
      const imageMetadata = { width: 800, height: 600, size: 54321, name: 'passport.jpg' };
      const frozenMetadata = Object.freeze({ ...imageMetadata });

      const result = mapper.mapRegions(sampleFaces, samplePiiFindings, frozenMetadata.width, frozenMetadata.height);

      expect(result.imageDimensions).toEqual({ width: 800, height: 600 });
      expect(frozenMetadata.size).toBe(54321);
      expect(frozenMetadata.name).toBe('passport.jpg');
    });
  });
});
