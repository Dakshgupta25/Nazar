import { CapturedContextPayload } from '../types/messages';
import {
  DetectedRegion,
  PrivacyScanLatency,
  PrivacyScanResult,
  SensitiveCategory,
} from '../types/privacy';
import { analyzeDomSensitivity } from './domAnalyzer';
import { performLocalOcr } from './ocrDetector';
import { detectFacesLocally } from './faceDetector';
import { scanTextForPii } from './piiDetector';
import { fuseDetections, formatRedactionLabel } from './fusionEngine';
import { ModelManager } from '../modelManager/modelManager';
import { BoundingBox } from '../types/dom';

/**
 * Helper to scale a bounding box by devicePixelRatio if DOM coordinates were extracted in CSS pixels
 */
function scaleBoxByDpr(box: BoundingBox, dpr: number): BoundingBox {
  if (dpr === 1 || !dpr) return box;
  const x = Math.round(box.x * dpr);
  const y = Math.round(box.y * dpr);
  const width = Math.round(box.width * dpr);
  const height = Math.round(box.height * dpr);
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

export async function runPrivacyScan(
  captured: CapturedContextPayload,
  options?: { enforceModelCapabilities?: boolean }
): Promise<PrivacyScanResult> {
  // Phase 8 Fail-Closed Capability Verification
  if (options?.enforceModelCapabilities) {
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
  const dpr = captured.dom?.viewport?.devicePixelRatio || 1;

  // 1. DOM Sensitivity Analysis (Structured & Semantic Context)
  const domStart = performance.now();
  let domRegions: DetectedRegion[] = [];
  if (captured.dom && captured.dom.elements) {
    const extractedDomRegions = analyzeDomSensitivity(captured.dom);
    
    // Scale DOM bounding boxes by DPR so they align with screenshot image dimensions
    domRegions = extractedDomRegions.map((r) => ({
      ...r,
      boundingBox: scaleBoxByDpr(r.boundingBox, dpr),
    }));
    rawRegions.push(...domRegions);
    
    // Catch any remaining sensitive candidates
    for (const el of captured.dom.elements) {
      if (el.isSensitiveCandidate) {
        const alreadyDetected = domRegions.some((r) => r.elementSelector === el.selector);
        
        if (!alreadyDetected) {
          let category: SensitiveCategory = 'password';
          const inputType = el.inputType?.toLowerCase();
          const name = el.attributes['name']?.toLowerCase() || '';
          const id = el.id?.toLowerCase() || '';
          
          if (inputType === 'email' || name.includes('email') || id.includes('email')) {
            category = 'email';
          } else if (inputType === 'tel' || name.includes('phone') || id.includes('phone')) {
            category = 'phone';
          } else if (name.includes('card') || name.includes('credit')) {
            category = 'credit_card';
          }
          
          rawRegions.push({
            id: `dom_fallback_${el.id}`,
            category,
            confidence: 0.88,
            boundingBox: scaleBoxByDpr(el.boundingBox, dpr),
            source: 'dom',
            elementSelector: el.selector,
            recommendedRedaction: 'solid_rectangle',
            label: `[${category.toUpperCase().replace('_', ' ')} REDACTED]`,
            sanitizedHint: `Input field (${el.tagName})`,
          });
        }
      }
    }
  }
  const domMs = Math.round(performance.now() - domStart);

  // 2. OCR Visual Extraction + PII Regex Scanning on Visual Text
  let ocrMs = 0;
  let piiMs = 0;
  let faceMs = 0;

  if (captured.screenshotDataUrl) {
    try {
      const ocrStart = performance.now();
      const ocrWords = await performLocalOcr(captured.screenshotDataUrl);
      ocrMs = Math.round(performance.now() - ocrStart);

      const piiStart = performance.now();
      for (const word of ocrWords) {
        const piiMatches = scanTextForPii(word.text);
        for (const m of piiMatches) {
          rawRegions.push({
            id: `ocr_pii_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            category: m.category,
            confidence: m.confidence,
            boundingBox: word.boundingBox,
            source: 'ocr',
            recommendedRedaction:
              m.category === 'secret_key' || m.category === 'password' || m.category === 'api_key'
                ? 'solid_rectangle'
                : 'semantic_label',
            label: formatRedactionLabel(m.category),
            sanitizedHint: `Visual OCR (${m.category})`,
          });
        }
      }
      piiMs = Math.round(performance.now() - piiStart);
    } catch {
      // OCR fail-safe: continue with DOM detections
    }

    // 3. Visual Face Detection (Blur ONLY faces, not the entire image/document)
    try {
      const faceStart = performance.now();
      const faceMatches = await detectFacesLocally(captured.screenshotDataUrl);
      for (const face of faceMatches) {
        rawRegions.push({
          id: `face_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          category: 'face',
          confidence: face.confidence,
          boundingBox: face.boundingBox,
          source: 'face',
          recommendedRedaction: 'blur',
          label: '[FACE REDACTED]',
          sanitizedHint: 'Detected Human Face',
        });
      }
      faceMs = Math.round(performance.now() - faceStart);
    } catch {
      // Face detection fail-safe
    }
  }

  // 4. Detection Normalization & Fusion
  const fusionStart = performance.now();
  const fusedRegions = fuseDetections(rawRegions);
  const fusionMs = Math.round(performance.now() - fusionStart);

  const totalMs = Math.round(performance.now() - startTime);

  // Generate category and source stats
  const byCategory: Partial<Record<SensitiveCategory, number>> = {};
  const bySource: Partial<Record<string, number>> = {};

  for (const r of fusedRegions) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
  }

  const latency: PrivacyScanLatency = {
    domMs,
    ocrMs,
    faceMs,
    piiMs,
    fusionMs,
    totalMs,
  };

  console.info('[NAZAR] Privacy scan complete:', {
    totalDetected: fusedRegions.length,
    regions: fusedRegions,
    latency,
  });

  return {
    scanId: `scan_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
    timestamp: Date.now(),
    regions: fusedRegions,
    stats: {
      totalDetected: fusedRegions.length,
      byCategory,
      bySource,
    },
    latency,
  };
}
