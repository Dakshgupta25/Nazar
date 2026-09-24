/**
 * Redaction Geometry Operations:
 * Provides bounding-box safety padding, boundary clamping,
 * overlap detection, and box unioning for the redaction engine.
 */

import { BoundingBox } from '../types/dom';
import { calculateIoU, unionBoxes } from '../privacy/fusionEngine';
import { RedactionItem } from '../types/redaction';

export interface BoxDimensions {
  width: number;
  height: number;
}

/**
 * Expands a bounding box by a safety padding (in pixels) on all sides,
 * ensuring no edge pixels, partial character contours, or facial margins leak.
 * Clamps coordinates to [0, maxBounds].
 */
export function expandBoundingBox(
  box: BoundingBox,
  padding: number,
  maxBounds?: BoxDimensions
): BoundingBox {
  const p = Math.max(0, padding);
  let left = box.x - p;
  let top = box.y - p;
  let right = box.x + box.width + p;
  let bottom = box.y + box.height + p;

  if (maxBounds) {
    left = Math.max(0, Math.min(left, maxBounds.width));
    top = Math.max(0, Math.min(top, maxBounds.height));
    right = Math.max(0, Math.min(right, maxBounds.width));
    bottom = Math.max(0, Math.min(bottom, maxBounds.height));
  } else {
    left = Math.max(0, left);
    top = Math.max(0, top);
  }

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(right),
    bottom: Math.round(bottom),
  };
}

/**
 * Checks whether two boxes overlap or are adjacent with zero gap.
 */
export function doBoxesIntersect(boxA: BoundingBox, boxB: BoundingBox, margin = 2): boolean {
  return !(
    boxA.x + boxA.width + margin < boxB.x ||
    boxB.x + boxB.width + margin < boxA.x ||
    boxA.y + boxA.height + margin < boxB.y ||
    boxB.y + boxB.height + margin < boxA.y
  );
}

/**
 * Resolves overlapping redaction items.
 * If two redactions overlap significantly:
 * - If they share the same redaction mode, merge their bounding boxes.
 * - If modes differ, preserves the more protective mode (solid_rectangle > pixelate > blur > semantic_label).
 */
export function resolveRedactionOverlaps(items: RedactionItem[]): RedactionItem[] {
  if (items.length <= 1) {
    return [...items];
  }

  const modePrecedence: Record<string, number> = {
    solid_rectangle: 4,
    pixelate: 3,
    blur: 2,
    semantic_label: 1,
  };

  const result: RedactionItem[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (processed.has(i)) continue;

    let current = { ...items[i] };
    processed.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (processed.has(j)) continue;

      const candidate = items[j];
      const iou = calculateIoU(current.boundingBox, candidate.boundingBox);
      const intersects = doBoxesIntersect(current.boundingBox, candidate.boundingBox, 0);

      // Merge if significant overlap or direct intersection with containment
      if (iou > 0.1 || intersects) {
        processed.add(j);

        // Union bounding boxes
        current.boundingBox = unionBoxes(current.boundingBox, candidate.boundingBox, 0);
        current.originalBoundingBox = unionBoxes(
          current.originalBoundingBox,
          candidate.originalBoundingBox,
          0
        );

        // Select more protective mode if they differ
        const curScore = modePrecedence[current.mode] || 0;
        const candScore = modePrecedence[candidate.mode] || 0;
        if (candScore > curScore) {
          current.mode = candidate.mode;
        }

        // Combine labels if different categories
        if (current.category !== candidate.category) {
          current.label = `${current.label} & ${candidate.label}`;
        }
      }
    }

    result.push(current);
  }

  return result;
}
