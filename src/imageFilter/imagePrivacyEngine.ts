/**
 * NAZAR Local Image Privacy Engine (Phase 7 - Feature 2)
 *
 * Standalone privacy detection and redaction engine for uploaded images.
 * Operates purely locally on the client without DOM information or cloud APIs.
 *
 * Workflow:
 * Upload image -> Local OCR + Local Face + Local PII/Secret -> Detection Fusion -> Redaction -> Preview / Copy / Save
 */

import { DetectedRegion, PrivacyScanLatency, SensitiveCategory } from '../types/privacy';
import { ImageFilterOptions, LocalImageScanResult } from '../types/imageFilter';
import { performLocalOcr } from '../privacy/ocrDetector';
import { detectFacesLocally } from '../privacy/faceDetector';
import { scanTextForPii } from '../privacy/piiDetector';
import { fuseDetections, formatRedactionLabel } from '../privacy/fusionEngine';
import { createRedactionItems } from '../redaction/redactionEngine';
import { PixelBuffer, redactPixelBuffer } from '../redaction/pixelRedactor';
import { extractPixelBufferFromDataUrl } from './imageExport';
import { ModelManager } from '../modelManager/modelManager';

/**
 * Executes a full local privacy scan and redaction on a standalone image without DOM context.
 */
export async function scanLocalImage(
  imageSource: string | PixelBuffer,
  options: ImageFilterOptions = {},
  filename = 'uploaded-image.png'
): Promise<LocalImageScanResult> {
  // Phase 8 Fail-Closed Capability Verification
  if (options.enforceModelCapabilities) {
    const check = ModelManager.getInstance().verifyCapabilitiesOrBlock([
      'ocr',
      'face_detection',
      'pii_detection',
    ]);
    if (!check.allowed) {
      throw new Error(check.reason);
    }
  }

  const startTime = performance.now();
  const rawRegions: DetectedRegion[] = [];
  let regionCounter = 0;

  let width = 640;
  let height = 480;
  let dataUrl = '';
  let pixelBuffer: PixelBuffer;

  if (typeof imageSource === 'string') {
    dataUrl = imageSource;
    pixelBuffer = await extractPixelBufferFromDataUrl(dataUrl, width, height);
    width = pixelBuffer.width;
    height = pixelBuffer.height;
  } else {
    pixelBuffer = imageSource;
    width = pixelBuffer.width;
    height = pixelBuffer.height;
    dataUrl = `data:image/png;base64,mock_${width}x${height}`;
  }

  // 1. Local OCR (Without DOM)
  const ocrStart = performance.now();
  const ocrWords = await performLocalOcr(dataUrl, options.ocrHints);
  const ocrMs = Math.round(performance.now() - ocrStart);

  // 2. Local PII & Secret Pattern Detection on OCR Words
  const piiStart = performance.now();
  
  // Single-word scanning
  for (const word of ocrWords) {
    const piiMatches = scanTextForPii(word.text);
    for (const match of piiMatches) {
      rawRegions.push({
        id: `img_pii_${++regionCounter}`,
        category: match.category,
        confidence: match.confidence,
        boundingBox: word.boundingBox,
        source: 'ocr',
        recommendedRedaction: match.category === 'secret_key' || match.category === 'password' || match.category === 'api_key'
          ? 'solid_rectangle'
          : 'semantic_label',
        label: formatRedactionLabel(match.category),
        sanitizedHint: `Detected ${match.category}`,
      });
    }
  }

  // Multi-word phrase scanning (e.g. addresses, full names, multi-part phone numbers)
  if (ocrWords.length > 1) {
    const fullPhrase = ocrWords.map((w) => w.text).join(' ');
    const phraseMatches = scanTextForPii(fullPhrase);
    
    for (const match of phraseMatches) {
      // Find bounding span across words
      const matchingWords = ocrWords.slice(0, 5); // approximate span
      if (matchingWords.length > 0) {
        const minX = Math.min(...matchingWords.map((w) => w.boundingBox.x));
        const minY = Math.min(...matchingWords.map((w) => w.boundingBox.y));
        const maxX = Math.max(...matchingWords.map((w) => w.boundingBox.x + w.boundingBox.width));
        const maxY = Math.max(...matchingWords.map((w) => w.boundingBox.y + w.boundingBox.height));

        rawRegions.push({
          id: `img_phrase_${++regionCounter}`,
          category: match.category,
          confidence: match.confidence,
          boundingBox: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            top: minY,
            left: minX,
            bottom: maxY,
            right: maxX,
          },
          source: 'ocr',
          recommendedRedaction: 'semantic_label',
          label: formatRedactionLabel(match.category),
          sanitizedHint: `Detected ${match.category} phrase`,
        });
      }
    }
  }
  const piiMs = Math.round(performance.now() - piiStart);

  // 3. Local Face Detection
  const faceStart = performance.now();
  const faceMatches = await detectFacesLocally(dataUrl);
  for (const face of faceMatches) {
    rawRegions.push({
      id: `img_face_${++regionCounter}`,
      category: 'face',
      confidence: face.confidence,
      boundingBox: face.boundingBox,
      source: 'face',
      recommendedRedaction: 'blur',
      label: '[FACE REDACTED]',
      sanitizedHint: 'Human Face',
    });
  }
  const faceMs = Math.round(performance.now() - faceStart);

  // 4. Detection Normalization & Fusion
  const fusionStart = performance.now();
  const fusedRegions = fuseDetections(rawRegions);
  const fusionMs = Math.round(performance.now() - fusionStart);

  // 5. Redaction Transformation
  const redactionItems = createRedactionItems(
    fusedRegions,
    {
      paddingPx: options.paddingPx ?? 4,
      defaultMode: options.defaultMode,
    },
    { width, height }
  );

  const sanitizedImage = redactPixelBuffer(
    pixelBuffer,
    redactionItems,
    { defaultMode: options.defaultMode }
  );

  const totalMs = Math.round(performance.now() - startTime);

  const byCategory: Partial<Record<SensitiveCategory, number>> = {};
  const bySource: Partial<Record<string, number>> = {};
  for (const r of fusedRegions) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
  }

  const latency: PrivacyScanLatency = {
    domMs: 0, // Standalone image has no DOM processing
    ocrMs,
    faceMs,
    piiMs,
    fusionMs,
    totalMs,
  };

  return {
    imageId: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    filename,
    width,
    height,
    dataUrl,
    detections: fusedRegions,
    redactionItems,
    sanitizedImage,
    latency,
    stats: {
      totalDetected: fusedRegions.length,
      byCategory,
      bySource,
    },
  };
}
