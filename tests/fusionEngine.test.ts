import { describe, it, expect } from 'vitest';
import {
  calculateIoU,
  doBoxesOverlapSignificantly,
  fuseDetections,
  unionBoxes,
} from '../src/privacy/fusionEngine';
import { BoundingBox } from '../src/types/dom';
import { DetectedRegion } from '../src/types/privacy';

describe('Detection Fusion Engine', () => {
  const boxA: BoundingBox = {
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    top: 10,
    left: 10,
    bottom: 60,
    right: 110,
  };

  const boxB: BoundingBox = {
    x: 20,
    y: 20,
    width: 80,
    height: 30,
    top: 20,
    left: 20,
    bottom: 50,
    right: 100,
  };

  const boxDisjoint: BoundingBox = {
    x: 200,
    y: 200,
    width: 50,
    height: 50,
    top: 200,
    left: 200,
    bottom: 250,
    right: 250,
  };

  it('calculates IoU and overlap correctly', () => {
    const iou = calculateIoU(boxA, boxB);
    expect(iou).toBeGreaterThan(0.3);
    expect(calculateIoU(boxA, boxDisjoint)).toBe(0);

    expect(doBoxesOverlapSignificantly(boxA, boxB)).toBe(true);
    expect(doBoxesOverlapSignificantly(boxA, boxDisjoint)).toBe(false);
  });

  it('computes union bounding box with safety padding', () => {
    const union = unionBoxes(boxA, boxB, 2);
    expect(union.x).toBe(8); // min(10, 20) - 2
    expect(union.y).toBe(8);
    expect(union.right).toBe(112); // max(110, 100) + 2
    expect(union.bottom).toBe(62); // max(60, 50) + 2
  });

  it('fuses overlapping detections into a consolidated region', () => {
    const candidate1: DetectedRegion = {
      id: 'reg_1',
      category: 'name',
      confidence: 0.85,
      boundingBox: boxA,
      source: 'ocr',
      recommendedRedaction: 'semantic_label',
      label: '[NAME REDACTED]',
    };

    const candidate2: DetectedRegion = {
      id: 'reg_2',
      category: 'credit_card',
      confidence: 0.98,
      boundingBox: boxB,
      source: 'dom',
      recommendedRedaction: 'semantic_label',
      label: '[CREDIT CARD REDACTED]',
    };

    const candidate3: DetectedRegion = {
      id: 'reg_3',
      category: 'password',
      confidence: 0.99,
      boundingBox: boxDisjoint,
      source: 'dom',
      recommendedRedaction: 'solid_rectangle',
      label: '[PASSWORD REDACTED]',
    };

    const fused = fuseDetections([candidate1, candidate2, candidate3]);

    // Candidates 1 & 2 overlap and should merge into 1 fused region
    // Candidate 3 is disjoint and remains separate
    expect(fused.length).toBe(2);

    const merged = fused.find((f) => f.category === 'credit_card');
    expect(merged).toBeDefined();
    expect(merged?.confidence).toBe(0.98); // higher confidence preserved
    expect(merged?.source).toBe('fusion');
  });
});
