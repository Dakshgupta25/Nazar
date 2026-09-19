import { BoundingBox } from '../types/pipeline';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Validates if a bounding box has finite, positive dimensions.
 */
export function isValidBox(box: BoundingBox, imageBounds?: ImageDimensions): boolean {
  if (!box) return false;

  const { x, y, width, height } = box;

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return false;
  }

  if (width <= 0 || height <= 0) {
    return false;
  }

  if (!imageBounds && (x < 0 || y < 0)) {
    return false;
  }

  if (imageBounds) {
    if (!Number.isFinite(imageBounds.width) || !Number.isFinite(imageBounds.height)) {
      return false;
    }
    if (imageBounds.width <= 0 || imageBounds.height <= 0) {
      return false;
    }
    // Completely outside image bounds
    if (x >= imageBounds.width || y >= imageBounds.height || x + width <= 0 || y + height <= 0) {
      return false;
    }
  }

  return true;
}

/**
 * Safely clamps bounding box coordinates to lie strictly within image boundaries.
 */
export function clampBox(box: BoundingBox, imageWidthOrBounds: number | ImageDimensions, imageHeight?: number): BoundingBox | null {
  const bounds: ImageDimensions = typeof imageWidthOrBounds === 'number'
    ? { width: imageWidthOrBounds, height: imageHeight || 0 }
    : imageWidthOrBounds;

  if (!isValidBox(box, bounds)) {
    return null;
  }

  const clampX = Math.max(0, Math.min(box.x, bounds.width));
  const clampY = Math.max(0, Math.min(box.y, bounds.height));

  const maxRight = Math.min(bounds.width, box.x + box.width);
  const maxBottom = Math.min(bounds.height, box.y + box.height);

  const clampedWidth = maxRight - clampX;
  const clampedHeight = maxBottom - clampY;

  if (clampedWidth <= 0 || clampedHeight <= 0) {
    return null;
  }

  return {
    x: clampX,
    y: clampY,
    width: clampedWidth,
    height: clampedHeight
  };
}

/**
 * Applies pixel padding to a bounding box, clipping the result inside image bounds.
 */
export function applyPadding(
  box: BoundingBox,
  padding: number,
  imageWidthOrBounds: number | ImageDimensions,
  imageHeight?: number
): BoundingBox {
  const bounds: ImageDimensions = typeof imageWidthOrBounds === 'number'
    ? { width: imageWidthOrBounds, height: imageHeight || 0 }
    : imageWidthOrBounds;

  const validPadding = Math.max(0, Number.isFinite(padding) ? padding : 0);

  const x = Math.max(0, Math.min(box.x - validPadding, bounds.width));
  const y = Math.max(0, Math.min(box.y - validPadding, bounds.height));

  const right = Math.min(bounds.width, Math.max(0, box.x + box.width + validPadding));
  const bottom = Math.min(bounds.height, Math.max(0, box.y + box.height + validPadding));

  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);

  return { x, y, width, height };
}

/**
 * Calculates the intersection rectangle between two bounding boxes.
 */
export function intersection(box1: BoundingBox, box2: BoundingBox): BoundingBox | null {
  if (!isValidBox(box1) || !isValidBox(box2)) {
    return null;
  }

  const x = Math.max(box1.x, box2.x);
  const y = Math.max(box1.y, box2.y);
  const right = Math.min(box1.x + box1.width, box2.x + box2.width);
  const bottom = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (right > x && bottom > y) {
    return {
      x,
      y,
      width: right - x,
      height: bottom - y
    };
  }

  return null;
}

/**
 * Calculates the union (bounding envelope) containing both bounding boxes.
 */
export function union(box1: BoundingBox, box2: BoundingBox): BoundingBox {
  const x = Math.min(box1.x, box2.x);
  const y = Math.min(box1.y, box2.y);
  const right = Math.max(box1.x + box1.width, box2.x + box2.width);
  const bottom = Math.max(box1.y + box1.height, box2.y + box2.height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

/**
 * Checks if parentBox completely contains childBox.
 */
export function contains(parentBox: BoundingBox, childBox: BoundingBox): boolean {
  if (!isValidBox(parentBox) || !isValidBox(childBox)) {
    return false;
  }

  return (
    childBox.x >= parentBox.x &&
    childBox.y >= parentBox.y &&
    childBox.x + childBox.width <= parentBox.x + parentBox.width &&
    childBox.y + childBox.height <= parentBox.y + parentBox.height
  );
}

/**
 * Calculates Intersection over Union (IoU) between two bounding boxes.
 */
export function iou(box1: BoundingBox, box2: BoundingBox): number {
  const inter = intersection(box1, box2);
  if (!inter) return 0;
  const interArea = inter.width * inter.height;
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

export class GeometryUtils {
  public static isValidBox = isValidBox;
  public static clampBox = clampBox;
  public static applyPadding = applyPadding;
  public static intersection = intersection;
  public static union = union;
  public static contains = contains;
  public static iou = iou;
}
