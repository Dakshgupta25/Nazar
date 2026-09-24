/**
 * Evaluation and Performance Benchmark Type Definitions (Phase 10)
 */

export interface SystemResourceMetrics {
  heapUsedBytes: number | 'unmeasured';
  heapTotalBytes: number | 'unmeasured';
  externalBytes: number | 'unmeasured';
  rssBytes: number | 'unmeasured';
  cpuUserMicroseconds: number | 'unmeasured';
  cpuSystemMicroseconds: number | 'unmeasured';
}

export interface PipelineLatencyMetrics {
  extensionStartupMs: number;
  modelLoadingMs: number;
  screenshotCaptureMs: number;
  domExtractionMs: number;
  ocrMs: number;
  faceDetectionMs: number;
  piiDetectionMs: number;
  fusionMs: number;
  redactionMs: number;
  previewRenderingMs: number;
  endToEndPrivacyScanMs: number;
  resources: SystemResourceMetrics;
}

export type RealWorldScenarioType =
  | 'normal_html'
  | 'large_page'
  | 'dynamic_react'
  | 'form_heavy'
  | 'image_heavy'
  | 'canvas_content'
  | 'pdf_embedded'
  | 'dark_mode'
  | 'light_mode'
  | 'low_resolution_image'
  | 'multiple_faces'
  | 'multiple_pii_regions';

export interface ScenarioEvaluationResult {
  scenario: RealWorldScenarioType;
  description: string;
  elementsAnalyzed: number;
  sensitiveRegionsDetected: number;
  redactionsProduced: number;
  latencyMs: number;
  contextPreservationRatio: number; // [0, 1] preserved non-sensitive elements / total non-sensitive
  status: 'passed' | 'failed';
  notes?: string;
}

export interface DetectionQualityMetrics {
  totalTestCases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  localizationQuality: number; // Average IoU / overlap score [0, 1]
  contextPreservation: number; // Ratio of non-sensitive text left intact [0, 1]
  latency: {
    averageMs: number;
    minMs: number;
    maxMs: number;
    p95Ms: number;
  };
}

export interface ComprehensiveEvaluationReport {
  timestamp: number;
  pipelineLatency: PipelineLatencyMetrics;
  scenarios: Record<RealWorldScenarioType, ScenarioEvaluationResult>;
  quality: DetectionQualityMetrics;
  optimizationsApplied: string[];
}
