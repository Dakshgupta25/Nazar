import { describe, it, expect } from 'vitest';
import {
  isValidBox,
  clampBox,
  applyPadding,
  intersection,
  union,
  contains
} from '../src/core/geometry/geometryUtils';
import { BoundingBox } from '../src/core/types/pipeline';

describe('Geometry Utils Tests', () => {
  describe('isValidBox', () => {
    it('returns true for valid boxes with positive dimensions', () => {
      expect(isValidBox({ x: 10, y: 20, width: 100, height: 50 })).toBe(true);
      expect(isValidBox({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    });

    it('returns false for negative dimensions or NaN/Infinity values', () => {
      expect(isValidBox({ x: -10, y: 20, width: 100, height: 50 })).toBe(false);
      expect(isValidBox({ x: 10, y: -20, width: 100, height: 50 })).toBe(false);
      expect(isValidBox({ x: 10, y: 20, width: 0, height: 50 })).toBe(false);
      expect(isValidBox({ x: 10, y: 20, width: 100, height: -5 })).toBe(false);
      expect(isValidBox({ x: NaN, y: 20, width: 100, height: 50 })).toBe(false);
      expect(isValidBox({ x: 10, y: Infinity, width: 100, height: 50 })).toBe(false);
    });
  });

  describe('clampBox', () => {
    it('clamps box coordinates and dimensions to image bounds', () => {
      const imgWidth = 800;
      const imgHeight = 600;

      // Partially out of bounds (top-left)
      const box1: BoundingBox = { x: -10, y: -20, width: 100, height: 100 };
      const clamped1 = clampBox(box1, imgWidth, imgHeight);
      expect(clamped1).toEqual({ x: 0, y: 0, width: 90, height: 80 });

      // Partially out of bounds (bottom-right)
      const box2: BoundingBox = { x: 750, y: 550, width: 100, height: 100 };
      const clamped2 = clampBox(box2, imgWidth, imgHeight);
      expect(clamped2).toEqual({ x: 750, y: 550, width: 50, height: 50 });

      // Entirely within bounds
      const box3: BoundingBox = { x: 100, y: 100, width: 200, height: 150 };
      const clamped3 = clampBox(box3, imgWidth, imgHeight);
      expect(clamped3).toEqual(box3);
    });
  });

  describe('applyPadding', () => {
    it('expands box by padding amount on all 4 sides', () => {
      const box: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
      const padded = applyPadding(box, 10, 800, 600);
      expect(padded).toEqual({ x: 40, y: 40, width: 120, height: 120 });
    });

    it('clips padded box to image boundaries so coordinates stay non-negative', () => {
      const boxNearEdge: BoundingBox = { x: 5, y: 5, width: 50, height: 50 };
      const padded = applyPadding(boxNearEdge, 10, 800, 600);
      // x = max(0, 5 - 10) = 0, y = max(0, 5 - 10) = 0
      expect(padded.x).toBe(0);
      expect(padded.y).toBe(0);
      expect(padded.x + padded.width).toBeLessThanOrEqual(800);
      expect(padded.y + padded.height).toBeLessThanOrEqual(600);
    });
  });

  describe('intersection', () => {
    it('calculates rectangle of overlapping region', () => {
      const box1: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const box2: BoundingBox = { x: 30, y: 30, width: 50, height: 50 };
      const inter = intersection(box1, box2);
      expect(inter).toEqual({ x: 30, y: 30, width: 30, height: 30 });
    });

    it('returns null if boxes do not overlap', () => {
      const box1: BoundingBox = { x: 10, y: 10, width: 20, height: 20 };
      const box2: BoundingBox = { x: 50, y: 50, width: 20, height: 20 };
      expect(intersection(box1, box2)).toBeNull();
    });
  });

  describe('union', () => {
    it('returns minimal bounding box enclosing both boxes', () => {
      const box1: BoundingBox = { x: 10, y: 10, width: 20, height: 20 };
      const box2: BoundingBox = { x: 50, y: 40, width: 30, height: 30 };
      const u = union(box1, box2);
      expect(u).toEqual({ x: 10, y: 10, width: 70, height: 60 });
    });
  });

  describe('contains', () => {
    it('returns true if containerBox fully contains testBox', () => {
      const outer: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
      const inner: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      expect(contains(outer, inner)).toBe(true);
    });

    it('returns false if testBox extends outside containerBox', () => {
      const outer: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const inner: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
      expect(contains(outer, inner)).toBe(false);
    });
  });
});
