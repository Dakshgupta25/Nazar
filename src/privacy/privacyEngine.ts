/**
 * Unified Local Privacy Engine:
 * Coordinates DOM analysis, OCR extraction, face detection, PII regex pattern matching,
 * and detection fusion into a single, high-performance, strictly local privacy scanner.
 */

import { CapturedContextPayload } from '../types/messages';
import {
  DetectedRegion,
  PrivacyScanLatency,
  PrivacyScanResult,
  SensitiveCategory,
} from '../types/privacy';
import { analyzeDomSensitivity } from './domAnalyzer';
import { detectFacesLocally } from './faceDetector';
import { fuseDetections } from './fusionEngine';
import { performLocalOcr } from './ocrDetector';
import { scanTextForPii } from './piiDetector';
import { ModelManager } from '../modelManager/modelManager';

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
  let regionCounter = 0;

  // 1. DOM Sensitivity Analysis
  const domStart = performance.now();
  const domRegions = analyzeDomSensitivity(captured.dom);
  rawRegions.push(...domRegions);
  const domMs = Math.round(performance.now() - domStart);

  // 2. Local OCR Extraction
  const ocrStart = performance.now();
  const textBlocks = captured.dom.elements
    .filter((e) => e.textContent && e.textContent.length > 0)
    .map((e) => ({ text: e.textContent!, box: e.boundingBox }));

  const ocrWords = await performLocalOcr(captured.screenshotDataUrl, textBlocks);
  const ocrMs = Math.round(performance.now() - ocrStart);

  // 3. PII & Secret Scanning on OCR Words
  const piiStart = performance.now();
  for (const ocrWord of ocrWords) {
    const piiMatches = scanTextForPii(ocrWord.text);
    for (const match of piiMatches) {
      rawRegions.push({
        id: `ocr_pii_${++regionCounter}`,
        category: match.category,
        confidence: match.confidence,
        boundingBox: ocrWord.boundingBox,
        source: 'ocr',
        recommendedRedaction: 'semantic_label',
        label: `[${match.category.toUpperCase().replace('_', ' ')} REDACTED]`,
        sanitizedHint: `OCR word`,
      });
    }
  }
  const piiMs = Math.round(performance.now() - piiStart);

  // 4. Local Face Detection
  const faceStart = performance.now();
  const faceMatches = await detectFacesLocally(captured.screenshotDataUrl);
  for (const face of faceMatches) {
    rawRegions.push({
      id: `face_${++regionCounter}`,
      category: 'face',
      confidence: face.confidence,
      boundingBox: face.boundingBox,
      source: 'face',
      recommendedRedaction: 'blur',
      label: '[FACE REDACTED]',
      sanitizedHint: 'Face region',
    });
  }
  const faceMs = Math.round(performance.now() - faceStart);

  // 5. Detection Normalization & Fusion
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
