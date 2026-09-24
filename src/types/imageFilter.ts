/**
 * NAZAR Local Image Privacy Filter Types (Phase 7 - Feature 2)
 */

import { BoundingBox } from './dom';
import { DetectedRegion, PrivacyScanLatency, SensitiveCategory } from './privacy';
import { RedactionItem, RedactionMode, SanitizedImageData } from './redaction';

export interface ImageFilterOptions {
  paddingPx?: number;
  defaultMode?: RedactionMode; // 'semantic_label' | 'blackout' | 'blur' | 'pixelate'
  ocrHints?: { text: string; box: BoundingBox }[];
  preserveOriginalInMemory?: boolean;
  enforceModelCapabilities?: boolean;
}

export interface LocalImageScanResult {
  imageId: string;
  filename: string;
  width: number;
  height: number;
  dataUrl: string;
  detections: DetectedRegion[];
  redactionItems: RedactionItem[];
  sanitizedImage?: SanitizedImageData;
  latency: PrivacyScanLatency;
  stats: {
    totalDetected: number;
    byCategory: Partial<Record<SensitiveCategory, number>>;
    bySource: Partial<Record<string, number>>;
  };
}
