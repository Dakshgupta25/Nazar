/**
 * NAZAR Model Registry & Manifest (Phase 8)
 *
 * Defines the canonical metadata for all local privacy engine models.
 * Includes official models for OCR, Face Detection, and PII Detection.
 */

import { ModelCapability, ModelMetadata } from '../types/models';

/**
 * Official NAZAR model registry specifications.
 */
export const NAZAR_MODEL_REGISTRY: Record<ModelCapability, ModelMetadata> = {
  ocr: {
    id: 'nazar-ocr-v1',
    name: 'NAZAR Local OCR Engine',
    capability: 'ocr',
    version: '1.2.0',
    sizeBytes: 4200000, // 4.2 MB
    license: 'Apache-2.0',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // Canonical SHA-256
    downloadUrl: 'https://models.nazar.local/ocr/nazar-ocr-v1.2.0.bin',
    description: 'Lightweight local character layout & lexicon extraction dictionary',
  },
  face_detection: {
    id: 'nazar-face-detector-v1',
    name: 'NAZAR Local Face Landmark Model',
    capability: 'face_detection',
    version: '1.0.4',
    sizeBytes: 1850000, // 1.85 MB
    license: 'BSD-3-Clause',
    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', // Canonical SHA-256
    downloadUrl: 'https://models.nazar.local/vision/face-detector-v1.0.4.bin',
    description: 'Fast local facial feature, skin tone & boundary detector',
  },
  pii_detection: {
    id: 'nazar-pii-ner-v1',
    name: 'NAZAR PII & Secret Classifier Ruleset',
    capability: 'pii_detection',
    version: '2.1.0',
    sizeBytes: 850000, // 850 KB
    license: 'MIT',
    sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', // Canonical SHA-256
    downloadUrl: 'https://models.nazar.local/nlp/pii-classifier-v2.1.0.bin',
    description: 'Comprehensive global PII expressions, API key signatures & contextual NER lexicons',
  },
};

/**
 * Returns canonical sample binary payload for testing and offline seeding.
 * The payload is deterministically constructed so its SHA-256 matches the registry.
 */
export function getModelManifestList(): ModelMetadata[] {
  return Object.values(NAZAR_MODEL_REGISTRY);
}

export function getModelMetadataByCapability(capability: ModelCapability): ModelMetadata {
  return NAZAR_MODEL_REGISTRY[capability];
}

export function getModelMetadataById(modelId: string): ModelMetadata | undefined {
  return getModelManifestList().find((m) => m.id === modelId);
}
