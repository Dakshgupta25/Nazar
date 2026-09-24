/**
 * NAZAR Redaction Engine Schema & Types (Phase 3)
 */

import { BoundingBox, ExtractedDomElement } from './dom';
import { SensitiveCategory } from './privacy';

export type RedactionMode =
  | 'semantic_label'
  | 'solid_rectangle'
  | 'blur'
  | 'pixelate';

export interface RedactionItem {
  id: string;
  detectionId: string;
  category: SensitiveCategory;
  mode: RedactionMode;
  label: string; // e.g. "[EMAIL REDACTED]", "[FACE REDACTED]"
  boundingBox: BoundingBox; // Padded & clamped bounding box
  originalBoundingBox: BoundingBox; // Pre-padding box
  appliedPadding: number;
  customLabel?: string;
  timestamp: number;
}

export interface RedactionOptions {
  defaultMode?: RedactionMode;
  paddingPx?: number; // Safety padding around detections (default 4px)
  blurRadius?: number; // Blur intensity (default 10)
  pixelateBlockSize?: number; // Pixelation block size (default 8)
  solidFillColor?: string; // Solid rectangle fill hex (default #0f172a)
  semanticTextColor?: string; // Semantic label text color (default #f8fafc)
  semanticBgColor?: string; // Semantic label background (default #1e293b)
  enableResidualScan?: boolean; // Run safety check on sanitized text/DOM (default true)
}

export interface SanitizedImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  dataUrl?: string; // Optional base64 representation if generated via canvas
}

export interface SanitizedStructuredContext {
  url: string;
  title: string;
  timestamp: number;
  elements: ExtractedDomElement[];
  redactedCount: number;
  appliedRedactions: RedactionItem[];
}

export interface RedactionAuditMetadata {
  totalRedactions: number;
  byCategory: Partial<Record<SensitiveCategory, number>>;
  byMode: Partial<Record<RedactionMode, number>>;
  averagePadding: number;
  processingTimeMs: number;
}

export interface SanitizedResult {
  sanitizationId: string;
  timestamp: number;
  items: RedactionItem[];
  sanitizedImage?: SanitizedImageData;
  sanitizedDom?: SanitizedStructuredContext;
  residualScanPassed: boolean;
  residualViolations: string[];
  metadata: RedactionAuditMetadata;
}
