/**
 * NAZAR Privacy Detection and Fusion Schema Definitions
 */

import { BoundingBox } from './dom';

export type SensitiveCategory =
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'postal_code'
  | 'credit_card'
  | 'bank_account'
  | 'aadhaar'
  | 'passport'
  | 'drivers_license'
  | 'password'
  | 'api_key'
  | 'access_token'
  | 'secret_key'
  | 'security_code'
  | 'session_url'
  | 'face';

export type DetectionSource = 'dom' | 'ocr' | 'face' | 'regex_pattern' | 'fusion';

export type RecommendedRedactionMode =
  | 'semantic_label'
  | 'solid_rectangle'
  | 'blur'
  | 'pixelate';

export interface DetectedRegion {
  id: string;
  category: SensitiveCategory;
  confidence: number; // 0.0 to 1.0
  boundingBox: BoundingBox;
  source: DetectionSource;
  elementSelector?: string;
  recommendedRedaction: RecommendedRedactionMode;
  label: string; // e.g., "[EMAIL REDACTED]"
  sanitizedHint?: string; // non-sensitive hint e.g. "email (length 18)"
}

export interface OcrWordMatch {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
}

export interface FaceMatch {
  confidence: number;
  boundingBox: BoundingBox;
}

export interface PrivacyScanLatency {
  domMs: number;
  ocrMs: number;
  faceMs: number;
  piiMs: number;
  fusionMs: number;
  totalMs: number;
}

export interface PrivacyScanResult {
  scanId: string;
  timestamp: number;
  regions: DetectedRegion[];
  stats: {
    totalDetected: number;
    byCategory: Partial<Record<SensitiveCategory, number>>;
    bySource: Partial<Record<DetectionSource, number>>;
  };
  latency: PrivacyScanLatency;
}
