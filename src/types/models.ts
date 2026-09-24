/**
 * NAZAR Model Management & Offline Operation Types (Phase 8)
 */

export type ModelCapability = 'ocr' | 'face_detection' | 'pii_detection';

export type ModelStatus = 
  | 'ready'          // Installed and SHA-256 verified
  | 'missing'        // Not downloaded yet
  | 'downloading'    // Currently downloading
  | 'corrupted'      // SHA-256 verification failed
  | 'interrupted'    // Download aborted or network error
  | 'unavailable';   // Remote source unreachable or offline

export interface ModelMetadata {
  id: string;
  name: string;
  capability: ModelCapability;
  version: string;
  sizeBytes: number;
  license: string;
  sha256: string;
  downloadUrl: string;
  description: string;
}

export interface StoredModelAsset {
  id: string;
  version: string;
  data: ArrayBuffer;
  sha256: string;
  installedAt: number;
  sizeBytes: number;
}

export interface ModelDownloadProgress {
  modelId: string;
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface ModelCapabilityStatus {
  capability: ModelCapability;
  name: string;
  modelId: string;
  status: ModelStatus;
  version: string;
  sizeBytes: number;
  license: string;
  verified: boolean;
  errorMessage?: string;
  progress?: number; // 0 to 100
}

export interface PrivacyEngineHealth {
  overallStatus: 'ready' | 'degraded' | 'blocked';
  isOfflineReady: boolean;
  isOnline: boolean;
  capabilities: Record<ModelCapability, ModelCapabilityStatus>;
  missingCapabilities: ModelCapability[];
  allVerified: boolean;
}

export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
  missingCapabilities: ModelCapability[];
}
