/**
 * Local Pixel Redaction Engine:
 * Implements local, irreversible image sanitization on pixel buffers.
 * Supports:
 * - Solid rectangle mode
 * - Pixelation / Mosaic mode
 * - Local Box/Gaussian Blur mode
 * - Semantic replacement representation
 *
 * Guarantees:
 * - Never mutates the original image buffer (clean separation in memory).
 * - Never modifies pixels outside target bounding boxes.
 * - Zero network egress during transformation.
 */

import { BoundingBox } from '../types/dom';
import { RedactionItem, RedactionOptions, SanitizedImageData } from '../types/redaction';

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Parses a hex color string (e.g. #0f172a) into [r, g, b, a] tuple.
 */
function parseHexColor(hex: string, alpha = 255): [number, number, number, number] {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) {
    return [15, 23, 42, alpha]; // Default slate-900
  }
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return [r, g, b, alpha];
}

/**
 * Applies solid rectangle redaction strictly within the specified bounding box.
 */
export function applySolidRectangle(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  box: BoundingBox,
  fillColorHex = '#0f172a'
): void {
  const [r, g, b, a] = parseHexColor(fillColorHex);

  const startX = Math.max(0, box.x);
  const endX = Math.min(imgWidth, box.x + box.width);
  const startY = Math.max(0, box.y);
  const endY = Math.min(imgHeight, box.y + box.height);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * imgWidth + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
}

/**
 * Applies pixelation / mosaic effect strictly within the bounding box.
 */
export function applyPixelation(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  box: BoundingBox,
  blockSize = 8
): void {
  const bSize = Math.max(2, blockSize);
  const startX = Math.max(0, box.x);
  const endX = Math.min(imgWidth, box.x + box.width);
  const startY = Math.max(0, box.y);
  const endY = Math.min(imgHeight, box.y + box.height);

  for (let y = startY; y < endY; y += bSize) {
    for (let x = startX; x < endX; x += bSize) {
      const cellEndX = Math.min(endX, x + bSize);
      const cellEndY = Math.min(endY, y + bSize);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let cy = y; cy < cellEndY; cy++) {
        for (let cx = x; cx < cellEndX; cx++) {
          const idx = (cy * imgWidth + cx) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          count++;
        }
      }

      if (count > 0) {
        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);

        for (let cy = y; cy < cellEndY; cy++) {
          for (let cx = x; cx < cellEndX; cx++) {
            const idx = (cy * imgWidth + cx) * 4;
            data[idx] = avgR;
            data[idx + 1] = avgG;
            data[idx + 2] = avgB;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }
}

/**
 * Applies local 2-pass box blur strictly confined to the bounding box.
 * Sampling is clamped inside the bounding box edges so no bleed occurs
 * into surrounding pixels, and sensitive features are permanently smoothed.
 */
export function applyLocalBlur(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  box: BoundingBox,
  radius = 10
): void {
  const r = Math.max(1, radius);
  const startX = Math.max(0, box.x);
  const endX = Math.min(imgWidth, box.x + box.width);
  const startY = Math.max(0, box.y);
  const endY = Math.min(imgHeight, box.y + box.height);

  const boxW = endX - startX;
  const boxH = endY - startY;

  if (boxW <= 0 || boxH <= 0) return;

  // Temporary buffer for the region
  const temp = new Uint8ClampedArray(boxW * boxH * 4);

  // Horizontal blur pass
  for (let y = startY; y < endY; y++) {
    const localY = y - startY;
    for (let x = startX; x < endX; x++) {
      const localX = x - startX;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;

      for (let kx = -r; kx <= r; kx++) {
        const sampleX = Math.min(endX - 1, Math.max(startX, x + kx));
        const idx = (y * imgWidth + sampleX) * 4;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        count++;
      }

      const tempIdx = (localY * boxW + localX) * 4;
      temp[tempIdx] = Math.round(sumR / count);
      temp[tempIdx + 1] = Math.round(sumG / count);
      temp[tempIdx + 2] = Math.round(sumB / count);
      temp[tempIdx + 3] = 255;
    }
  }

  // Vertical blur pass directly into destination data
  for (let x = startX; x < endX; x++) {
    const localX = x - startX;
    for (let y = startY; y < endY; y++) {
      const localY = y - startY;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;

      for (let ky = -r; ky <= r; ky++) {
        const sampleLocalY = Math.min(boxH - 1, Math.max(0, localY + ky));
        const tempIdx = (sampleLocalY * boxW + localX) * 4;
        sumR += temp[tempIdx];
        sumG += temp[tempIdx + 1];
        sumB += temp[tempIdx + 2];
        count++;
      }

      const idx = (y * imgWidth + x) * 4;
      data[idx] = Math.round(sumR / count);
      data[idx + 1] = Math.round(sumG / count);
      data[idx + 2] = Math.round(sumB / count);
      data[idx + 3] = 255;
    }
  }
}

/**
 * Applies semantic label styling to a bounding box.
 * In raw pixel mode: renders a clean slate pill with an identifiable border.
 */
export function applySemanticPill(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  box: BoundingBox,
  bgColorHex = '#1e293b',
  borderColorHex = '#38bdf8'
): void {
  const [bgR, bgG, bgB, bgA] = parseHexColor(bgColorHex);
  const [borderR, borderG, borderB, borderA] = parseHexColor(borderColorHex);

  const startX = Math.max(0, box.x);
  const endX = Math.min(imgWidth, box.x + box.width);
  const startY = Math.max(0, box.y);
  const endY = Math.min(imgHeight, box.y + box.height);

  for (let y = startY; y < endY; y++) {
    const isBorderY = y === startY || y === endY - 1;
    for (let x = startX; x < endX; x++) {
      const isBorderX = x === startX || x === endX - 1;
      const idx = (y * imgWidth + x) * 4;

      if (isBorderX || isBorderY) {
        data[idx] = borderR;
        data[idx + 1] = borderG;
        data[idx + 2] = borderB;
        data[idx + 3] = borderA;
      } else {
        data[idx] = bgR;
        data[idx + 1] = bgG;
        data[idx + 2] = bgB;
        data[idx + 3] = bgA;
      }
    }
  }
}

/**
 * Main pixel redaction function:
 * Produces a brand-new sanitized pixel buffer without mutating the original input.
 */
export function redactPixelBuffer(
  input: PixelBuffer,
  items: RedactionItem[],
  options: RedactionOptions = {}
): SanitizedImageData {
  // CRITICAL SECURITY RULE: Never mutate input source buffer
  const sanitized = new Uint8ClampedArray(input.data);
  const { width, height } = input;

  for (const item of items) {
    const box = item.boundingBox;

    switch (item.mode) {
      case 'solid_rectangle':
        applySolidRectangle(
          sanitized,
          width,
          height,
          box,
          options.solidFillColor || '#0f172a'
        );
        break;

      case 'pixelate':
        applyPixelation(
          sanitized,
          width,
          height,
          box,
          options.pixelateBlockSize || 8
        );
        break;

      case 'blur':
        applyLocalBlur(
          sanitized,
          width,
          height,
          box,
          options.blurRadius || 10
        );
        break;

      case 'semantic_label':
      default:
        applySemanticPill(
          sanitized,
          width,
          height,
          box,
          options.semanticBgColor || '#1e293b',
          '#38bdf8'
        );
        break;
    }
  }

  return {
    width,
    height,
    data: sanitized,
  };
}
