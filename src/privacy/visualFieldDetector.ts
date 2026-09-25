/**
 * NAZAR Visual Text Field & Form Input Detector:
 * Detects form input fields, text areas, masked password boxes, and sensitive text regions
 * directly from visual pixel buffers and OCR tokens without DOM information.
 *
 * Runs 100% locally on the client device with zero network transmission.
 */

import { BoundingBox } from '../types/dom';
import { DetectedRegion, OcrWordMatch, SensitiveCategory } from '../types/privacy';
import { PixelBuffer } from '../redaction/pixelRedactor';
import { formatRedactionLabel } from './fusionEngine';

export interface VisualInputField {
  boundingBox: BoundingBox;
  hasMaskedContent?: boolean;
  confidence: number;
}

/**
 * Creates a normalized bounding box.
 */
function createBox(x: number, y: number, width: number, height: number): BoundingBox {
  const rx = Math.max(0, Math.round(x));
  const ry = Math.max(0, Math.round(y));
  const rw = Math.max(10, Math.round(width));
  const rh = Math.max(10, Math.round(height));
  return {
    x: rx,
    y: ry,
    width: rw,
    height: rh,
    top: ry,
    left: rx,
    bottom: ry + rh,
    right: rx + rw,
  };
}

/**
 * Maps common label text keywords to their corresponding SensitiveCategory.
 */
export function matchLabelToSensitiveCategory(labelText: string): SensitiveCategory | null {
  const clean = labelText.toLowerCase().replace(/[^a-z0-9\s/_-]/g, ' ').trim();

  // 1. Password / Secret / PIN
  if (
    clean.includes('password') ||
    clean.includes('passwd') ||
    clean.includes('passcode') ||
    clean.includes('secret code') ||
    clean.includes('security code') ||
    clean.includes('pin code') ||
    clean.includes('cvv') ||
    clean.includes('cvc')
  ) {
    if (clean.includes('cvv') || clean.includes('cvc') || clean.includes('security code')) {
      return 'security_code';
    }
    return 'password';
  }

  // 2. Credit / Debit Card
  if (
    clean.includes('credit card') ||
    clean.includes('card number') ||
    clean.includes('debit card') ||
    clean.includes('card no') ||
    clean.includes('cardholder')
  ) {
    return 'credit_card';
  }

  // 3. Email Address
  if (
    clean.includes('email') ||
    clean.includes('e-mail') ||
    clean.includes('mail address')
  ) {
    return 'email';
  }

  // 4. Phone / Mobile Number
  if (
    clean.includes('phone') ||
    clean.includes('mobile') ||
    clean.includes('telephone') ||
    clean.includes('contact number') ||
    clean.includes('cell number') ||
    clean === 'tel' ||
    clean.includes('phone number')
  ) {
    return 'phone';
  }

  // 5. API Key / Auth Token / Secret Key
  if (
    clean.includes('api key') ||
    clean.includes('auth token') ||
    clean.includes('access token') ||
    clean.includes('api token') ||
    clean.includes('secret key') ||
    clean.includes('bearer') ||
    clean.includes('private key') ||
    clean.includes('client secret') ||
    clean.includes('token')
  ) {
    return 'api_key';
  }

  // 6. Aadhaar / SSN / National Identity
  if (clean.includes('aadhaar') || clean.includes('adhar') || clean.includes('uidai')) {
    return 'aadhaar';
  }
  if (clean.includes('ssn') || clean.includes('social security') || clean.includes('passport')) {
    return 'passport';
  }

  // 7. Physical Address
  if (
    clean.includes('street address') ||
    clean.includes('billing address') ||
    clean.includes('shipping address') ||
    clean.includes('delivery address') ||
    clean.includes('home address')
  ) {
    return 'address';
  }

  // 8. Full Name
  if (clean.includes('full name') || clean.includes('applicant name') || clean.includes('user name')) {
    return 'name';
  }

  return null;
}

/**
 * Detects visual rectangular input fields directly from a pixel buffer.
 * Identifies form input boxes, text areas, and field wells by border and contrast analysis.
 */
export function detectVisualInputBoxes(buffer: PixelBuffer): VisualInputField[] {
  const { width, height, data } = buffer;
  if (width < 50 || height < 50 || !data || data.length === 0) return [];

  const foundBoxes: VisualInputField[] = [];

  // Convert to grayscale luminance map for fast scan
  const luma = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    luma[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Scan horizontal edges / borders
  // Input fields typically have a distinct top and bottom border (e.g. 1px solid line)
  // of width 60px to 800px and height 20px to 60px
  const stepY = 2;
  const minFieldW = Math.max(50, Math.round(width * 0.08));
  const maxFieldW = Math.round(width * 0.95);
  const minFieldH = 16;
  const maxFieldH = Math.min(120, Math.round(height * 0.4));

  const detectedRects: { x: number; y: number; w: number; h: number; hasDots: boolean }[] = [];

  for (let y = 10; y < height - minFieldH; y += stepY) {
    let runStartX = -1;

    for (let x = 10; x < width - 10; x++) {
      const idx = y * width + x;
      const topIdx = (y - 1) * width + x;
      const bottomIdx = (y + 1) * width + x;

      // Gradient in vertical direction (border edge)
      const gradTop = Math.abs(luma[idx] - luma[topIdx]);
      const gradBottom = Math.abs(luma[idx] - luma[bottomIdx]);
      const isEdge = gradTop > 18 || gradBottom > 18;

      if (isEdge) {
        if (runStartX === -1) runStartX = x;
      } else {
        if (runStartX !== -1) {
          const runW = x - runStartX;
          if (runW >= minFieldW && runW <= maxFieldW) {
            // Check if there is a corresponding bottom edge ~ 20px - 60px below
            for (let h = minFieldH; h <= maxFieldH; h += 2) {
              const targetY = y + h;
              if (targetY >= height - 5) break;

              // Check if bottom edge exists across the same span
              let bottomEdgeHits = 0;
              const sampleSteps = 8;
              const sampleStride = Math.max(1, Math.floor(runW / sampleSteps));

              for (let sx = runStartX; sx < runStartX + runW; sx += sampleStride) {
                const bIdx = targetY * width + sx;
                const bTopIdx = (targetY - 1) * width + sx;
                const bBottomIdx = (targetY + 1) * width + sx;
                if (Math.abs(luma[bIdx] - luma[bTopIdx]) > 14 || Math.abs(luma[bIdx] - luma[bBottomIdx]) > 14) {
                  bottomEdgeHits++;
                }
              }

              if (bottomEdgeHits >= Math.floor(sampleSteps * 0.5)) {
                // Check if inside the box there are password dots (bullet clusters)
                let hasDots = false;
                const midY = y + Math.round(h / 2);
                let dotPeaks = 0;
                for (let dx = runStartX + 10; dx < runStartX + Math.min(runW - 10, 160); dx += 2) {
                  const cIdx = midY * width + dx;
                  const cPrev = midY * width + (dx - 2);
                  if (Math.abs(luma[cIdx] - luma[cPrev]) > 30) {
                    dotPeaks++;
                  }
                }
                if (dotPeaks >= 6) {
                  hasDots = true;
                }

                detectedRects.push({
                  x: runStartX,
                  y,
                  w: runW,
                  h,
                  hasDots,
                });
                break;
              }
            }
          }
          runStartX = -1;
        }
      }
    }
  }

  // Filter overlapping and duplicate rects
  for (const rect of detectedRects) {
    const alreadyIncluded = foundBoxes.some((fb) => {
      const b = fb.boundingBox;
      const xOverlap = Math.abs(b.x - rect.x) < 20 && Math.abs(b.width - rect.w) < 30;
      const yOverlap = Math.abs(b.y - rect.y) < 15 && Math.abs(b.height - rect.h) < 15;
      return xOverlap && yOverlap;
    });

    if (!alreadyIncluded) {
      foundBoxes.push({
        boundingBox: createBox(rect.x, rect.y, rect.w, rect.h),
        hasMaskedContent: rect.hasDots,
        confidence: 0.85,
      });
    }
  }

  return foundBoxes;
}

/**
 * Identifies sensitive text fields and values from OCR words and visual input boxes.
 * Links labels to their corresponding input fields or values.
 */
export function detectVisualSensitiveFields(
  pixelBuffer: PixelBuffer,
  ocrWords: OcrWordMatch[],
  rawImageWidth: number,
  _rawImageHeight: number
): DetectedRegion[] {
  const regions: DetectedRegion[] = [];
  let regionIdCounter = 0;

  // 1. Detect visual form input boxes in the image
  const visualBoxes = detectVisualInputBoxes(pixelBuffer);

  // Group OCR words into lines/phrases by Y coordinate
  const lines: { text: string; words: OcrWordMatch[]; box: BoundingBox }[] = [];
  const sortedWords = [...ocrWords].sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);

  for (const w of sortedWords) {
    const matchingLine = lines.find((l) => {
      const yDiff = Math.abs(l.box.y - w.boundingBox.y);
      const hAvg = (l.box.height + w.boundingBox.height) / 2;
      return yDiff < Math.max(10, hAvg * 0.7);
    });

    if (matchingLine) {
      matchingLine.words.push(w);
      matchingLine.text += ' ' + w.text;
      const minX = Math.min(matchingLine.box.x, w.boundingBox.x);
      const minY = Math.min(matchingLine.box.y, w.boundingBox.y);
      const maxX = Math.max(matchingLine.box.x + matchingLine.box.width, w.boundingBox.x + w.boundingBox.width);
      const maxY = Math.max(matchingLine.box.y + matchingLine.box.height, w.boundingBox.y + w.boundingBox.height);
      matchingLine.box = createBox(minX, minY, maxX - minX, maxY - minY);
    } else {
      lines.push({
        text: w.text,
        words: [w],
        box: { ...w.boundingBox },
      });
    }
  }

  // 2. Scan every OCR line and word for sensitive field labels
  const processedBoxes = new Set<VisualInputField>();

  for (const line of lines) {
    const labelCategory = matchLabelToSensitiveCategory(line.text);
    if (!labelCategory) continue;

    const labelBox = line.box;

    // Search for an input box or text line positioned:
    // A) Directly below the label (within 50px below)
    // B) Directly to the right of the label (within 200px to the right)
    let matchedInput: BoundingBox | null = null;

    // Check visual boxes first
    const candidateVisualBox = visualBoxes.find((vb) => {
      if (processedBoxes.has(vb)) return false;
      const box = vb.boundingBox;
      // Below label
      const isBelow = box.y >= labelBox.y + labelBox.height - 5 && box.y <= labelBox.y + labelBox.height + 60;
      const isXAligned = Math.abs(box.x - labelBox.x) < 80 || (box.x <= labelBox.x && box.x + box.width >= labelBox.x);
      if (isBelow && isXAligned) return true;

      // To the right of label
      const isRight = box.x >= labelBox.x + labelBox.width - 10 && box.x <= labelBox.x + labelBox.width + 250;
      const isYAligned = Math.abs(box.y - labelBox.y) < 25;
      return isRight && isYAligned;
    });

    if (candidateVisualBox) {
      processedBoxes.add(candidateVisualBox);
      matchedInput = candidateVisualBox.boundingBox;
    } else {
      // Check if there is an OCR line/word below or to the right containing the value
      const candidateOcrLine = lines.find((otherLine) => {
        if (otherLine === line) return false;
        const oBox = otherLine.box;
        const isBelow = oBox.y >= labelBox.y + labelBox.height - 2 && oBox.y <= labelBox.y + labelBox.height + 50;
        const isXAligned = Math.abs(oBox.x - labelBox.x) < 60;
        return isBelow && isXAligned;
      });

      if (candidateOcrLine) {
        // Expand bounding box slightly for input field padding
        matchedInput = createBox(
          candidateOcrLine.box.x - 4,
          candidateOcrLine.box.y - 4,
          candidateOcrLine.box.width + 12,
          candidateOcrLine.box.height + 8
        );
      } else {
        // Construct estimated input box directly beneath label
        const estW = Math.max(140, Math.min(320, rawImageWidth * 0.35));
        const estH = Math.max(26, labelBox.height + 10);
        matchedInput = createBox(
          labelBox.x,
          labelBox.y + labelBox.height + 6,
          estW,
          estH
        );
      }
    }

    if (matchedInput) {
      regions.push({
        id: `img_sens_field_${++regionIdCounter}`,
        category: labelCategory,
        confidence: 0.94,
        boundingBox: matchedInput,
        source: 'ocr',
        recommendedRedaction:
          labelCategory === 'password' || labelCategory === 'security_code' || labelCategory === 'api_key'
            ? 'solid_rectangle'
            : 'semantic_label',
        label: formatRedactionLabel(labelCategory),
        sanitizedHint: `Visual field (${labelCategory})`,
      });
    }
  }

  // 3. Inspect any visual box with masked dots/bullets (e.g. password fields)
  for (const vb of visualBoxes) {
    if (vb.hasMaskedContent && !processedBoxes.has(vb)) {
      processedBoxes.add(vb);
      regions.push({
        id: `img_masked_${++regionIdCounter}`,
        category: 'password',
        confidence: 0.95,
        boundingBox: vb.boundingBox,
        source: 'ocr',
        recommendedRedaction: 'solid_rectangle',
        label: '[PASSWORD REDACTED]',
        sanitizedHint: 'Masked input field',
      });
    }
  }

  // 4. Also scan OCR words directly for masked bullets / dots (e.g. '••••••••', '***')
  for (const w of ocrWords) {
    const isMaskedDots = /^[•\*\.●]{3,}$/.test(w.text.trim()) || w.text.includes('••••');
    if (isMaskedDots) {
      regions.push({
        id: `img_masked_dots_${++regionIdCounter}`,
        category: 'password',
        confidence: 0.96,
        boundingBox: w.boundingBox,
        source: 'ocr',
        recommendedRedaction: 'solid_rectangle',
        label: '[PASSWORD REDACTED]',
        sanitizedHint: 'Masked characters',
      });
    }
  }

  return regions;
}
