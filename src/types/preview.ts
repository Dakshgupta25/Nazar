/**
 * NAZAR Editable Preview Editor Types (Phase 4)
 */

import { RedactionItem, SanitizedImageData, SanitizedStructuredContext } from './redaction';

export type ComparisonMode = 'sanitized' | 'original' | 'split' | 'side_by_side';

export type WorkflowState = 'idle' | 'editing' | 'approved' | 'cancelled';

export interface SanitizedArtifact {
  artifactId: string;
  approvalTimestamp: number;
  isUserApproved: true;
  contextUrl: string;
  contextTitle: string;
  redactionsCount: number;
  redactionsApplied: RedactionItem[];
  sanitizedImage?: SanitizedImageData;
  sanitizedDom?: SanitizedStructuredContext;
  residualScanPassed: boolean;
  securityChecksum: string;
}

export interface PreviewState {
  items: RedactionItem[];
  history: RedactionItem[][];
  historyIndex: number;
  selectedItemId: string | null;
  comparisonMode: ComparisonMode;
  zoom: number; // 0.25 to 4.0 (1.0 = 100%)
  pan: { x: number; y: number };
  splitPosition: number; // 0 to 100 percentage for split view
  workflowState: WorkflowState;
  approvedArtifact: SanitizedArtifact | null;
}

export interface PreviewEditorProps {
  originalImageUrl?: string;
  originalPixelBuffer?: {
    width: number;
    height: number;
    data: Uint8ClampedArray | Uint8Array;
  };
  initialRedactions: RedactionItem[];
  domContext?: SanitizedStructuredContext;
  onApprove?: (artifact: SanitizedArtifact) => void;
  onCancel?: () => void;
  popupSize?: 'S' | 'M' | 'L';
}
