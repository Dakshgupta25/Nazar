/**
 * Detection Normalization and Fusion Engine:
 * Merges signals from DOM sensitivity analysis, OCR detections, Face detection,
 * and PII pattern matchers into a single coherent set of sanitized regions.
 * Resolves overlapping bounding boxes and assigns optimal redaction modes.
 */

import { BoundingBox } from '../types/dom';
import {
  DetectedRegion,
  RecommendedRedactionMode,
  SensitiveCategory,
} from '../types/privacy';

/**
 * Calculates Intersection over Union (IoU) of two bounding boxes.
 */
export function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * Determines whether two boxes overlap by more than a threshold or one contains the other.
 */
export function doBoxesOverlapSignificantly(
  boxA: BoundingBox,
  boxB: BoundingBox,
  iouThreshold = 0.4
): boolean {
  if (calculateIoU(boxA, boxB) >= iouThreshold) {
    return true;
  }

  // Check containment (e.g. OCR word inside an input box)
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;

  // Containment >= 75%
  return (areaA > 0 && interArea / areaA >= 0.75) || (areaB > 0 && interArea / areaB >= 0.75);
}

/**
 * Merges two bounding boxes into an enveloping union box with safety padding.
 */
export function unionBoxes(boxA: BoundingBox, boxB: BoundingBox, padding = 2): BoundingBox {
  const minX = Math.max(0, Math.min(boxA.x, boxB.x) - padding);
  const minY = Math.max(0, Math.min(boxA.y, boxB.y) - padding);
  const maxX = Math.max(boxA.x + boxA.width, boxB.x + boxB.width) + padding;
  const maxY = Math.max(boxA.y + boxA.height, boxB.y + boxB.height) + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    x: minX,
    y: minY,
    width,
    height,
    top: minY,
    left: minX,
    bottom: maxY,
    right: maxX,
  };
}

/**
 * Formats a clean privacy label for a category.
 */
export function formatRedactionLabel(category: SensitiveCategory): string {
  const formatted = category.toUpperCase().replace('_', ' ');
  return `[${formatted} REDACTED]`;
}

/**
 * Decides the recommended redaction mode for a category.
 */
export function determineRedactionMode(category: SensitiveCategory): RecommendedRedactionMode {
  switch (category) {
    case 'face':
      return 'blur';
    case 'password':
    case 'security_code':
      return 'solid_rectangle';
    default:
      return 'semantic_label';
  }
}

/**
 * Merges multiple detected candidates, resolves spatial overlaps,
 * and generates a consolidated list of DetectedRegions.
 */
export function fuseDetections(rawRegions: DetectedRegion[]): DetectedRegion[] {
  if (rawRegions.length <= 1) {
    return rawRegions;
  }

  const fused: DetectedRegion[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < rawRegions.length; i++) {
    if (processed.has(i)) continue;

    let current = { ...rawRegions[i] };
    processed.add(i);

    for (let j = i + 1; j < rawRegions.length; j++) {
      if (processed.has(j)) continue;

      const candidate = rawRegions[j];
      if (doBoxesOverlapSignificantly(current.boundingBox, candidate.boundingBox)) {
        processed.add(j);

        // Merge bounding boxes with safety margin
        current.boundingBox = unionBoxes(current.boundingBox, candidate.boundingBox);

        // Prefer higher confidence
        current.confidence = Math.max(current.confidence, candidate.confidence);

        // Prefer specific category over generic category
        if (current.category === 'name' && candidate.category !== 'name') {
          current.category = candidate.category;
        }

        current.source = 'fusion';
        current.label = formatRedactionLabel(current.category);
        current.recommendedRedaction = determineRedactionMode(current.category);
      }
    }

    fused.push(current);
  }

  return fused;
}
